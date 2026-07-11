"""Demo/seed mode — populate a database with believable fake data.

`make demo` runs this to fill an empty (or dev) database with checkpoints,
activities, teams, scored results and a few badges so you can:

  * develop and screenshot the UI without a full event stack,
  * train staff on the evaluation flow before the real rally,
  * demo features (including the evaluation audit trail) end to end.

It is deliberately self-contained: it creates its own checkpoints/activities
rather than depending on the JSON seed files, and it is idempotent — re-running
detects the demo teams and skips instead of duplicating.

NOT for production. The guard below refuses to run unless DEMO_SEED_ALLOW=1 or
the environment is non-production, so a stray `make demo` can't scribble over a
live event.
"""
import logging
import os
import random
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.crud_activity import rally_event
from app.crud.crud_team import team as crud_team
from app.models.activity import Activity, ActivityResult, RallyEvent
from app.models.checkpoint import CheckPoint
from app.models.team import Team
from app.schemas.activity import ActivityResultCreate
from app.schemas.activity_types import ActivityType
from app.schemas.team import TeamCreate
from app.services.scoring_service import EvaluationEditor, ScoringService

logger = logging.getLogger(__name__)

# Marker so re-runs are detected and demo data is easy to spot / purge.
DEMO_TEAM_PREFIX = "[DEMO] "

_DEMO_TEAM_NAMES = [
    "Os Imparáveis",
    "Bola de Neve",
    "Tripa à Moda",
    "Comando Caracol",
    "Zero a Zero",
    "Sopa da Pedra",
    "Meia Leca",
    "Rebeldes sem Causa",
]

# (checkpoint order, checkpoint name, [(activity name, type, config)])
_DEMO_STRUCTURE: list[tuple[int, str, list[tuple[str, str, dict[str, Any]]]]] = [
    (
        1,
        "Bar do Zé",
        [
            ("Shot Relâmpago", ActivityType.GENERAL.value, {"min_points": 0, "max_points": 100}),
            ("Quiz da Casa", ActivityType.SCORE_BASED.value, {"max_points": 50}),
        ],
    ),
    (
        2,
        "Praça Velha",
        [
            ("Cabo de Guerra", ActivityType.GENERAL.value, {"min_points": 0, "max_points": 100}),
            ("Tiro ao Alvo", ActivityType.SCORE_BASED.value, {"max_points": 30}),
        ],
    ),
    (
        3,
        "Tasca do Fim",
        [
            ("Desafio Final", ActivityType.GENERAL.value, {"min_points": 0, "max_points": 150}),
        ],
    ),
]


def _result_data_for(activity: Activity, rng: random.Random) -> dict[str, Any]:
    """A plausible result payload for the activity's type."""
    if activity.activity_type == ActivityType.GENERAL.value:
        max_pts = int(activity.config.get("max_points", 100))
        return {"assigned_points": rng.randint(0, max_pts)}
    if activity.activity_type == ActivityType.SCORE_BASED.value:
        max_pts = int(activity.config.get("max_points", 100))
        return {"achieved_points": rng.randint(0, max_pts)}
    # Any other seeded type: leave empty (scorers tolerate missing data).
    return {}


async def _already_seeded(db: AsyncSession) -> bool:
    count = await db.scalar(
        select(func.count(Team.id)).where(Team.name.like(f"{DEMO_TEAM_PREFIX}%"))
    )
    return bool(count)


async def _seed_structure(db: AsyncSession, event: RallyEvent) -> list[Activity]:
    """Create demo checkpoints + activities, return all activities."""
    activities: list[Activity] = []
    for order, cp_name, acts in _DEMO_STRUCTURE:
        checkpoint = await db.scalar(select(CheckPoint).where(CheckPoint.name == cp_name))
        if not checkpoint:
            checkpoint = CheckPoint(name=cp_name, order=order, event_id=event.id)
            db.add(checkpoint)
            await db.flush()
        for act_name, act_type, config in acts:
            activity = await db.scalar(select(Activity).where(Activity.name == act_name))
            if not activity:
                activity = Activity(
                    name=act_name,
                    activity_type=act_type,
                    config=config,
                    checkpoint_id=checkpoint.id,
                    event_id=event.id,
                )
                db.add(activity)
                await db.flush()
            activities.append(activity)
    await db.commit()
    return activities


