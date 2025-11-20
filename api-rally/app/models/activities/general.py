"""
General activities for Rally extension - flexible scoring within a range
"""
from typing import Dict, Any, Optional

from .base import BaseActivity


class GeneralActivity(BaseActivity):
    """General activities with flexible scoring within a configurable range"""
    
    @classmethod
    def get_type(cls) -> str:
        return "GeneralActivity"
    
    @classmethod
    def get_default_config(cls) -> Dict[str, Any]:
        return {
            "min_points": 0,
            "max_points": 100,
            "default_points": 50
        }
    
    def calculate_score(self, result_data: Dict[str, Any], team_size: int = 1) -> float:
        """Calculate score based on staff-assigned points within range"""
        assigned_points = result_data.get('assigned_points', 0)
        min_points = self.config.get('min_points', 0)
        max_points = self.config.get('max_points', 100)
        
        # Ensure points are within the configured range
        if assigned_points < min_points:
            assigned_points = min_points
        elif assigned_points > max_points:
            assigned_points = max_points
        
        return float(assigned_points)
    
    def validate_result(self, result_data: Dict[str, Any], team_id: Optional[int] = None, db_session: Any = None) -> bool:
        """Validate general activity result data"""
        required_fields = ['assigned_points']
        
        if not all(field in result_data for field in required_fields):
            return False
        
        # Validate that assigned_points is a number
        try:
            points = float(result_data['assigned_points'])
            min_points = float(self.config.get('min_points', 0))
            max_points = float(self.config.get('max_points', 100))
            
            return bool(min_points <= points <= max_points)
        except (ValueError, TypeError):
            return False
    
    def get_result_schema(self) -> Dict[str, Any]:
        """Return schema for general activity results"""
        min_points = self.config.get('min_points', 0)
        max_points = self.config.get('max_points', 100)
        
        return {
            "type": "object",
            "properties": {
                "assigned_points": {
                    "type": "number", 
                    "minimum": min_points, 
                    "maximum": max_points
                },
                "reasoning": {"type": "string", "description": "Reason for the assigned score"},
                "notes": {"type": "string"}
            },
            "required": ["assigned_points"]
        }
