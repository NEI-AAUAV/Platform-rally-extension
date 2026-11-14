"""Real-schema tests for permanently deleting a (test) edition.

Most tables hang off an event without ``ON DELETE CASCADE``, so a plain
``DELETE FROM rally_events`` fails on foreign keys. The purge service removes
the edition and everything that happened in it, in one transaction, while
leaving every other edition and every real person's account untouched.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import func, select

from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.models.activity import Activity, ActivityResult, RallyEvent
from app.models.audit_log import AuditLog
from app.models.badge import TeamBadge
from app.models.badge_definition import BadgeDefinition
from app.models.checkpoint import CheckPoint
from app.models.checkpoint_arrival import CheckpointArrival
from app.models.checkpoint_guide_indication import CheckpointGuideIndication
from app.models.checkpoint_hint_reveal import CheckpointHintReveal
from app.models.checkpoint_media import CheckpointMedia, MediaKind
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
from app.services.audit_service import AuditActor
from app.services.event_purge_service import EventPurgeService

pytestmark = pytest.mark.asyncio

ACTOR = AuditActor(id="1", name="Admin", kind="user")
R2 = "https://r2.example.test"


async def _make_event(session, name: str, *, is_current: bool = False) -> RallyEvent:
    event = RallyEvent(name=name, event_type="rally_tascas", is_current=is_current)
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


async def _populate(session, event: RallyEvent, tag: str) -> dict[str, int]:
    """Give ``event`` one row in every table that hangs off an edition."""
    stage = RouteStage(name="Stage", order=1, event_id=event.id)
    session.add(stage)
    await session.flush()
    checkpoint = CheckPoint(
        name="Posto",
        order=1,
        event_id=event.id,
        stage_id=stage.id,
        clue_media_url=f"{R2}/clue-{tag}.png",
    )
    team = Team(
        name=f"Equipa {tag}",
        access_code=f"PURGE-{tag}",
        event_id=event.id,
        photo_url=f"{R2}/team-{tag}.png",
    )
    session.add_all([checkpoint, team])
    await session.flush()

    activity = Activity(
        name="Shot",
        activity_type="score_based",
        checkpoint_id=checkpoint.id,
        event_id=event.id,
        config={},
    )
    indication = CheckpointGuideIndication(checkpoint_id=checkpoint.id, hint="À esquerda")
    rule = DynamicRule(name="Bonus", event_id=event.id)
    session.add_all([activity, indication, rule])
    await session.flush()

    result = ActivityResult(activity_id=activity.id, team_id=team.id)
    placeholder = User(name=f"Placeholder {tag}", team_id=team.id)
    real = User(
        name=f"Real {tag}",
        email=f"real-{tag}@example.test",
        authentik_sub=f"sub-{tag}",
        team_id=team.id,
        is_captain=True,
    )
    staff = User(
        name=f"Staff {tag}", email=f"staff-{tag}@example.test", staff_checkpoint_id=checkpoint.id
    )
    session.add_all([result, placeholder, real, staff])
    await session.flush()

    session.add_all(
        [
            EvaluationHistory(result_id=result.id, action="updated"),
            DynamicAward(team_id=team.id, event_id=event.id, points=5),
            TeamBadge(team_id=team.id, badge_type="first_blood"),
            BadgeDefinition(code=f"b-{tag}", name="Badge", event_id=event.id),
            CheckpointArrival(team_id=team.id, checkpoint_id=checkpoint.id),
            CheckpointSkip(team_id=team.id, checkpoint_id=checkpoint.id),
            CheckpointHintReveal(
                team_id=team.id, checkpoint_id=checkpoint.id, indication_id=indication.id
            ),
            CheckpointMedia(
                checkpoint_id=checkpoint.id,
                kind=MediaKind.photo,
                image_url=f"{R2}/media-{tag}.png",
            ),
            RallyStaffAssignment(user_id=staff.id, checkpoint_id=checkpoint.id),
            RallyGuideAssignment(user_id=staff.id, team_id=team.id),
            RallySettings(
                event_id=event.id,
                partner_logos=[
                    {
                        "id": f"own-{tag}",
                        "name": "Núcleo",
                        "url": f"{R2}/partner-{tag}.png",
                        "dark_url": f"{R2}/partner-dark-{tag}.png",
                    },
                    # Cloned settings carry the source's logo entries verbatim.
                    {"id": "shared", "name": "AAUAv", "url": f"{R2}/partner-shared.png"},
                ],
            ),
            EventParticipation(
                authentik_sub=f"sub-{tag}", event_id=event.id, team_id=team.id, team_name="x"
            ),
        ]
    )
    await session.commit()
    return {"team": team.id, "real": real.id, "placeholder": placeholder.id, "staff": staff.id}


async def _count(session, model, *where) -> int:
    return await session.scalar(select(func.count()).select_from(model).where(*where))


async def test_purge_removes_the_edition_and_everything_in_it(pg_session) -> None:
    keep = await _make_event(pg_session, "Real", is_current=True)
    await _populate(pg_session, keep, "keep")
    doomed = await _make_event(pg_session, "Teste")
    ids = await _populate(pg_session, doomed, "doomed")

    deleted = await EventPurgeService(pg_session).purge(
        doomed.id, confirm_name=doomed.name, actor=ACTOR
    )

    pg_session.expire_all()
    assert await pg_session.get(RallyEvent, doomed.id) is None
    for model in (Team, CheckPoint, Activity, RouteStage, BadgeDefinition, DynamicRule):
        assert await _count(pg_session, model, model.event_id == doomed.id) == 0
    assert await _count(pg_session, RallySettings, RallySettings.event_id == doomed.id) == 0
    assert (
        await _count(pg_session, EventParticipation, EventParticipation.event_id == doomed.id) == 0
    )
    assert await pg_session.get(User, ids["placeholder"]) is None
    assert deleted["teams"] == 1
    assert deleted["activity_results"] == 1


async def test_purge_keeps_real_accounts_but_detaches_them(pg_session) -> None:
    await _make_event(pg_session, "Real", is_current=True)
    doomed = await _make_event(pg_session, "Teste")
    ids = await _populate(pg_session, doomed, "acc")

    await EventPurgeService(pg_session).purge(doomed.id, confirm_name=doomed.name, actor=ACTOR)

    pg_session.expire_all()
    real = await pg_session.get(User, ids["real"])
    staff = await pg_session.get(User, ids["staff"])
    assert real is not None and real.team_id is None and real.is_captain is False
    assert staff is not None and staff.staff_checkpoint_id is None


async def test_purge_leaves_other_editions_untouched(pg_session) -> None:
    keep = await _make_event(pg_session, "Real", is_current=True)
    kept = await _populate(pg_session, keep, "other")
    doomed = await _make_event(pg_session, "Teste")
    await _populate(pg_session, doomed, "gone")

    await EventPurgeService(pg_session).purge(doomed.id, confirm_name=doomed.name, actor=ACTOR)

    keep_id = keep.id
    pg_session.expire_all()
    assert await _count(pg_session, Team, Team.event_id == keep_id) == 1
    assert await _count(pg_session, ActivityResult, ActivityResult.team_id == kept["team"]) == 1
    assert (
        await _count(pg_session, CheckpointArrival, CheckpointArrival.team_id == kept["team"]) == 1
    )
    real_team = await pg_session.scalar(select(User.team_id).where(User.id == kept["real"]))
    assert real_team == kept["team"]


async def test_purge_records_an_audit_entry(pg_session) -> None:
    await _make_event(pg_session, "Real", is_current=True)
    doomed = await _make_event(pg_session, "Teste Audit")
    await _populate(pg_session, doomed, "audit")

    await EventPurgeService(pg_session).purge(doomed.id, confirm_name=doomed.name, actor=ACTOR)

    entry = await pg_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "event.delete", AuditLog.target_id == str(doomed.id)
        )
    )
    assert entry is not None
    assert entry.event_id is None
    assert "Teste Audit" in (entry.note or "")


async def test_purge_refuses_the_current_edition(pg_session) -> None:
    current = await _make_event(pg_session, "Atual", is_current=True)

    with pytest.raises(RallyValidationError):
        await EventPurgeService(pg_session).purge(
            current.id, confirm_name=current.name, actor=ACTOR
        )

    assert await pg_session.get(RallyEvent, current.id) is not None


async def test_purge_refuses_an_edition_whose_rally_is_running(pg_session) -> None:
    await _make_event(pg_session, "Real", is_current=True)
    running = await _make_event(pg_session, "A decorrer")
    now = datetime.now(UTC)
    pg_session.add(
        RallySettings(
            event_id=running.id,
            rally_start_time=now - timedelta(hours=1),
            rally_end_time=now + timedelta(hours=1),
        )
    )
    await pg_session.commit()

    with pytest.raises(RallyValidationError):
        await EventPurgeService(pg_session).purge(
            running.id, confirm_name=running.name, actor=ACTOR
        )


async def test_purge_refuses_a_mismatched_confirmation_name(pg_session) -> None:
    await _make_event(pg_session, "Real", is_current=True)
    doomed = await _make_event(pg_session, "Teste")

    with pytest.raises(RallyValidationError):
        await EventPurgeService(pg_session).purge(doomed.id, confirm_name="Real", actor=ACTOR)

    assert await pg_session.get(RallyEvent, doomed.id) is not None


async def test_purge_unknown_edition_is_not_found(pg_session) -> None:
    with pytest.raises(RallyNotFoundError):
        await EventPurgeService(pg_session).purge(999_999, confirm_name="x", actor=ACTOR)


async def test_purge_deletes_only_unshared_images_after_commit(pg_session) -> None:
    keep = await _make_event(pg_session, "Real", is_current=True)
    await _populate(pg_session, keep, "img")
    doomed = await _make_event(pg_session, "Teste")
    await _populate(pg_session, doomed, "imgdoomed")
    # A cloned edition shares the source's image URLs; deleting the clone must
    # never delete a file the source still shows.
    shared = f"{R2}/clue-img.png"
    clone_cp = await pg_session.scalar(select(CheckPoint).where(CheckPoint.event_id == doomed.id))
    clone_cp.clue_media_url = shared
    await pg_session.commit()

    with patch("app.services.event_purge_service.storage_client") as storage:
        await EventPurgeService(pg_session).purge(doomed.id, confirm_name=doomed.name, actor=ACTOR)

    removed = {call.args[0] for call in storage.delete_image.call_args_list}
    assert shared not in removed
    assert f"{R2}/team-imgdoomed.png" in removed
    assert f"{R2}/media-imgdoomed.png" in removed


async def test_purge_survives_a_storage_failure(pg_session) -> None:
    await _make_event(pg_session, "Real", is_current=True)
    doomed = await _make_event(pg_session, "Teste")
    await _populate(pg_session, doomed, "fail")

    with patch("app.services.event_purge_service.storage_client") as storage:
        storage.delete_image.side_effect = RuntimeError("R2 down")
        await EventPurgeService(pg_session).purge(doomed.id, confirm_name=doomed.name, actor=ACTOR)

    pg_session.expire_all()
    assert await pg_session.get(RallyEvent, doomed.id) is None


async def test_purge_deletes_only_unshared_partner_logos(pg_session) -> None:
    keep = await _make_event(pg_session, "Real", is_current=True)
    await _populate(pg_session, keep, "logokeep")
    doomed = await _make_event(pg_session, "Teste")
    await _populate(pg_session, doomed, "logodoomed")

    with patch("app.services.event_purge_service.storage_client") as storage:
        await EventPurgeService(pg_session).purge(doomed.id, confirm_name=doomed.name, actor=ACTOR)

    removed = {call.args[0] for call in storage.delete_image.call_args_list}
    assert f"{R2}/partner-logodoomed.png" in removed
    assert f"{R2}/partner-dark-logodoomed.png" in removed
    assert f"{R2}/partner-shared.png" not in removed
    assert f"{R2}/partner-logokeep.png" not in removed
