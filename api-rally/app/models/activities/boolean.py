"""
Boolean activities for Rally extension
"""
from typing import Dict, Any

from .base import BaseActivity


class BooleanActivity(BaseActivity):
    """Boolean activities"""
    
    @classmethod
    def get_type(cls) -> str:
        return "BooleanActivity"
    
    @classmethod
    def get_default_config(cls) -> Dict[str, Any]:
        return {
            "success_points": 100,
            "failure_points": 0
        }
    
    def calculate_score(self, result_data: Dict[str, Any], team_size: int = 1) -> float:
        """Calculate score based on success/failure"""
        success = result_data.get('success', False)
        
        if success:
            return self.config.get('success_points', 100)
        else:
            return self.config.get('failure_points', 0)
    
    def validate_result(self, result_data: Dict[str, Any], team_id: int = None, db_session=None) -> bool:
        """Validate boolean result data"""
        required_fields = ['success']
        return all(field in result_data for field in required_fields)
    
    def get_result_schema(self) -> Dict[str, Any]:
        """Return schema for boolean results"""
        return {
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "attempts": {"type": "integer", "minimum": 1},
                "notes": {"type": "string"}
            },
            "required": ["success"]
        }
