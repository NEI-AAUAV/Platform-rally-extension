"""Regression tests for scoring aggregation with autoflush disabled.

The application intentionally creates AsyncSession objects with
``autoflush=False``. Any primitive that derives ``Team.total`` from database
SELECTs therefore has to flush pending score-source mutations first.

These tests cover the failure mode where a pending ``DynamicAward`` INSERT or
DELETE exists in the same transaction immediately before score aggregation.
"""

import pytest

from app.crud.crud_team import team as crud_team
from app.models.dynamic_scoring import DynamicAward
from app.schemas.team import TeamCreate
from app.services.scoring_service import ScoringService


async def _make_team(db, name: str):
    return await crud_team.create(db, obj_in=TeamCreate(name=name))


async def test_update_team_scores_flushes_pending_award_before_aggregation(pg_session):
    """A pending award INSERT must already contribute to Team.total.

    With ``autoflush=False`` and no explicit flush in the aggregation primitive,
    the SELECT over DynamicAward reads the pre-INSERT database state. The later
    commit can then persist both the award and an incorrectly calculated total.
    """
    team = await _make_team(pg_session, "Pending award")

    pg_session.add(
        DynamicAward(
            team_id=team.id,
            points=-60,
            is_active=True,
        )
    )

    changed = await ScoringService(pg_session).update_team_scores(team.id)

    assert changed is True
    await pg_session.refresh(team)
    assert team.total == pytest.approx(-60)


async def test_update_team_scores_flushes_pending_award_delete_before_aggregation(pg_session):
    """A pending award DELETE must stop contributing to Team.total."""
    team = await _make_team(pg_session, "Pending award delete")
    award = DynamicAward(
        team_id=team.id,
        points=-60,
        is_active=True,
    )
    pg_session.add(award)
    await pg_session.commit()
    await pg_session.refresh(award)

    svc = ScoringService(pg_session)
    await svc.update_team_scores(team.id)
    await pg_session.refresh(team)
    assert team.total == pytest.approx(-60)

    await pg_session.delete(award)

    changed = await svc.update_team_scores(team.id)

    assert changed is True
    await pg_session.refresh(team)
    assert team.total == pytest.approx(0)


async def test_update_all_team_scores_flushes_pending_award_before_aggregation(pg_session):
    """The bulk aggregation path must obey the same flush contract."""
    team = await _make_team(pg_session, "Pending bulk award")

    pg_session.add(
        DynamicAward(
            team_id=team.id,
            points=-60,
            is_active=True,
        )
    )

    await ScoringService(pg_session).update_all_team_scores([team])

    assert team.total == pytest.approx(-60)
