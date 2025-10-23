"""
Base activity class for Rally extension
"""
from abc import ABC, abstractmethod
from typing import Dict, Any
from app.core.config import settings


class BaseActivity(ABC):
    """Base abstract class for all activities"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = self.get_default_config()
        self.config.update(config)
    
    @classmethod
    @abstractmethod
    def get_type(cls) -> str:
        """Return the string identifier for this activity type"""
        pass
    
    @classmethod
    @abstractmethod
    def get_default_config(cls) -> Dict[str, Any]:
        """Return the default configuration for this activity type"""
        pass
    
    @abstractmethod
    def calculate_score(self, result_data: Dict[str, Any], team_size: int = 1) -> float:
        """Calculate the final score for this activity"""
        pass
    
    @abstractmethod
    def validate_result(self, result_data: Dict[str, Any]) -> bool:
        """Validate that the result data is correct for this activity type"""
        pass
    
    @abstractmethod
    def get_result_schema(self) -> Dict[str, Any]:
        """Return the expected schema for result data"""
        pass
    
    def apply_modifiers(self, base_score: float, modifiers: Dict[str, Any], db_session=None) -> float:
        """Apply scoring modifiers (extra shots, costume bonus, penalties)"""
        final_score = base_score
        
        # Apply extra shots bonus (configurable)
        extra_shots = modifiers.get('extra_shots', 0)
        if extra_shots > 0:
            if db_session:
                # Use database settings if available
                from app.models.rally_settings import RallySettings
                settings = db_session.query(RallySettings).first()
                if settings:
                    bonus_per_shot = settings.bonus_per_extra_shot
                else:
                    bonus_per_shot = 1  # fallback
            else:
                # Fallback to config file
                from app.core.config import settings
                bonus_per_shot = settings.EXTRA_SHOT_BONUS
            
            final_score += extra_shots * bonus_per_shot
        
        # Apply penalties
        penalties = modifiers.get('penalties', {})
        for penalty_type, penalty_value in penalties.items():
            final_score -= penalty_value
        
        return max(0, final_score)  # Score cannot be negative