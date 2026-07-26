"""Unit tests for TeamMemberService, exercised directly against real Postgres
(not via HTTP) — the API-level flows are already covered in
app/tests/api/test_team_members.py; these fill gaps in the placeholder-link
guard clauses that aren't reachable through the router tests.
"""

import pytest

from app.core.exceptions import RallyValidationError
from app.crud.crud_team import team as crud_team
from app.crud.crud_user import user as crud_user
from app.schemas.team import TeamCreate
from app.schemas.team_members import TeamMemberAdd
from app.schemas.user import UserCreate
from app.services.team_member_service import TeamMemberService
from app.tests.conftest import make_event as _make_event


async def _make_team(pg_session, name="Test Team"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


async def _make_placeholder(pg_session, team_id: int, name="Placeholder"):
    return await crud_user.create(
        pg_session, obj_in=UserCreate(name=name, team_id=team_id, is_captain=False)
    )


class TestLinkPlaceholderToAuthentikAccount:
    async def test_already_linked_placeholder_is_rejected(self, pg_session) -> None:
        # given: a placeholder that already has an authentik_sub (not a real
        # placeholder anymore)
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await _make_placeholder(pg_session, team.id)
        placeholder.authentik_sub = "already-linked-sub"
        pg_session.add(placeholder)
        await pg_session.commit()
        await pg_session.refresh(placeholder)

        service = TeamMemberService(pg_session)

        # when / then
        with pytest.raises(RallyValidationError, match="already linked"):
            await service.link_placeholder_to_authentik_account(
                team=team,
                placeholder=placeholder,
                authentik_sub="new-sub",
                name="Someone",
                email=None,
            )

    async def test_target_account_already_on_a_team_is_rejected(self, pg_session) -> None:
        # given: the target NEI account is already a member of a different team
        await _make_event(pg_session)
        team_a = await _make_team(pg_session, name="Team A")
        team_b = await _make_team(pg_session, name="Team B")
        placeholder = await _make_placeholder(pg_session, team_a.id)

        existing_target = await crud_user.create_for_oidc(
            pg_session,
            authentik_sub="taken-sub",
            name="Already On A Team",
            email=None,
            scopes=[],
        )
        existing_target.team_id = team_b.id
        pg_session.add(existing_target)
        await pg_session.commit()

        service = TeamMemberService(pg_session)

        # when / then
        with pytest.raises(RallyValidationError, match="already on a team"):
            await service.link_placeholder_to_authentik_account(
                team=team_a,
                placeholder=placeholder,
                authentik_sub="taken-sub",
                name="Already On A Team",
                email=None,
            )

    async def test_links_previously_unseen_account_and_creates_local_mirror(
        self, pg_session
    ) -> None:
        # given: no local mirror exists yet for this authentik_sub
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        placeholder = await _make_placeholder(pg_session, team.id, name="Slot A")

        service = TeamMemberService(pg_session)

        # when
        target = await service.link_placeholder_to_authentik_account(
            team=team,
            placeholder=placeholder,
            authentik_sub="brand-new-sub",
            name="New Person",
            email="new@example.com",
        )

        # then
        assert target.authentik_sub == "brand-new-sub"
        assert target.team_id == team.id
        assert target.is_captain is False


class TestAddMember:
    async def test_captain_slot_already_taken_is_rejected(self, pg_session) -> None:
        # given: the team already has a captain
        await _make_event(pg_session)
        team = await _make_team(pg_session)
        captain = await crud_user.create(
            pg_session, obj_in=UserCreate(name="Captain", team_id=team.id, is_captain=True)
        )
        assert captain.is_captain is True

        service = TeamMemberService(pg_session)

        # when / then
        with pytest.raises(RallyValidationError, match="already has a captain"):
            await service.add_member(
                team.id,
                TeamMemberAdd(name="Second Captain", is_captain=True),
                is_privileged=True,
            )
