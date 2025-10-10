"""
Attribute-Based Access Control (ABAC) for Rally Extension

This module implements ABAC policies for Rally checkpoint management,
ensuring staff can only add scores to teams at their assigned checkpoint.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.checkpoint import CheckPoint
from app.models.team import Team
from app.schemas.user import DetailedUser
from app.api.auth import AuthData


class Action(Enum):
    """Actions that can be performed on Rally resources"""
    ADD_CHECKPOINT_SCORE = "add_checkpoint_score"
    VIEW_CHECKPOINT_TEAMS = "view_checkpoint_teams"
    CREATE_CHECKPOINT = "create_checkpoint"
    UPDATE_CHECKPOINT = "update_checkpoint"
    CREATE_TEAM = "create_team"
    UPDATE_TEAM = "update_team"


class Resource(Enum):
    """Resources in the Rally system"""
    CHECKPOINT = "checkpoint"
    TEAM = "team"
    SCORE = "score"


@dataclass
class Context:
    """ABAC evaluation context"""
    user: DetailedUser
    auth: AuthData
    action: Action
    resource: Resource
    resource_id: Optional[int] = None
    checkpoint_id: Optional[int] = None
    team_id: Optional[int] = None
    request_time: Optional[datetime] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    
    def __post_init__(self):
        if self.request_time is None:
            self.request_time = datetime.now()


@dataclass
class Policy:
    """ABAC policy definition"""
    name: str
    description: str
    effect: str  # "allow" or "deny"
    conditions: Dict[str, Any]
    priority: int = 0


class ABACEngine:
    """ABAC policy evaluation engine"""
    
    def __init__(self):
        self.policies: List[Policy] = []
        self._load_default_policies()
    
    def _load_default_policies(self):
        """Load default Rally ABAC policies"""
        
        # Policy 1: Admins can do everything
        self.policies.append(Policy(
            name="admin_full_access",
            description="Admins have full access to all Rally resources",
            effect="allow",
            conditions={
                "user_scopes": {"contains": "admin"}
            },
            priority=100
        ))
        
        # Policy 2: Rally managers can manage checkpoints and teams
        self.policies.append(Policy(
            name="rally_manager_access",
            description="Rally managers can manage checkpoints and teams",
            effect="allow",
            conditions={
                "user_scopes": {"contains": "manager-rally"},
                "action": {"in": [
                    Action.CREATE_CHECKPOINT.value,
                    Action.UPDATE_CHECKPOINT.value,
                    Action.CREATE_TEAM.value,
                    Action.UPDATE_TEAM.value,
                    Action.VIEW_CHECKPOINT_TEAMS.value
                ]}
            },
            priority=90
        ))
        
        # Policy 3: Staff can only add scores at their assigned checkpoint
        self.policies.append(Policy(
            name="staff_checkpoint_restriction",
            description="Staff can only add scores at their assigned checkpoint",
            effect="allow",
            conditions={
                "user_scopes": {"contains": "rally-staff"},
                "action": Action.ADD_CHECKPOINT_SCORE.value,
                "user_staff_checkpoint_id": {"equals": "checkpoint_id"},
                "checkpoint_id": {"is_not_null": True}
            },
            priority=80
        ))
        
        # Policy 4: Staff can view teams at their checkpoint
        self.policies.append(Policy(
            name="staff_view_checkpoint_teams",
            description="Staff can view teams at their assigned checkpoint",
            effect="allow",
            conditions={
                "user_scopes": {"contains": "rally-staff"},
                "action": Action.VIEW_CHECKPOINT_TEAMS.value,
                "user_staff_checkpoint_id": {"equals": "checkpoint_id"},
                "checkpoint_id": {"is_not_null": True}
            },
            priority=80
        ))
        
        # Policy 5: Deny all other staff actions
        self.policies.append(Policy(
            name="staff_default_deny",
            description="Deny all other staff actions",
            effect="deny",
            conditions={
                "user_scopes": {"contains": "rally-staff"},
                "action": {"not_in": [
                    Action.ADD_CHECKPOINT_SCORE.value,
                    Action.VIEW_CHECKPOINT_TEAMS.value
                ]}
            },
            priority=70
        ))
        
        # Policy 6: Default deny for unauthenticated users
        self.policies.append(Policy(
            name="default_deny",
            description="Deny all actions for unauthenticated users",
            effect="deny",
            conditions={},
            priority=0
        ))
    
    def evaluate(self, context: Context) -> bool:
        """
        Evaluate ABAC policies against the given context
        
        Returns:
            True if access is allowed, False if denied
        """
        # Sort policies by priority (highest first)
        sorted_policies = sorted(self.policies, key=lambda p: p.priority, reverse=True)
        
        for policy in sorted_policies:
            if self._evaluate_conditions(policy.conditions, context):
                return policy.effect == "allow"
        
        # Default deny if no policy matches
        return False
    
    def _evaluate_conditions(self, conditions: Dict[str, Any], context: Context) -> bool:
        """Evaluate policy conditions against context"""
        
        for condition_key, condition_value in conditions.items():
            if not self._evaluate_condition(condition_key, condition_value, context):
                return False
        
        return True
    
    def _evaluate_condition(self, key: str, value: Any, context: Context) -> bool:
        """Evaluate a single condition"""
        
        # User scope conditions
        if key == "user_scopes":
            if "contains" in value:
                # Handle both string and list cases
                if isinstance(value["contains"], str):
                    return value["contains"] in context.auth.scopes
                else:
                    return any(scope in context.auth.scopes for scope in value["contains"])
            elif "not_in" in value:
                return not any(scope in context.auth.scopes for scope in value["not_in"])
        
        # Action conditions
        elif key == "action":
            if isinstance(value, dict):
                if "in" in value:
                    return context.action.value in value["in"]
                elif "not_in" in value:
                    return context.action.value not in value["not_in"]
                elif "equals" in value:
                    return context.action.value == value["equals"]
            else:
                return context.action.value == value
        
        # Resource conditions
        elif key == "resource":
            if isinstance(value, dict):
                if "equals" in value:
                    return context.resource.value == value["equals"]
            else:
                return context.resource.value == value
        
        # Checkpoint ID conditions
        elif key == "checkpoint_id":
            if isinstance(value, dict):
                if "is_not_null" in value and value["is_not_null"]:
                    return context.checkpoint_id is not None
                elif "equals" in value:
                    return context.checkpoint_id == value["equals"]
            else:
                return context.checkpoint_id == value
        
        # User staff checkpoint ID conditions
        elif key == "user_staff_checkpoint_id":
            if isinstance(value, dict):
                if "equals" in value and value["equals"] == "checkpoint_id":
                    return context.user.staff_checkpoint_id == context.checkpoint_id
                elif "is_not_null" in value and value["is_not_null"]:
                    return context.user.staff_checkpoint_id is not None
        
        # Time-based conditions
        elif key == "time_window":
            if "hours" in value:
                window_start = context.request_time - timedelta(hours=value["hours"])
                return context.request_time >= window_start
        
        return False
    
    def add_policy(self, policy: Policy):
        """Add a custom policy"""
        self.policies.append(policy)
    
    def remove_policy(self, policy_name: str):
        """Remove a policy by name"""
        self.policies = [p for p in self.policies if p.name != policy_name]


# Global ABAC engine instance
abac_engine = ABACEngine()


def check_permission(
    user: DetailedUser,
    auth: AuthData,
    action: Action,
    resource: Resource,
    **kwargs
) -> bool:
    """
    Check if a user has permission to perform an action on a resource
    
    Args:
        user: The authenticated user
        auth: Authentication data with scopes
        action: The action to perform
        resource: The resource type
        **kwargs: Additional context (checkpoint_id, team_id, etc.)
    
    Returns:
        True if permission is granted, False otherwise
    """
    context = Context(
        user=user,
        auth=auth,
        action=action,
        resource=resource,
        **kwargs
    )
    
    return abac_engine.evaluate(context)


def require_permission(
    user: DetailedUser,
    auth: AuthData,
    action: Action,
    resource: Resource,
    **kwargs
):
    """
    Require permission or raise HTTPException
    
    Args:
        user: The authenticated user
        auth: Authentication data with scopes
        action: The action to perform
        resource: The resource type
        **kwargs: Additional context
    
    Raises:
        HTTPException: If permission is denied
    """
    if not check_permission(user, auth, action, resource, **kwargs):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: {action.value} on {resource.value}"
        )


def get_accessible_checkpoints(user: DetailedUser, auth: AuthData) -> List[int]:
    """
    Get list of checkpoint IDs that the user can access
    
    Returns:
        List of checkpoint IDs the user can access
    """
    accessible = []
    
    # Admins can access all checkpoints
    if "admin" in auth.scopes:
        return []  # Empty list means all checkpoints
    
    # Rally managers can access all checkpoints
    if "manager-rally" in auth.scopes:
        return []  # Empty list means all checkpoints
    
    # Staff can only access their assigned checkpoint
    if "rally-staff" in auth.scopes and user.staff_checkpoint_id:
        accessible.append(user.staff_checkpoint_id)
    
    return accessible






