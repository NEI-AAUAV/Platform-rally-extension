"""
Team vs Team activities for Rally extension
"""
from typing import Dict, Any

from .base import BaseActivity


class TeamVsActivity(BaseActivity):
    """Team vs Team activities (e.g., Aristides puxar corda)"""
    
    def calculate_score(self, result_data: Dict[str, Any], team_size: int = 1) -> float:
        """Calculate score based on team vs team result"""
        result = result_data.get('result')  # 'win', 'lose', 'draw'
        
        if result == 'win':
            return self.config.get('win_points', 100)
        elif result == 'draw':
            return self.config.get('draw_points', 50)
        elif result == 'lose':
            return self.config.get('lose_points', 0)
        else:
            return 0
    
    def validate_result(self, result_data: Dict[str, Any]) -> bool:
        """Validate team vs team result data"""
        required_fields = ['result', 'opponent_team_id']
        valid_results = ['win', 'lose', 'draw']
        
        return (all(field in result_data for field in required_fields) and
                result_data['result'] in valid_results)
    
    def get_result_schema(self) -> Dict[str, Any]:
        """Return schema for team vs team results"""
        return {
            "type": "object",
            "properties": {
                "result": {"type": "string", "enum": ["win", "lose", "draw"]},
                "opponent_team_id": {"type": "integer"},
                "match_duration_seconds": {"type": "number", "minimum": 0},
                "notes": {"type": "string"}
            },
            "required": ["result", "opponent_team_id"]
        }
