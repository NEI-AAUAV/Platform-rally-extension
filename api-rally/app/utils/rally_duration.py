from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from app.crud.crud_rally_settings import rally_settings
from sqlalchemy.orm import Session


class RallyDurationCalculator:
    """Utility class for calculating rally duration and timing information."""
    
    def __init__(self, db: Session):
        self.db = db
        self.settings = rally_settings.get_or_create(db)
    
    def get_rally_status(self) -> Dict[str, Any]:
        """Get current rally status and timing information."""
        current_time = datetime.now(timezone.utc)
        status = self._build_base_status(current_time)

        start_time = self._extract_datetime(self.settings.rally_start_time)
        end_time = self._extract_datetime(self.settings.rally_end_time)

        if not start_time:
            status["status"] = "no_start_time"
            return status

        if current_time < start_time:
            return self._build_not_started_status(status, start_time, current_time)

        if end_time and current_time > end_time:
            return self._build_ended_status(status, start_time, end_time, current_time)

        return self._build_active_status(status, start_time, end_time, current_time)

    def _build_base_status(self, current_time: datetime) -> Dict[str, Any]:
        return {
            "current_time": current_time.isoformat(),
            "rally_start_time": self.settings.rally_start_time.isoformat() if self.settings.rally_start_time else None,
            "rally_end_time": self.settings.rally_end_time.isoformat() if self.settings.rally_end_time else None,
            "status": "not_started",
            "time_remaining": None,
            "time_elapsed": None,
            "total_duration": None,
        }

    def _extract_datetime(self, value: Optional[datetime]) -> Optional[datetime]:
        """
        Convert SQLAlchemy column values to datetime.
        mypy treats ORM columns as ColumnElement, but runtime provides datetime.
        """
        return value  # type: ignore[return-value]

    def _build_not_started_status(self, status: Dict[str, Any], start_time: datetime, current_time: datetime) -> Dict[str, Any]:
        time_until_start = start_time - current_time
        status.update({
            "status": "not_started",
            "time_remaining": self._format_duration(time_until_start),
            "time_until_start": self._format_duration(time_until_start),
        })
        return status

    def _build_ended_status(
        self,
        status: Dict[str, Any],
        start_time: datetime,
        end_time: datetime,
        current_time: datetime,
    ) -> Dict[str, Any]:
        time_since_end = current_time - end_time
        total_duration = end_time - start_time
        status.update({
            "status": "ended",
            "time_elapsed": self._format_duration(time_since_end),
            "total_duration": self._format_duration(total_duration),
            "time_since_end": self._format_duration(time_since_end),
        })
        return status

    def _build_active_status(
        self,
        status: Dict[str, Any],
        start_time: datetime,
        end_time: Optional[datetime],
        current_time: datetime,
    ) -> Dict[str, Any]:
        time_elapsed = current_time - start_time

        if not end_time:
            status.update({
                "status": "active_no_end",
                "time_elapsed": self._format_duration(time_elapsed),
            })
            return status

        time_remaining = end_time - current_time
        total_duration = end_time - start_time
        status.update({
            "status": "active",
            "time_elapsed": self._format_duration(time_elapsed),
            "time_remaining": self._format_duration(time_remaining),
            "total_duration": self._format_duration(total_duration),
            "progress_percentage": self._calculate_progress_percentage(time_elapsed, total_duration),
        })
        return status
    
    def get_team_rally_duration(self, team_start_time: datetime) -> Dict[str, Any]:
        """Calculate rally duration for a specific team."""
        current_time = datetime.now(timezone.utc)
        
        if not self.settings.rally_start_time:
            return {"error": "No rally start time configured"}
        
        # Calculate team's rally duration
        team_duration = current_time - team_start_time
        
        # Calculate total rally duration if end time is set
        total_rally_duration: Optional[timedelta] = None
        end_time: Optional[datetime] = self.settings.rally_end_time  # type: ignore[assignment]
        start_time: Optional[datetime] = self.settings.rally_start_time  # type: ignore[assignment]
        if end_time and start_time:
            total_rally_duration = end_time - start_time
        
        return {
            "team_start_time": team_start_time.isoformat(),
            "current_time": current_time.isoformat(),
            "team_duration": self._format_duration(team_duration),
            "team_duration_seconds": team_duration.total_seconds(),
            "total_rally_duration": self._format_duration(total_rally_duration) if total_rally_duration else None,
            "total_rally_duration_seconds": total_rally_duration.total_seconds() if total_rally_duration else None,
            "is_within_rally_time": self._is_within_rally_time(team_start_time)
        }
    
    def _format_duration(self, duration: timedelta) -> Optional[str]:
        """Format a timedelta into a human-readable string."""
        if duration is None:
            return None
            
        total_seconds = int(duration.total_seconds())
        days = total_seconds // 86400
        hours = (total_seconds % 86400) // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        
        parts = []
        if days > 0:
            parts.append(f"{days}d")
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0:
            parts.append(f"{minutes}m")
        if seconds > 0 or not parts:
            parts.append(f"{seconds}s")
        
        return " ".join(parts)
    
    def _calculate_progress_percentage(self, elapsed: timedelta, total: timedelta) -> float:
        """Calculate rally progress as a percentage."""
        if total.total_seconds() == 0:
            return 0.0
        return min(100.0, (elapsed.total_seconds() / total.total_seconds()) * 100)
    
    def _is_within_rally_time(self, team_start_time: datetime) -> bool:
        """Check if team start time is within rally time bounds."""
        if not self.settings.rally_start_time:
            return False
        
        if team_start_time < self.settings.rally_start_time:
            return False
        
        if self.settings.rally_end_time and team_start_time > self.settings.rally_end_time:
            return False
        
        return True


def get_rally_duration_info(db: Session) -> Dict[str, Any]:
    """Convenience function to get rally duration information."""
    calculator = RallyDurationCalculator(db)
    return calculator.get_rally_status()


def get_team_duration_info(db: Session, team_start_time: datetime) -> Dict[str, Any]:
    """Convenience function to get team duration information."""
    calculator = RallyDurationCalculator(db)
    return calculator.get_team_rally_duration(team_start_time)
