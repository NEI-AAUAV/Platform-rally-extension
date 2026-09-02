"""DB-backed tests for CRUDVersus (against real Postgres)."""

import pytest
from sqlalchemy import func, select

from app.core.exceptions import (
    RallyForbiddenError,
    RallyNotFoundError,
    RallyValidationError,
)
from app.crud._event_scope import current_event_id
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.crud.crud_user import user as crud_user
from app.crud.crud_versus import versus as crud_versus
from app.models.activity import Activity, ActivityResult
from app.schemas.activity import ActivityResultCreate
from app.schemas.activity_types import ActivityType
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
from app.schemas.team import TeamCreate
from app.schemas.user import UserCreate, UserUpdate
from app.services.scoring_service import ScoringService


def _settings_update(current, **overrides) -> RallySettingsUpdate:
    data = RallySettingsResponse.model_validate(current).model_dump(exclude={"id"})
    data.update(overrides)
    return RallySettingsUpdate(**data)


async def _set_enable_versus(pg_session, enabled: bool):
    settings = await rally_settings.get_or_create(pg_session)
    return await rally_settings.update(
        pg_session,
        id=settings.id,
        obj_in=_settings_update(settings, enable_versus=enabled),
        commit=True,
    )


async def _make_team(pg_session, name):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


async def _make_activity(pg_session, *, activity_type: str) -> Activity:
    activity = Activity(
        name=f"Activity {activity_type}",
        activity_type=activity_type,
        config=(
            {"win_points": 100, "draw_points": 50, "lose_points": 0}
            if activity_type == ActivityType.TEAM_VS.value
            else {"min_points": 0, "max_points": 100}
        ),
        event_id=await current_event_id(pg_session),
    )
    pg_session.add(activity)
    await pg_session.commit()
    await pg_session.refresh(activity)
    return activity


async def _make_pair(pg_session, name_a="A", name_b="B"):
    await _set_enable_versus(pg_session, True)
    team_a = await _make_team(pg_session, name_a)
    team_b = await _make_team(pg_session, name_b)
    await crud_versus.create_versus_pair(pg_session, team_a_id=team_a.id, team_b_id=team_b.id)
    return team_a, team_b


async def test_create_versus_pair_disabled_raises_forbidden(pg_session):
    await _set_enable_versus(pg_session, False)
    team_a = await _make_team(pg_session, "A")
    team_b = await _make_team(pg_session, "B")

    with pytest.raises(RallyForbiddenError):
        await crud_versus.create_versus_pair(pg_session, team_a_id=team_a.id, team_b_id=team_b.id)


async def test_create_versus_pair_same_team_raises_validation(pg_session):
    await _set_enable_versus(pg_session, True)
    team = await _make_team(pg_session, "Solo")

    with pytest.raises(RallyValidationError, match="cannot be paired with itself"):
        await crud_versus.create_versus_pair(pg_session, team_a_id=team.id, team_b_id=team.id)


async def test_create_versus_pair_missing_team_raises_not_found(pg_session):
    await _set_enable_versus(pg_session, True)
    team = await _make_team(pg_session, "Alone")

    with pytest.raises(RallyNotFoundError):
        await crud_versus.create_versus_pair(pg_session, team_a_id=team.id, team_b_id=999999)


async def test_create_versus_pair_team_a_already_paired_raises_validation(pg_session):
    await _set_enable_versus(pg_session, True)
    team_a = await _make_team(pg_session, "A")
    team_b = await _make_team(pg_session, "B")
    team_c = await _make_team(pg_session, "C")
    await crud_versus.create_versus_pair(pg_session, team_a_id=team_a.id, team_b_id=team_b.id)

    with pytest.raises(
        RallyValidationError, match=f"Team {team_a.id} is already in a versus group"
    ):
        await crud_versus.create_versus_pair(pg_session, team_a_id=team_a.id, team_b_id=team_c.id)


