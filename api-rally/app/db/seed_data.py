import json
import logging
from pathlib import Path
from typing import Any, cast

import anyio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.crud_activity import rally_event
from app.models.activity import Activity, RallyEvent
from app.models.checkpoint import CheckPoint

logger = logging.getLogger(__name__)


async def _read_json(path: Path) -> list[dict[str, Any]]:
    return cast("list[dict[str, Any]]", json.loads(await anyio.Path(path).read_text()))


async def _seed_checkpoints(db: AsyncSession, data_dir: Path, event: "RallyEvent") -> None:
    checkpoints_file = data_dir / "checkpoints.json"
    if not checkpoints_file.exists():
        logger.warning(f"Checkpoints seed file not found at {checkpoints_file}")
        return

    checkpoints_data = await _read_json(checkpoints_file)
    logger.info(f"Seeding {len(checkpoints_data)} checkpoints")
    for cp_data in checkpoints_data:
        existing_checkpoint = await db.scalar(
            select(CheckPoint).where(CheckPoint.name == cp_data["name"])
        )
        if not existing_checkpoint:
            db.add(CheckPoint(**cp_data, event_id=event.id))
            continue
        for key, value in cp_data.items():
            setattr(existing_checkpoint, key, value)
        existing_checkpoint.event_id = event.id
    await db.commit()


async def _upsert_activity(db: AsyncSession, act_data: dict[str, Any], event: "RallyEvent") -> None:
    cp_id = act_data.get("checkpoint_id")
    checkpoint = await db.scalar(select(CheckPoint).where(CheckPoint.order == cp_id))
    if not checkpoint:
        logger.error(f"Checkpoint with order {cp_id} not found for activity {act_data['name']}")
        return

    act_data["checkpoint_id"] = checkpoint.id
    existing_activity = await db.scalar(select(Activity).where(Activity.name == act_data["name"]))
    if not existing_activity:
        db.add(Activity(**act_data, event_id=event.id))
        return
    for key, value in act_data.items():
        setattr(existing_activity, key, value)
    existing_activity.event_id = event.id


async def _seed_activities(db: AsyncSession, data_dir: Path, event: "RallyEvent") -> None:
    activities_file = data_dir / "activities.json"
    if not activities_file.exists():
        logger.warning(f"Activities seed file not found at {activities_file}")
        return

    activities_data = await _read_json(activities_file)
    logger.info(f"Seeding {len(activities_data)} activities")
    for act_data in activities_data:
        await _upsert_activity(db, act_data, event)
    await db.commit()


async def seed_data(db: AsyncSession) -> None:
    data_dir = Path(__file__).parent.parent.parent / "data"

    # Ensure a current event exists; seeded checkpoints/activities attach to it.
    event = await rally_event.ensure_current(db)

    await _seed_checkpoints(db, data_dir, event)
    await _seed_activities(db, data_dir, event)


if __name__ == "__main__":
    # Local imports: app.db.session creates a real async engine/connection
    # pool as a module-level side effect. Hoisting these to the top of the
    # file made that pool spin up on every import of app.db.seed_data
    # (including in tests that only exercise the pure seeding functions),
    # which starved the test DB pool and hung test_seed_data.py under the
    # full suite. Keep lazy so importing this module has no DB side effect.
    import asyncio

    from app.db.session import SessionLocal

    async def _main() -> None:
        async with SessionLocal() as db:
            await seed_data(db)

    asyncio.run(_main())