async def _seed_teams_and_results(
    db: AsyncSession, activities: list[Activity], rng: random.Random
) -> None:
    scoring = ScoringService(db)
    for name in _DEMO_TEAM_NAMES:
        team = await crud_team.create(db, obj_in=TeamCreate(name=f"{DEMO_TEAM_PREFIX}{name}"))
        # Score this team on a random subset of activities.
        for activity in activities:
            if rng.random() < 0.75:  # ~75% participation, so some gaps show
                await scoring.create_result(
                    ActivityResultCreate(
                        activity_id=activity.id,
                        team_id=team.id,
                        result_data=_result_data_for(activity, rng),
                    )
                )


async def _seed_audit_trail_demo(db: AsyncSession, rng: random.Random) -> None:
    """Edit one existing result so the audit-trail feature has data to show."""
    result = await db.scalar(
        select(ActivityResult)
        .join(Team, Team.id == ActivityResult.team_id)
        .where(Team.name.like(f"{DEMO_TEAM_PREFIX}%"))
        .limit(1)
    )
    if result is None:
        return
    from app.schemas.activity import ActivityResultUpdate

    activity = await db.get(Activity, result.activity_id)
    if activity is None:
        return
    new_data = _result_data_for(activity, rng)
    await ScoringService(db).update_result(
        result,
        ActivityResultUpdate(result_data=new_data),
        editor=EvaluationEditor(id="demo-staff", name="Staff Demo"),
    )


async def _seed_badges(db: AsyncSession, activities: list[Activity]) -> None:
    from app.services.badge_service import award_badge

    teams = list(
        (
            await db.scalars(
                select(Team).where(Team.name.like(f"{DEMO_TEAM_PREFIX}%")).limit(3)
            )
        ).all()
    )
    if not teams or not activities:
        return
    first_activity = activities[0]
    # Sample awards using the seeded badge codes (also stored in badge_type).
    await award_badge(
        db,
        team_id=teams[0].id,
        badge_code="first_to_complete_activity",
        activity_id=first_activity.id,
    )
    if len(teams) > 1:
        await award_badge(
            db,
            team_id=teams[1].id,
            badge_code="head_to_head_win",
            activity_id=first_activity.id,
        )


async def seed_demo(db: AsyncSession, *, force: bool = False) -> None:
    """Populate the database with demo teams, results and badges."""
    if not force and os.getenv("DEMO_SEED_ALLOW") != "1":
        env = os.getenv("ENVIRONMENT", "development").lower()
        if env in {"production", "prod"}:
            raise RuntimeError(
                "Refusing to run demo seed in production. Set DEMO_SEED_ALLOW=1 "
                "to override (you almost certainly should not)."
            )

    if await _already_seeded(db):
        logger.info("Demo data already present — skipping (delete [DEMO] teams to re-seed).")
        return

    rng = random.Random(42)  # fixed seed: reproducible screenshots/tests
    event = await rally_event.ensure_current(db)

    activities = await _seed_structure(db, event)
    await _seed_teams_and_results(db, activities, rng)
    await _seed_audit_trail_demo(db, rng)
    await _seed_badges(db, activities)

    logger.info(
        "Demo seed complete: %d activities, %d teams.",
        len(activities),
        len(_DEMO_TEAM_NAMES),
    )


if __name__ == "__main__":
    import asyncio

    from app.db.session import SessionLocal

    async def _main() -> None:
        async with SessionLocal() as db:
            await seed_demo(db)

    asyncio.run(_main())
