import json
import logging
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud.crud_activity import rally_event
from app.models.activity import Activity
from app.models.checkpoint import CheckPoint

logger = logging.getLogger(__name__)

async def seed_data(db: AsyncSession) -> None:
    data_dir = Path(__file__).parent.parent.parent / "data"

    # Ensure a current event exists; seeded checkpoints/activities attach to it.
    event = await rally_event.ensure_current(db)

    # Seed Checkpoints
    checkpoints_file = data_dir / "checkpoints.json"
    if checkpoints_file.exists():
        with open(checkpoints_file) as f:
            checkpoints_data = json.load(f)
            logger.info(f"Seeding {len(checkpoints_data)} checkpoints")
            for cp_data in checkpoints_data:
                # Check if exists by name or order? Name seems safer for updates
                existing_checkpoint = await db.scalar(select(CheckPoint).where(CheckPoint.name == cp_data["name"]))
                if not existing_checkpoint:
                    cp = CheckPoint(**cp_data, event_id=event.id)
                    db.add(cp)
                else:
                    # Update existing?
                    for key, value in cp_data.items():
                        setattr(existing_checkpoint, key, value)
                    existing_checkpoint.event_id = event.id
            await db.commit()
    else:
        logger.warning(f"Checkpoints seed file not found at {checkpoints_file}")

    # Seed Activities
    activities_file = data_dir / "activities.json"
    if activities_file.exists():
        with open(activities_file) as f:
            activities_data = json.load(f)
            logger.info(f"Seeding {len(activities_data)} activities")
            for act_data in activities_data:
                # We need to ensure checkpoint_id is valid. 
                # The JSON has integer IDs, but in DB they are auto-increment.
                # However, since we just seeded checkpoints with specific orders/names, 
                # we should probably look them up or assume the seed data IDs enable mapping.
                # FOR NOW: Let's assume the checkpoint_id in JSON refers to the 'order' or an existing ID 
                # IF the seed data matches the DB. 
                # BUT: The user modified the file in place.
                
                # Let's map checkpoint_id 1-6 to the CheckPoint with order 1-6.
                cp_id = act_data.get("checkpoint_id")
                checkpoint = await db.scalar(select(CheckPoint).where(CheckPoint.order == cp_id))

                if checkpoint:
                    act_data["checkpoint_id"] = checkpoint.id

                    existing_activity = await db.scalar(select(Activity).where(Activity.name == act_data["name"]))
                    if not existing_activity:
                        activity = Activity(**act_data, event_id=event.id)
                        db.add(activity)
                    else:
                         for key, value in act_data.items():
                            setattr(existing_activity, key, value)
                         existing_activity.event_id = event.id
                else:
                    logger.error(f"Checkpoint with order {cp_id} not found for activity {act_data['name']}")

            await db.commit()
    else:
        logger.warning(f"Activities seed file not found at {activities_file}")


if __name__ == "__main__":
    import asyncio
    from app.db.session import SessionLocal

    async def _main() -> None:
        async with SessionLocal() as db:
            await seed_data(db)

    asyncio.run(_main())