async def test_create_versus_pair_team_b_already_paired_raises_validation(pg_session):
    await _set_enable_versus(pg_session, True)
    team_a = await _make_team(pg_session, "A")
    team_b = await _make_team(pg_session, "B")
    team_c = await _make_team(pg_session, "C")
    await crud_versus.create_versus_pair(pg_session, team_a_id=team_a.id, team_b_id=team_b.id)

    with pytest.raises(
        RallyValidationError, match=f"Team {team_b.id} is already in a versus group"
    ):
        await crud_versus.create_versus_pair(pg_session, team_a_id=team_c.id, team_b_id=team_b.id)


async def test_get_all_versus_pairs_returns_only_complete_pairs(pg_session):
    await _set_enable_versus(pg_session, True)
    team_a = await _make_team(pg_session, "A")
    team_b = await _make_team(pg_session, "B")
    # An orphan team with a versus_group_id but no partner (e.g. after a
    # partner was removed) should be excluded — only complete pairs count.
    orphan = await _make_team(pg_session, "Orphan")
    orphan.versus_group_id = 999999
    pg_session.add(orphan)
    await pg_session.commit()

    await crud_versus.create_versus_pair(pg_session, team_a_id=team_a.id, team_b_id=team_b.id)

    pairs = await crud_versus.get_all_versus_pairs(pg_session)

    assert len(pairs) == 1
    assert set(pairs[0]["team_ids"]) == {team_a.id, team_b.id}
    assert all(orphan.id not in p["team_ids"] for p in pairs)


# --------------------------------------------------------------------------- #
# TeamVs scoring regressions: the legacy endpoint and staff generic path must
# obey the configured pair and persist both halves atomically.
# --------------------------------------------------------------------------- #
async def test_scoring_service_requires_configured_pair(pg_session):
    await _set_enable_versus(pg_session, True)
    activity = await _make_activity(pg_session, activity_type=ActivityType.TEAM_VS.value)
    team_a = await _make_team(pg_session, "Unpaired A")
    team_b = await _make_team(pg_session, "Unpaired B")

    assert (
        await ScoringService(pg_session).validate_team_vs_match(
            team_a.id, team_b.id, activity.id, winner_id=team_a.id
        )
        is False
    )


async def test_scoring_service_rejects_non_team_vs_activity(pg_session):
    team_a, team_b = await _make_pair(pg_session, "General A", "General B")
    activity = await _make_activity(pg_session, activity_type=ActivityType.GENERAL.value)

    assert (
        await ScoringService(pg_session).validate_team_vs_match(
            team_a.id, team_b.id, activity.id, winner_id=team_a.id
        )
        is False
    )


async def test_scoring_service_rejects_winner_outside_match(pg_session):
    team_a, team_b = await _make_pair(pg_session, "Winner A", "Winner B")
    outsider = await _make_team(pg_session, "Outsider")
    activity = await _make_activity(pg_session, activity_type=ActivityType.TEAM_VS.value)

    assert (
        await ScoringService(pg_session).validate_team_vs_match(
            team_a.id, team_b.id, activity.id, winner_id=outsider.id
        )
        is False
    )
    with pytest.raises(RallyValidationError):
        await ScoringService(pg_session).create_team_vs_result(
            team_a.id,
            team_b.id,
            activity.id,
            winner_id=outsider.id,
            match_data={},
        )


async def test_match_data_cannot_override_server_outcome_or_opponent(pg_session):
    team_a, team_b = await _make_pair(pg_session, "Safe A", "Safe B")
    activity = await _make_activity(pg_session, activity_type=ActivityType.TEAM_VS.value)

    result_a, result_b = await ScoringService(pg_session).create_team_vs_result(
        team_a.id,
        team_b.id,
        activity.id,
        winner_id=team_a.id,
        match_data={
            "result": "draw",
            "opponent_team_id": 999999,
            "notes": "server-owned fields must win",
        },
    )

    assert result_a.result_data["result"] == "win"
    assert result_a.result_data["opponent_team_id"] == team_b.id
    assert result_b.result_data["result"] == "lose"
    assert result_b.result_data["opponent_team_id"] == team_a.id
    assert result_a.result_data["notes"] == "server-owned fields must win"


