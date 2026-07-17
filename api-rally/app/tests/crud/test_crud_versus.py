"""DB-backed tests for CRUDVersus (against real Postgres)."""
import pytest

from app.core.exceptions import (
    RallyForbiddenError,
    RallyNotFoundError,
    RallyValidationError,
)
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import team as crud_team
from app.crud.crud_versus import versus as crud_versus
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
from app.schemas.team import TeamCreate


def _settings_update(current, **overrides) -> RallySettingsUpdate:
    data = RallySettingsResponse.model_validate(current).model_dump(exclude={"id"})
    data.update(overrides)
    return RallySettingsUpdate(**data)


async def _set_enable_versus(pg_session, enabled: bool):
    settings = await rally_settings.get_or_create(pg_session)
    return await rally_settings.update(
        pg_session, id=settings.id, obj_in=_settings_update(settings, enable_versus=enabled)
    )


async def _make_team(pg_session, name):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


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

    with pytest.raises(RallyValidationError, match=f"Team {team_a.id} is already in a versus group"):
        await crud_versus.create_versus_pair(pg_session, team_a_id=team_a.id, team_b_id=team_c.id)


async def test_create_versus_pair_team_b_already_paired_raises_validation(pg_session):
    await _set_enable_versus(pg_session, True)
    team_a = await _make_team(pg_session, "A")
    team_b = await _make_team(pg_session, "B")
    team_c = await _make_team(pg_session, "C")
    await crud_versus.create_versus_pair(pg_session, team_a_id=team_a.id, team_b_id=team_b.id)

    with pytest.raises(RallyValidationError, match=f"Team {team_b.id} is already in a versus group"):
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
