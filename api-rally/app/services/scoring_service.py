"""
Scoring system service for Rally activities
"""
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from datetime import datetime

from app.models.activity import ActivityResult, Activity
from app.models.team import Team
from app.models.user import User
from app.models.rally_settings import RallySettings
from app.core.config import settings


class ScoringService:
    """Service for handling Rally scoring rules and calculations"""
    
    def __init__(self, db: Session):
        self.db = db
        self._settings = None
    
    def _get_settings(self) -> RallySettings:
        """Get rally settings from database (cached)"""
        if self._settings is None:
            self._settings = self.db.query(RallySettings).first()
            if not self._settings:
                # Create default settings if none exist
                self._settings = RallySettings()
                self.db.add(self._settings)
                self.db.commit()
        return self._settings
    
    def calculate_team_total_score(self, team_id: int) -> float:
        """Calculate total score for a team including all modifiers"""
        results = self.db.query(ActivityResult).filter(
            ActivityResult.team_id == team_id
        ).all()
        total_score = 0
        
        for result in results:
            if result.is_completed and result.final_score is not None:
                total_score += result.final_score
        
        return total_score
    
    def update_team_scores(self, team_id: int) -> bool:
        """Update team's total and score_per_checkpoint based on activity results"""
        team = self.db.query(Team).filter(Team.id == team_id).first()
        if not team:
            return False
        
        # Get all activity results for this team
        results = self.db.query(ActivityResult).filter(
            ActivityResult.team_id == team_id
        ).all()
        
        # Group results by checkpoint
        checkpoint_scores = {}
        total_score = 0
        
        for result in results:
            if result.is_completed and result.final_score is not None:
                # Get activity to find checkpoint
                activity = self.db.query(Activity).filter(Activity.id == result.activity_id).first()
                if activity:
                    checkpoint_id = activity.checkpoint_id
                    if checkpoint_id not in checkpoint_scores:
                        checkpoint_scores[checkpoint_id] = 0
                    checkpoint_scores[checkpoint_id] += result.final_score
                    total_score += result.final_score
        
        # Update team scores
        team.total = total_score
        
        # Update score_per_checkpoint array to match times array length
        max_checkpoint = max(checkpoint_scores.keys()) if checkpoint_scores else 0
        team.score_per_checkpoint = [
            checkpoint_scores.get(i + 1, 0) for i in range(len(team.times))
        ]
        
        # Only commit if not in a nested transaction (savepoint)
        if not self.db.in_nested_transaction():
            self.db.commit()
        return True
    
    def apply_extra_shots_bonus(self, team_id: int, activity_id: int, extra_shots: int) -> bool:
        """Apply extra shots bonus to a team's activity result"""
        # Get team size to validate limit
        team = self.db.query(Team).filter(Team.id == team_id).first()
        if not team:
            return False
        
        team_size = len(team.members)
        
        # Validate extra shots limit (configurable per team member)
        settings = self._get_settings()
        max_shots = team_size * settings.max_extra_shots_per_member
        if extra_shots > max_shots:
            return False
        
        # Get or create activity result
        result = self.db.query(ActivityResult).filter(
            ActivityResult.activity_id == activity_id,
            ActivityResult.team_id == team_id
        ).first()
        if not result:
            return False
        
        # Update extra shots
        result.extra_shots = extra_shots
        
        # Recalculate final score
        self._recalculate_result_score(result)
        
        self.db.commit()
        return True
    
    def apply_penalty(self, team_id: int, activity_id: int, penalty_type: str, penalty_value: int) -> bool:
        """Apply penalty to a team's activity result"""
        result = self.db.query(ActivityResult).filter(
            ActivityResult.activity_id == activity_id,
            ActivityResult.team_id == team_id
        ).first()
        if not result:
            return False
        
        # Add penalty to penalties dict
        if penalty_type not in result.penalties:
            result.penalties[penalty_type] = 0
        result.penalties[penalty_type] += penalty_value
        
        # Recalculate final score
        self._recalculate_result_score(result)
        
        self.db.commit()
        return True
    
    def apply_vomit_penalty(self, team_id: int, activity_id: int) -> bool:
        """Apply vomit penalty (configurable points)"""
        settings = self._get_settings()
        return self.apply_penalty(team_id, activity_id, "vomit", abs(settings.penalty_per_puke))
    
    def apply_drink_penalty(self, team_id: int, activity_id: int, participants_not_drinking: int) -> bool:
        """Apply penalty for not drinking (configurable points per participant)"""
        settings = self._get_settings()
        penalty_value = participants_not_drinking * abs(settings.penalty_per_not_drinking)
        return self.apply_penalty(team_id, activity_id, "not_drinking", penalty_value)
    
    def _recalculate_result_score(self, result: ActivityResult) -> None:
        """Recalculate the final score for an activity result"""
        from app.models.activity_factory import ActivityFactory
        from app.models.activity import Activity
        
        # Get activity
        activity = self.db.query(Activity).filter(Activity.id == result.activity_id).first()
        if not activity:
            return
        
        # Create activity instance
        activity_instance = ActivityFactory.create_activity(
            activity.activity_type, 
            activity.config
        )
        
        # Get team size
        team = self.db.query(Team).filter(Team.id == result.team_id).first()
        team_size = len(team.members) if team else 1
        
        # Calculate base score
        base_score = activity_instance.calculate_score(result.result_data, team_size)
        
        # Apply modifiers
        modifiers = {
            'extra_shots': result.extra_shots,
            'penalties': result.penalties
        }
        
        result.final_score = activity_instance.apply_modifiers(base_score, modifiers, self.db)
    
    def get_team_ranking(self, activity_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get team ranking for specific activity or global ranking"""
        if activity_id:
            # Activity-specific ranking
            results = self.db.query(ActivityResult).filter(
            ActivityResult.activity_id == activity_id
        ).all()
            ranking = []
            for i, result in enumerate(results, 1):
                team = self.db.query(Team).filter(Team.id == result.team_id).first()
                if team:
                    ranking.append({
                        'rank': i,
                        'team_id': team.id,
                        'team_name': team.name,
                        'score': result.final_score or 0,
                        'completed_at': result.completed_at
                    })
        else:
            # Global ranking
            teams = self.db.query(Team).all()
            ranking = []
            for team in teams:
                total_score = self.calculate_team_total_score(team.id)
                ranking.append({
                    'team_id': team.id,
                    'team_name': team.name,
                    'total_score': total_score,
                    'activities_completed': len([r for r in team.activity_results if r.is_completed])
                })
            
            # Sort by total score descending
            ranking.sort(key=lambda x: x['total_score'], reverse=True)
            
            # Add ranks
            for i, team_rank in enumerate(ranking, 1):
                team_rank['rank'] = i
        
        return ranking
    
    def get_activity_statistics(self, activity_id: int) -> Dict[str, Any]:
        """Get statistics for a specific activity"""
        results = self.db.query(ActivityResult).filter(
            ActivityResult.activity_id == activity_id
        ).all()
        
        if not results:
            return {
                'total_participants': 0,
                'average_score': 0,
                'best_score': 0,
                'worst_score': 0,
                'completion_rate': 0
            }
        
        completed_results = [r for r in results if r.is_completed and r.final_score is not None]
        scores = [r.final_score for r in completed_results]
        
        return {
            'total_participants': len(results),
            'completed_participants': len(completed_results),
            'average_score': sum(scores) / len(scores) if scores else 0,
            'best_score': max(scores) if scores else 0,
            'worst_score': min(scores) if scores else 0,
            'completion_rate': len(completed_results) / len(results) if results else 0
        }
    
    def validate_team_vs_match(self, team1_id: int, team2_id: int, activity_id: int) -> bool:
        """Validate that two teams can compete in a team vs team activity"""
        # Check if both teams exist
        team1 = self.db.query(Team).filter(Team.id == team1_id).first()
        team2 = self.db.query(Team).filter(Team.id == team2_id).first()
        
        if not team1 or not team2:
            return False
        
        # Check if teams already have results for this activity
        result1 = activity_result.get_by_activity_and_team(self.db, activity_id, team1_id)
        result2 = activity_result.get_by_activity_and_team(self.db, activity_id, team2_id)
        
        if result1 and result1.is_completed:
            return False
        
        if result2 and result2.is_completed:
            return False
        
        return True
    
    def create_team_vs_result(self, team1_id: int, team2_id: int, activity_id: int, 
                             winner_id: int, match_data: Dict[str, Any]) -> Tuple[bool, str]:
        """Create results for both teams in a team vs team activity"""
        if not self.validate_team_vs_match(team1_id, team2_id, activity_id):
            return False, "Teams cannot compete in this activity"
        
        # Determine results
        team1_result = "win" if winner_id == team1_id else ("draw" if winner_id == 0 else "lose")
        team2_result = "win" if winner_id == team2_id else ("draw" if winner_id == 0 else "lose")
        
        # Create result for team 1
        result1_data = {
            'result': team1_result,
            'opponent_team_id': team2_id,
            **match_data
        }
        
        # Create result for team 2
        result2_data = {
            'result': team2_result,
            'opponent_team_id': team1_id,
            **match_data
        }
        
        try:
            # Create both results
            from app.schemas.activity import ActivityResultCreate
            
            result1_create = ActivityResultCreate(
                activity_id=activity_id,
                team_id=team1_id,
                result_data=result1_data
            )
            
            result2_create = ActivityResultCreate(
                activity_id=activity_id,
                team_id=team2_id,
                result_data=result2_data
            )
            
            # Create result objects directly
            result1_obj = ActivityResult(**result1_create.dict())
            result2_obj = ActivityResult(**result2_create.dict())
            self.db.add(result1_obj)
            self.db.add(result2_obj)
            
            return True, "Team vs team results created successfully"
            
        except Exception as e:
            return False, f"Error creating team vs team results: {str(e)}"