async def test_generic_create_result_routes_team_vs_through_atomic_pair(pg_session):
    """This is the primitive used by the normal staff POST path."""
    team_a, team_b = await _make_pair(pg_session, "Staff A", "Staff B")
    activity = await _make_activity(pg_session, activity_type=ActivityType.TEAM_VS.value)

    result_a = await ScoringService(pg_session).create_result(
        ActivityResultCreate(
            activity_id=activity.id,
            team_id=team_a.id,
            result_data={"result": "win", "opponent_team_id": team_b.id},
        )
    )

    result_b = (
        await pg_session.scalars(
            select(ActivityResult).where(
                ActivityResult.activity_id == activity.id,
                ActivityResult.team_id == team_b.id,
            )
        )
    ).one()
    assert result_a.result_data["result"] == "win"
    assert result_b.result_data["result"] == "lose"


async def test_team_vs_second_write_failure_rolls_back_first_half(pg_session, monkeypatch):
    team_a, team_b = await _make_pair(pg_session, "Atomic A", "Atomic B")
    activity = await _make_activity(pg_session, activity_type=ActivityType.TEAM_VS.value)
    service = ScoringService(pg_session)
    original_create_result = service.create_result
    internal_calls = 0

    async def fail_on_second_internal_create(*args, **kwargs):
        nonlocal internal_calls
        if kwargs.get("sync_team_vs") is False:
            internal_calls += 1
            if internal_calls == 2:
                raise RuntimeError("mirror insert failed")
        return await original_create_result(*args, **kwargs)

    monkeypatch.setattr(service, "create_result", fail_on_second_internal_create)

    with pytest.raises(RuntimeError, match="mirror insert failed"):
        await service.create_team_vs_result(
            team_a.id,
            team_b.id,
            activity.id,
            winner_id=team_a.id,
            match_data={},
        )

    count = await pg_session.scalar(
        select(func.count(ActivityResult.id)).where(ActivityResult.activity_id == activity.id)
    )
    assert count == 0


# --------------------------------------------------------------------------- #
# Transaction ownership regressions for commit=False CRUD helpers.
# --------------------------------------------------------------------------- #
async def test_team_create_integrity_error_preserves_outer_transaction(pg_session):
    await _set_enable_versus(pg_session, False)
    existing = await _make_team(pg_session, "Existing Team")
    await pg_session.commit()

    existing.total = 123
    pg_session.add(existing)
    with pytest.raises(RallyValidationError, match="Team name already exists"):
        await crud_team.create(pg_session, obj_in=TeamCreate(name="Existing Team"), commit=False)

    # A rollback owned by CRUDTeam.create() would have discarded this mutation.
    await pg_session.commit()
    await pg_session.refresh(existing)
    assert existing.total == 123


async def test_user_create_integrity_error_preserves_outer_transaction(pg_session):
    await _set_enable_versus(pg_session, False)
    marker = await _make_team(pg_session, "Create Marker")
    await pg_session.commit()
    marker.total = 321
    pg_session.add(marker)

    with pytest.raises(RallyNotFoundError, match="Team not found"):
        await crud_user.create(
            pg_session,
            obj_in=UserCreate(
                name="Invalid FK User",
                email="invalid-create@example.com",
                team_id=999999,
            ),
            commit=False,
        )

    await pg_session.commit()
    await pg_session.refresh(marker)
    assert marker.total == 321


async def test_user_update_integrity_error_preserves_outer_transaction(pg_session):
    await _set_enable_versus(pg_session, False)
    marker = await _make_team(pg_session, "Update Marker")
    user = await crud_user.create(
        pg_session,
        obj_in=UserCreate(name="Valid User", email="valid-update@example.com"),
        commit=True,
    )
    marker.total = 456
    pg_session.add(marker)

    with pytest.raises(RallyNotFoundError, match="Team not found"):
        await crud_user.update(
            pg_session,
            id=user.id,
            obj_in=UserUpdate(team_id=999999),
            commit=False,
        )

    await pg_session.commit()
    await pg_session.refresh(marker)
    assert marker.total == 456
