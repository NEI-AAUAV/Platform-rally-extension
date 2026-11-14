"""Permanently delete an event edition and everything that happened in it.

Meant for test editions. Most tables reference ``rally_events`` (directly or
through teams/checkpoints/activities) without ``ON DELETE CASCADE``, so the
rows are removed here explicitly, children before parents, in one transaction.

Safety rules:
- the current edition is never deletable (public reads resolve to it);
- an edition whose rally window is open is never deletable;
- real accounts survive: they are only detached from the edition's teams and
  posts. Name-only placeholder members belong to the edition and go with it.
- uploaded images are removed from storage only after the commit, and only
  when no surviving row still points at them (a cloned edition shares the
  source's URLs).
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Select, delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.models.activity import Activity, ActivityResult, RallyEvent
from app.models.badge import TeamBadge
from app.models.badge_definition import BadgeDefinition
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.checkpoint_guide_indication import CheckpointGuideIndication
from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.models.checkpoint_media import CheckpointMedia
from app.models.checkpoint_skip import CheckpointSkip
from app.models.dynamic_scoring import DynamicAward, DynamicRule
from app.models.evaluation_history import EvaluationHistory
from app.models.participation import EventParticipation
from app.models.rally_guide_assignment import RallyGuideAssignment
from app.models.rally_settings import RallySettings
from app.models.rally_staff_assignment import RallyStaffAssignment
from app.models.route_stage import RouteStage
from app.models.team import Team
from app.models.user import User
from app.services.audit_service import AuditActor, record_audit
from app.services.event_service import EVENT_NOT_FOUND
from app.services.storage import storage_client
from app.services.team_service import is_rally_window_open

logger = logging.getLogger(__name__)

CURRENT_EVENT_NOT_DELETABLE = (
    "Não é possível eliminar a edição atual. Define outra edição como atual primeiro."
)
RUNNING_EVENT_NOT_DELETABLE = "Não é possível eliminar uma edição com o rally a decorrer."
CONFIRM_NAME_MISMATCH = "O nome escrito não coincide com o nome da edição."

# Every column that may hold an uploaded file URL owned by an edition. Used to
# collect the doomed edition's files and to check nothing else still uses them.
_URL_COLUMNS: tuple[tuple[type[Any], Any], ...] = (
    (CheckPoint, CheckPoint.clue_media_url),
    (CheckpointMedia, CheckpointMedia.image_url),
    (Team, Team.photo_url),
    (BadgeDefinition, BadgeDefinition.icon_url),
    (RallySettings, RallySettings.banner_url),
    (RallySettings, RallySettings.logo_url),
    (RallySettings, RallySettings.favicon_url),
    (RallySettings, RallySettings.aauav_logo_url),
    (RallySettings, RallySettings.aauav_logo_dark_url),
    (RallySettings, RallySettings.rules_pdf_url),
)


def _partner_logo_urls(value: Any) -> set[str]:
    """Every ``url``/``dark_url`` in a ``partner_logos`` JSON value.

    Read raw rather than through ``normalize_partner_logos``: that helper caps
    and filters for display, and a file must count as used even then.
    """
    if not isinstance(value, list):
        return set()
    return {
        url
        for item in value
        if isinstance(item, dict)
        for url in (item.get("url"), item.get("dark_url"))
        if isinstance(url, str) and url
    }


@dataclass(frozen=True)
class _EventRows:
    team_ids: tuple[int, ...]
    checkpoint_ids: tuple[int, ...]
    activity_ids: tuple[int, ...]
    result_ids: tuple[int, ...]


class EventPurgeService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def purge(self, event_id: int, *, confirm_name: str, actor: AuditActor) -> dict[str, int]:
        """Delete ``event_id`` and all its data; return row counts per table.

        ``confirm_name`` must repeat the edition's name exactly, so a stale
        tab or a wrong id can never delete the wrong edition.
        """
        event = await self._deletable_event_or_raise(event_id, confirm_name)
        event_name = event.name
        rows = await self._collect_rows(event_id)
        urls = await self._collect_urls(event_id, rows)

        try:
            counts = await self._delete_scoring(rows)
            counts |= await self._detach_people(event_id, rows)
            counts |= await self._delete_structure(event_id, rows)
            await self._db.execute(delete(RallyEvent).where(RallyEvent.id == event_id))
            await self._db.commit()
        except Exception:
            await self._db.rollback()
            logger.exception("Failed to purge event %s", event_id)
            raise

        self._expunge_event(event)
        await self._delete_orphaned_files(urls)
        await record_audit(
            self._db,
            action="event.delete",
            actor=actor,
            target_type="event",
            target_id=str(event_id),
            event_id=None,
            note=f"Edição '{event_name}' eliminada: {counts}",
        )
        return counts

    async def _deletable_event_or_raise(self, event_id: int, confirm_name: str) -> RallyEvent:
        event = await self._db.get(RallyEvent, event_id)
        if event is None:
            raise RallyNotFoundError(EVENT_NOT_FOUND)
        if confirm_name.strip() != event.name.strip():
            raise RallyValidationError(CONFIRM_NAME_MISMATCH)
        if event.is_current:
            raise RallyValidationError(CURRENT_EVENT_NOT_DELETABLE)
        settings = await self._db.scalar(
            select(RallySettings).where(RallySettings.event_id == event_id)
        )
        if settings is not None and is_rally_window_open(settings, datetime.now(UTC)):
            raise RallyValidationError(RUNNING_EVENT_NOT_DELETABLE)
        return event

    async def _ids(self, stmt: Select[tuple[int]]) -> tuple[int, ...]:
        return tuple((await self._db.scalars(stmt)).all())

    async def _collect_rows(self, event_id: int) -> _EventRows:
        team_ids = await self._ids(select(Team.id).where(Team.event_id == event_id))
        checkpoint_ids = await self._ids(
            select(CheckPoint.id).where(CheckPoint.event_id == event_id)
        )
        activity_ids = await self._ids(select(Activity.id).where(Activity.event_id == event_id))
        result_ids = await self._ids(
            select(ActivityResult.id).where(
                or_(
                    ActivityResult.team_id.in_(team_ids),
                    ActivityResult.activity_id.in_(activity_ids),
                )
            )
        )
        return _EventRows(team_ids, checkpoint_ids, activity_ids, result_ids)

    async def _collect_urls(self, event_id: int, rows: _EventRows) -> set[str]:
        owners: dict[type[Any], Any] = {
            CheckPoint: CheckPoint.id.in_(rows.checkpoint_ids),
            CheckpointMedia: CheckpointMedia.checkpoint_id.in_(rows.checkpoint_ids),
            Team: Team.event_id == event_id,
            BadgeDefinition: BadgeDefinition.event_id == event_id,
            RallySettings: RallySettings.event_id == event_id,
        }
        urls: set[str] = set()
        for model, column in _URL_COLUMNS:
            values = await self._db.scalars(select(column).where(owners[model]))
            urls.update(url for url in values if url)
        logos = await self._db.scalar(
            select(RallySettings.partner_logos).where(RallySettings.event_id == event_id)
        )
        return urls | _partner_logo_urls(logos)

    async def _delete_where(self, label: str, stmt: Any) -> dict[str, int]:
        result = await self._db.execute(stmt)
        return {label: result.rowcount or 0}  # type: ignore[attr-defined]

    async def _delete_scoring(self, rows: _EventRows) -> dict[str, int]:
        """Everything a team *did*: results, awards, badges, arrivals, hints."""
        teams, results = rows.team_ids, rows.result_ids
        counts: dict[str, int] = {}
        for label, stmt in (
            ("dynamic_awards", delete(DynamicAward).where(DynamicAward.team_id.in_(teams))),
            (
                "evaluation_history",
                delete(EvaluationHistory).where(EvaluationHistory.result_id.in_(results)),
            ),
            ("activity_results", delete(ActivityResult).where(ActivityResult.id.in_(results))),
            ("team_badges", delete(TeamBadge).where(TeamBadge.team_id.in_(teams))),
            (
                "checkpoint_arrivals",
                delete(CheckpointArrival).where(CheckpointArrival.team_id.in_(teams)),
            ),
            ("checkpoint_skips", delete(CheckpointSkip).where(CheckpointSkip.team_id.in_(teams))),
            (
                "hint_reveals",
                delete(CheckpointHintReveal).where(CheckpointHintReveal.team_id.in_(teams)),
            ),
        ):
            counts |= await self._delete_where(label, stmt)
        return counts

    async def _detach_people(self, event_id: int, rows: _EventRows) -> dict[str, int]:
        """Drop placeholders and assignments; real accounts only lose the link."""
        teams, checkpoints = rows.team_ids, rows.checkpoint_ids
        counts = await self._delete_where(
            "guide_assignments",
            delete(RallyGuideAssignment).where(RallyGuideAssignment.team_id.in_(teams)),
        )
        counts |= await self._delete_where(
            "staff_assignments",
            delete(RallyStaffAssignment).where(RallyStaffAssignment.checkpoint_id.in_(checkpoints)),
        )
        counts |= await self._delete_where(
            "placeholder_members",
            delete(User).where(
                User.team_id.in_(teams),
                User.authentik_sub.is_(None),
                User.authentik_uuid.is_(None),
            ),
        )
        await self._db.execute(
            update(User).where(User.team_id.in_(teams)).values(team_id=None, is_captain=False)
        )
        await self._db.execute(
            update(User)
            .where(User.staff_checkpoint_id.in_(checkpoints))
            .values(staff_checkpoint_id=None)
        )
        counts |= await self._delete_where(
            "participations",
            delete(EventParticipation).where(EventParticipation.event_id == event_id),
        )
        return counts

    async def _delete_structure(self, event_id: int, rows: _EventRows) -> dict[str, int]:
        """The edition's own configuration: route, activities, teams, settings."""
        checkpoints = rows.checkpoint_ids
        counts: dict[str, int] = {}
        for label, stmt in (
            ("teams", delete(Team).where(Team.event_id == event_id)),
            ("activities", delete(Activity).where(Activity.event_id == event_id)),
            ("dynamic_rules", delete(DynamicRule).where(DynamicRule.event_id == event_id)),
            (
                "guide_indications",
                delete(CheckpointGuideIndication).where(
                    CheckpointGuideIndication.checkpoint_id.in_(checkpoints)
                ),
            ),
            (
                "checkpoint_media",
                delete(CheckpointMedia).where(CheckpointMedia.checkpoint_id.in_(checkpoints)),
            ),
            ("checkpoints", delete(CheckPoint).where(CheckPoint.event_id == event_id)),
            ("route_stages", delete(RouteStage).where(RouteStage.event_id == event_id)),
            (
                "badge_definitions",
                delete(BadgeDefinition).where(BadgeDefinition.event_id == event_id),
            ),
            ("settings", delete(RallySettings).where(RallySettings.event_id == event_id)),
        ):
            counts |= await self._delete_where(label, stmt)
        return counts

    def _expunge_event(self, event: RallyEvent) -> None:
        """Forget the deleted row so the identity map never hands it back."""
        if event in self._db:
            self._db.expunge(event)

    async def _delete_orphaned_files(self, urls: set[str]) -> None:
        """Best-effort: a storage failure must never undo the committed delete."""
        if not urls:
            return
        still_used: set[str] = set()
        for _model, column in _URL_COLUMNS:
            still_used.update(
                (await self._db.scalars(select(column).where(column.in_(urls)))).all()
            )
        # Partner logos live in JSON; the doomed row is gone, so every row left
        # belongs to a surviving edition (one per edition, so few rows).
        for logos in await self._db.scalars(select(RallySettings.partner_logos)):
            still_used |= _partner_logo_urls(logos)
        for url in sorted(urls - still_used):
            try:
                storage_client.delete_image(url)
            except Exception:
                logger.exception("Failed to delete orphaned file %s", url)
