"""DB-backed tests for app.db.seed_data (real Postgres via pg_session)."""

import json
from pathlib import Path

from sqlalchemy import func, select

from app.crud.crud_activity import rally_event
from app.db.seed_data import (
    _seed_activities,
    _seed_checkpoints,
    _upsert_activity,
    seed_data,
)
from app.models.activity import Activity
from app.models.checkpoint import CheckPoint


async def _count(db, model):
    return await db.scalar(select(func.count(model.id)))


def _write_json(path: Path, data: list[dict]) -> None:
    path.write_text(json.dumps(data))


async def test_seed_checkpoints_creates_new_checkpoint(pg_session, tmp_path):
    event = await rally_event.ensure_current(pg_session)
    _write_json(
        tmp_path / "checkpoints.json",
        [{"name": "CP Seed A", "order": 101, "arrival_radius_m": 30}],
    )

    await _seed_checkpoints(pg_session, tmp_path, event)

    checkpoint = await pg_session.scalar(select(CheckPoint).where(CheckPoint.name == "CP Seed A"))
    assert checkpoint is not None
    assert checkpoint.event_id == event.id
    assert checkpoint.order == 101


async def test_seed_checkpoints_updates_existing_checkpoint(pg_session, tmp_path):
    event = await rally_event.ensure_current(pg_session)
    _write_json(
        tmp_path / "checkpoints.json",
        [{"name": "CP Seed B", "order": 102, "arrival_radius_m": 30}],
    )
    await _seed_checkpoints(pg_session, tmp_path, event)

    _write_json(
        tmp_path / "checkpoints.json",
        [{"name": "CP Seed B", "order": 102, "arrival_radius_m": 75}],
    )
    await _seed_checkpoints(pg_session, tmp_path, event)

    checkpoint = await pg_session.scalar(select(CheckPoint).where(CheckPoint.name == "CP Seed B"))
    assert checkpoint.arrival_radius_m == 75


async def test_seed_checkpoints_missing_file_is_noop(pg_session, tmp_path):
    event = await rally_event.ensure_current(pg_session)
    before = await _count(pg_session, CheckPoint)

    await _seed_checkpoints(pg_session, tmp_path, event)

    assert await _count(pg_session, CheckPoint) == before


async def test_seed_activities_missing_file_is_noop(pg_session, tmp_path):
    event = await rally_event.ensure_current(pg_session)
    before = await _count(pg_session, Activity)

    await _seed_activities(pg_session, tmp_path, event)

    assert await _count(pg_session, Activity) == before


async def test_seed_activities_creates_activities_from_file(pg_session, tmp_path):
    event = await rally_event.ensure_current(pg_session)
    checkpoint = CheckPoint(
        name="CP Seed Activities", order=104, arrival_radius_m=50, event_id=event.id
    )
    pg_session.add(checkpoint)
    await pg_session.commit()

    _write_json(
        tmp_path / "activities.json",
        [
            {
                "name": "Seeded Activity A",
                "checkpoint_id": checkpoint.order,
                "activity_type": "boolean",
            }
        ],
    )

    await _seed_activities(pg_session, tmp_path, event)

    activity = await pg_session.scalar(select(Activity).where(Activity.name == "Seeded Activity A"))
    assert activity is not None
    assert activity.checkpoint_id == checkpoint.id
    assert activity.event_id == event.id


async def test_upsert_activity_skips_when_checkpoint_missing(pg_session):
    event = await rally_event.ensure_current(pg_session)
    before = await _count(pg_session, Activity)

    await _upsert_activity(
        pg_session,
        {"name": "Orphan Activity", "checkpoint_id": 999999, "activity_type": "boolean"},
        event,
    )

    assert await _count(pg_session, Activity) == before


async def test_upsert_activity_creates_and_updates(pg_session):
    event = await rally_event.ensure_current(pg_session)
    checkpoint = CheckPoint(name="CP Seed C", order=103, arrival_radius_m=50, event_id=event.id)
    pg_session.add(checkpoint)
    await pg_session.flush()

    await _upsert_activity(
        pg_session,
        {
            "name": "Activity Seed A",
            "checkpoint_id": checkpoint.order,
            "activity_type": "boolean",
        },
        event,
    )
    await pg_session.commit()

    activity = await pg_session.scalar(select(Activity).where(Activity.name == "Activity Seed A"))
    assert activity is not None
    assert activity.checkpoint_id == checkpoint.id

    await _upsert_activity(
        pg_session,
        {
            "name": "Activity Seed A",
            "checkpoint_id": checkpoint.order,
            "activity_type": "score_based",
        },
        event,
    )
    await pg_session.commit()

    refreshed = await pg_session.scalar(select(Activity).where(Activity.name == "Activity Seed A"))
    assert refreshed.activity_type == "score_based"


async def test_seed_data_end_to_end(pg_session, monkeypatch):
    calls = {}

    async def _fake_seed_checkpoints(
        db, data_dir, event
    ):  # NOSONAR: must stay async, awaited by seed_data
        calls["checkpoints"] = (data_dir, event.id)

    async def _fake_seed_activities(
        db, data_dir, event
    ):  # NOSONAR: must stay async, awaited by seed_data
        calls["activities"] = (data_dir, event.id)

    monkeypatch.setattr("app.db.seed_data._seed_checkpoints", _fake_seed_checkpoints)
    monkeypatch.setattr("app.db.seed_data._seed_activities", _fake_seed_activities)

    await seed_data(pg_session)

    assert "checkpoints" in calls
    assert "activities" in calls
