import math
import random
from typing import List, Sequence
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from sqlalchemy.orm import Session

from app.exception import APIException
from app.crud.base import CRUDBase
from app.models.team import Team
from app.schemas.team import (
    TeamCreate,
    TeamUpdate,
    TeamScoresUpdate,
)

from app.crud.crud_rally_settings import rally_settings
from ._deps import unique_key_error_regex

locked_arrays = [
    "times",
    "question_scores",
    "time_scores",
    "pukes",
    "skips",
]

_name_unique_error_regex = unique_key_error_regex(Team.name.name)


class CRUDTeam(CRUDBase[Team, TeamCreate, TeamUpdate]):
    def calculate_min_time_scores(self, teams: Sequence[Team]) -> List[float]:
        all_time_scores = [
            t.time_scores + [0] * (8 - len(t.time_scores)) for t in teams
        ]

        min_time_scores = [
            min((s if s != 0 else math.inf) for s in scores)
            for scores in zip(*all_time_scores)
        ]

        return min_time_scores

    def calculate_checkpoint_score(
        self, checkpoint: int, *, team: Team, min_time_scores: List[float], penalty_per_puke: int = -20
    ) -> int:
        def calc_time_score(checkpoint: int, score: int) -> int:
            return int(min_time_scores[checkpoint] / score * 10) if score != 0 else 0

        def calc_question_scores(is_correct: bool) -> int:
            return int(is_correct) * 8

        def calc_pukes(pukes: int) -> int:
            return pukes * penalty_per_puke

        def calc_skips(skips: int) -> int:
            if skips > 0:
                return skips * -8
            return abs(skips) * 4

        return (
            calc_time_score(checkpoint, team.time_scores[checkpoint] if checkpoint < len(team.time_scores) else 0)
            + calc_question_scores(
                team.question_scores[checkpoint] if checkpoint < len(team.question_scores) else False
            )
            + calc_skips(team.skips[checkpoint] if checkpoint < len(team.skips) else 0)
            + calc_pukes(team.pukes[checkpoint] if checkpoint < len(team.pukes) else 0)
        )

    def update_classification_unlocked(self, db: Session) -> None:
        """Update team classifications based on activity results"""
        from app.services.scoring_service import ScoringService
        
        teams = list(self.get_multi(db=db, for_update=True))
        scoring_service = ScoringService(db)
        
        # Update scores for all teams based on activity results
        for team in teams:
            scoring_service.update_team_scores(team.id)
            db.refresh(team)  # Refresh to get updated scores
        
        # Sort teams by total score (descending), then by name (ascending)
        teams.sort(key=lambda t: (-t.total, t.name))
        
        # Update classifications
        for i, team in enumerate(teams):
            team.classification = i + 1
            db.add(team)

    def update_classification(self, db: Session) -> None:
        self.update_classification_unlocked(db)
        db.commit()

    def create(self, db: Session, *, obj_in: TeamCreate) -> Team:
        settings = rally_settings.get_or_create(db)
        current_team_count = db.scalar(select(func.count(Team.id)))

        if current_team_count >= settings.max_teams:
            raise HTTPException(status_code=400, detail="Team limit reached")
        
        try:
            team = super().create(db, obj_in=obj_in)
        except IntegrityError as e:
            db.rollback()

            if e.orig is None:
                raise

            if _name_unique_error_regex.search(str(e.orig)) is not None:
                raise HTTPException(status_code=400, detail="Team name already exists")

            raise

        self.update_classification(db=db)
        db.refresh(team)
        return team

    def update(self, db: Session, *, id: int, obj_in: TeamUpdate) -> Team:
        with db.begin_nested():
            team = self.get(db=db, id=id, for_update=True)
            update_data = obj_in.model_dump(exclude_unset=True)

            last_size = None
            for key in locked_arrays:
                size = len(update_data.get(key) or getattr(team, key))
                if last_size is not None and last_size != size:
                    raise APIException(
                        status_code=400, detail="Lists must have the same size"
                    )

                last_size = size

            team = super().update_unlocked(db_obj=team, obj_in=obj_in)
            db.commit()

        self.update_classification(db=db)
        db.refresh(team)
        return team

    def _validate_rally_timing(self, settings, current_time: datetime) -> None:
        """Validate rally timing constraints"""
        if settings.rally_start_time and current_time < settings.rally_start_time:
            raise APIException(
                status_code=400, 
                detail=f"Rally has not started yet. Starts at {settings.rally_start_time.isoformat()}"
            )
        
        if settings.rally_end_time and current_time > settings.rally_end_time:
            raise APIException(
                status_code=400, 
                detail=f"Rally has ended. Ended at {settings.rally_end_time.isoformat()}"
            )

    def _validate_checkpoint_order(self, team, checkpoint_id: int, settings) -> None:
        """Validate checkpoint order constraints"""
        if settings.checkpoint_order_matters:
            if len(team.times) != checkpoint_id - 1:
                raise APIException(
                    status_code=400, 
                    detail="Checkpoint not in order, or already passed. Checkpoint order matters is enabled."
                )
        else:
            # If order doesn't matter, just check if checkpoint already visited
            if checkpoint_id <= len(team.times):
                raise APIException(
                    status_code=400, 
                    detail="Checkpoint already visited"
                )


    def add_checkpoint(
        self, db: Session, *, id: int, checkpoint_id: int, obj_in: TeamScoresUpdate
    ) -> Team:
        with db.begin_nested():
            team = self.get(db=db, id=id, for_update=True)
            settings = rally_settings.get_or_create(db)
            current_time = datetime.now(timezone.utc)

            # Validate timing and order constraints
            self._validate_rally_timing(settings, current_time)
            self._validate_checkpoint_order(team, checkpoint_id, settings)

            # Add scores and times
            team.question_scores.append(obj_in.question_score)
            team.time_scores.append(obj_in.time_score)
            team.pukes.append(obj_in.pukes)
            team.skips.append(obj_in.skips)
            team.times.append(current_time)

            db.commit()
        self.update_classification(db=db)
        db.refresh(team)
        return team


    def get_by_checkpoint(self, db: Session, checkpoint_id: int) -> Sequence[Team]:
        stmt = select(Team).where(func.cardinality(Team.times) == checkpoint_id)
        return db.scalars(stmt).all()


team = CRUDTeam(Team)
