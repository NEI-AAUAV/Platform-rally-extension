import math
import random
from typing import List, Sequence
from datetime import datetime
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
            min(map(lambda s: s if s != 0 else math.inf, scores))
            for scores in zip(*all_time_scores)
        ]

        return min_time_scores

    def calculate_checkpoint_score(
        self, checkpoint: int, *, team: Team, min_time_scores: List[float], penalty_per_puke: int = -20
    ) -> int:
        def calc_time_score(checkpoint: int, score: int) -> int:
            return int(min_time_scores[checkpoint] / score * 10) if score != 0 else 0

        def calc_question_scores(used_card: bool, is_correct: bool) -> int:
            return 6 if used_card else int(is_correct) * 8

        def calc_pukes(used_card: bool, pukes: int) -> int:
            return (pukes - 1 if used_card else pukes) * penalty_per_puke

        def calc_skips(used_card: bool, skips: int) -> int:
            if skips > 0:
                return (skips - 1 if used_card else skips) * -8
            return abs(skips) * 4

        return (
            calc_time_score(checkpoint, team.time_scores[checkpoint] if checkpoint < len(team.time_scores) else 0)
            + calc_question_scores(
                team.card1 == checkpoint + 1, team.question_scores[checkpoint] if checkpoint < len(team.question_scores) else False
            )
            + calc_skips(team.card2 == checkpoint + 1, team.skips[checkpoint] if checkpoint < len(team.skips) else 0)
            + calc_pukes(team.card3 == checkpoint + 1, team.pukes[checkpoint] if checkpoint < len(team.pukes) else 0)
        )

    def update_classification_unlocked(self, db: Session) -> None:
        teams = list(self.get_multi(db=db, for_update=True))
        settings = rally_settings.get_or_create(db)

        min_time_scores = self.calculate_min_time_scores(teams)

        for t in teams:
            t.score_per_checkpoint = [
                self.calculate_checkpoint_score(
                    i, team=t, min_time_scores=min_time_scores, penalty_per_puke=settings.penalty_per_puke
                )
                for i in range(len(t.times))
            ]
            t.total = sum(t.score_per_checkpoint)

        teams.sort(key=lambda t: (-t.total, t.name))

        for i, team in enumerate(teams):
            team.classification = i + 1
            db.add(team)

    def update_classification(self, db: Session) -> None:
        with db.begin_nested():
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

    def add_checkpoint(
        self, db: Session, *, id: int, checkpoint_id: int, obj_in: TeamScoresUpdate
    ) -> Team:
        with db.begin_nested():
            team = self.get(db=db, id=id, for_update=True)
            settings = rally_settings.get_or_create(db)

            # Time-based validation (using UTC)
            current_time = datetime.utcnow()
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

            # Checkpoint order validation (if enabled)
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

            time = current_time
            team.question_scores.append(obj_in.question_score)
            team.time_scores.append(obj_in.time_score)
            team.pukes.append(obj_in.pukes)
            team.skips.append(obj_in.skips)
            team.times.append(time)

            # add cards randomly
            pity = len(team.times) == 7
            chance = random.random() > 0.6
            if chance or pity:
                for card in random.sample(("card1", "card2", "card3"), 3):
                    if getattr(team, card) == -1:
                        setattr(team, card, 0)
                        if chance:
                            break

            db.commit()
        self.update_classification(db=db)
        db.refresh(team)
        return team


    def get_by_checkpoint(self, db: Session, checkpoint_id: int) -> Sequence[Team]:
        stmt = select(Team).where(func.cardinality(Team.times) == checkpoint_id)
        return db.scalars(stmt).all()


team = CRUDTeam(Team)
