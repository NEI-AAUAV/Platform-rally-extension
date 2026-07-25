"""Presentation shaping for versus pairs. Moved out of app.api.api_v1.versus,
which used to hold the group-by logic inline in the router handler.
"""

from collections import defaultdict

from app.models.team import Team
from app.schemas.versus import VersusPairResponse


class VersusService:
    """Groups paired teams for the versus-groups listing endpoint."""

    @staticmethod
    def build_pair_list(teams: list[Team]) -> list[VersusPairResponse]:
        groups: dict[int, list[Team]] = defaultdict(list)
        for team in teams:
            if team.versus_group_id is not None:
                groups[team.versus_group_id].append(team)

        return [
            VersusPairResponse(group_id=gid, team_a_id=tl[0].id, team_b_id=tl[1].id)
            for gid, tl in groups.items()
            if len(tl) == 2
        ]
