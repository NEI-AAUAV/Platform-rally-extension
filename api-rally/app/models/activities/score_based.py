"""
Score-based activities for Rally extension
"""
from typing import Dict, Any

from .base import BaseActivity


class ScoreBasedActivity(BaseActivity):
    
    @classmethod
    def get_type(cls) -> str:
        return "ScoreBasedActivity"
    
    @classmethod
    def get_default_config(cls) -> Dict[str, Any]:
        return {
            "max_points": 100,
            "base_score": 50
        }
    
    def calculate_score(self, result_data: Dict[str, Any], team_size: int = 1) -> float:
        """Calculate score based on achieved points"""
        achieved_points = result_data.get('achieved_points', 0)
        max_points = self.config.get('max_points', 100)
        
        # Calculate percentage of max points achieved
        percentage = min(achieved_points / max_points, 1.0)
        
        # Base score calculation
        base_score = self.config.get('base_score', 50)
        return base_score * percentage
    
    def validate_result(self, result_data: Dict[str, Any], team_id: int = None, db_session=None) -> bool:
        """Validate score-based result data"""
        required_fields = ['achieved_points']
        return all(field in result_data for field in required_fields)
    
    def get_result_schema(self) -> Dict[str, Any]:
        """Return schema for score-based results"""
        return {
            "type": "object",
            "properties": {
                "achieved_points": {"type": "integer", "minimum": 0},
                "max_possible_points": {"type": "integer", "minimum": 1},
                "notes": {"type": "string"}
            },
            "required": ["achieved_points"]
        }
