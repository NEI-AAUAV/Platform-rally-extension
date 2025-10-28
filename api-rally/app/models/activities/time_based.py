"""
Time-based activities for Rally extension
"""
from typing import Dict, Any, List

from .base import BaseActivity


class TimeBasedActivity(BaseActivity):
    
    @classmethod
    def get_type(cls) -> str:
        return "TimeBasedActivity"
    
    @classmethod
    def get_default_config(cls) -> Dict[str, Any]:
        return {
            "max_points": 100,
            "min_points": 10
        }
    
    def calculate_score(self, result_data: Dict[str, Any], team_size: int = 1) -> float:
        """Calculate score based on completion time"""
        completion_time = result_data.get('completion_time_seconds')
        if not completion_time:
            return 0
        
        # For relative ranking system, we need all team results
        # This method will be called by ScoringService with context
        return completion_time  # Return raw time for ranking calculation
    
    def calculate_relative_ranking_score(self, team_times: List[float], team_time: float) -> float:
        """Calculate score based on relative ranking among all teams"""
        if not team_times or team_time not in team_times:
            return 0
        
        # Sort times (fastest first) and handle ties properly
        sorted_times = sorted(team_times)
        
        # Count how many times are better (faster) than the current team's time
        # This handles ties correctly by treating equal times as the same rank
        better_times_count = sum(1 for time in sorted_times if time < team_time)
        
        # Rank is 1-based: how many teams are better + 1
        rank = better_times_count + 1
        
        total_teams = len(team_times)
        
        # Get config values
        max_points = self.config.get('max_points', 100)
        min_points = self.config.get('min_points', 10)
        
        if total_teams == 1:
            return max_points
        
        # Calculate score based on ranking
        # 1st place gets max_points, last place gets min_points
        # Others are distributed proportionally
        # Teams with identical times get the same rank and score
        if rank == 1:
            return max_points
        elif rank == total_teams:
            return min_points
        else:
            # Linear interpolation between max and min
            score_range = max_points - min_points
            position_ratio = (rank - 1) / (total_teams - 1)
            return max_points - (score_range * position_ratio)
    
    def validate_result(self, result_data: Dict[str, Any], team_id: int = None, db_session=None) -> bool:
        """Validate time-based result data"""
        required_fields = ['completion_time_seconds']
        return all(field in result_data for field in required_fields)
    
    def get_result_schema(self) -> Dict[str, Any]:
        """Return schema for time-based results"""
        return {
            "type": "object",
            "properties": {
                "completion_time_seconds": {"type": "number", "minimum": 0},
                "notes": {"type": "string"}
            },
            "required": ["completion_time_seconds"]
        }
