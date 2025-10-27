"""
Team vs Team activities for Rally extension
"""
from typing import Dict, Any

from .base import BaseActivity


class TeamVsActivity(BaseActivity):
    
    @classmethod
    def get_type(cls) -> str:
        return "TeamVsActivity"
    
    @classmethod
    def get_default_config(cls) -> Dict[str, Any]:
        return {
            "win_points": 100,
            "draw_points": 50,
            "lose_points": 0
        }
    
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
    
    def validate_result(self, result_data: Dict[str, Any], team_id: int = None, db_session=None) -> bool:
        """Validate team vs team result data with versus group validation"""
        valid_results = ['win', 'lose', 'draw']
        
        # Basic validation - only result is required
        if 'result' not in result_data or result_data['result'] not in valid_results:
            return False
        
        # If we have opponent_team_id and both team_id and db_session, validate versus group
        if 'opponent_team_id' in result_data and result_data['opponent_team_id'] is not None and team_id and db_session:
            return self._validate_versus_group(team_id, result_data['opponent_team_id'], db_session)
        
        return True
    
    def _validate_versus_group(self, team_id: int, opponent_team_id: int, db_session) -> bool:
        """Validate that teams are in the same versus group"""
        try:
            from app.crud.crud_versus import versus
            
            # Get opponent using versus system
            opponent = versus.get_opponent(db_session, team_id=team_id)
            
            # Check if the opponent matches the provided opponent_team_id
            return opponent is not None and opponent.id == opponent_team_id
            
        except Exception:
            # If versus system fails, fall back to basic validation
            return True
    
    def get_opponent_for_team(self, team_id: int, db_session) -> Dict[str, Any]:
        """Get opponent team information for a given team"""
        try:
            from app.crud.crud_versus import versus
            
            opponent = versus.get_opponent(db_session, team_id=team_id)
            if opponent:
                return {
                    "opponent_team_id": opponent.id,
                    "opponent_team_name": opponent.name,
                    "versus_group_id": opponent.versus_group_id
                }
            return None
            
        except Exception:
            return None
    
    def create_result_for_versus_group(self, team_id: int, result: str, match_data: Dict[str, Any], db_session) -> Dict[str, Any]:
        """Create result data for a team in a versus group"""
        opponent_info = self.get_opponent_for_team(team_id, db_session)
        
        if not opponent_info:
            raise ValueError(f"Team {team_id} is not in a valid versus group")
        
        return {
            "result": result,
            "opponent_team_id": opponent_info["opponent_team_id"],
            **match_data
        }
    
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
