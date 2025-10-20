from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from sqlalchemy import select
from collections import defaultdict


from app.crud.base import CRUDBase
from app.crud.crud_rally_settings import rally_settings
from app.models.team import Team


class CRUDVersus():
    def create_versus_pair(self, db: Session, *, team_a_id: int, team_b_id: int) -> int:
        """
        Manually pair two teams into a versus group.
        
        Returns:
            The group ID (same as team_a_id for simplicity)
        """

        settings = rally_settings.get_or_create(db)
        if not settings.enable_versus:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Versus mode is not enabled"
            )

        if team_a_id == team_b_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A team cannot be paired with itself"
            )
        
        team_a = db.get(Team, team_a_id)
        team_b = db.get(Team, team_b_id)

        if not team_a or not team_b:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="One or both teams not found"
            )
        
        if team_a.versus_group_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Team {team_a_id} is already in a versus group"
            )
        
        if team_b.versus_group_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Team {team_b_id} is already in a versus group"
            )
        
        # use team_a.id as the group id (no extra table)
        group_id = team_a.id
        team_a.versus_group_id = group_id
        team_b.versus_group_id = group_id

        db.commit()
        return group_id
    
    def get_opponent(self, db: Session, *, team_id: int) -> Optional[Team]:
        """Get the opponent team in the same versus group"""
        team = db.get(Team, team_id)
        if not team or team.versus_group_id is None:
            return None
        
        opponent = db.execute(
            select(Team)
            .where(Team.id != team_id)
            .where(Team.versus_group_id == team.versus_group_id)
        ).scalar_one_or_none()

        return opponent
    
    def get_all_versus_pairs(db: Session):
        teams = db.scalars(select(Team).where(Team.versus_group_id.isnot(None))).all()

        groups = defaultdict(list)
        for team in teams:
            groups[team.versus_group_id].append(team.id)

        return [
            {"group_id": gid, "team_ids": tids} for gid, tids in groups.items() if len(tids) == 2
        ]
    
versus = CRUDVersus()