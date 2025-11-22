"""
Attribute-Based Access Control (ABAC) for Rally Extension

This module implements ABAC policies for Rally checkpoint management,
ensuring staff can only add scores to teams at their assigned checkpoint.
"""

from typing import Optional, Any
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from fastapi import HTTPException, status

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
    VIEW_RALLY_SETTINGS = "view_rally_settings"
    UPDATE_RALLY_SETTINGS = "update_rally_settings"
    CREATE_VERSUS_GROUP = "create_versus_group"
    VIEW_VERSUS_GROUP = "view_versus_group"
    
    # Activity actions
    CREATE_ACTIVITY = "create_activity"
    VIEW_ACTIVITY = "view_activity"
    UPDATE_ACTIVITY = "update_activity"
    DELETE_ACTIVITY = "delete_activity"
    CREATE_ACTIVITY_RESULT = "create_activity_result"
    VIEW_ACTIVITY_RESULT = "view_activity_result"
    UPDATE_ACTIVITY_RESULT = "update_activity_result"
    
    # Rally event actions
    CREATE_RALLY_EVENT = "create_rally_event"
    VIEW_RALLY_EVENT = "view_rally_event"
    UPDATE_RALLY_EVENT = "update_rally_event"
    DELETE_RALLY_EVENT = "delete_rally_event"
    
    # Rally configuration actions
    VIEW_RALLY_CONFIG = "view_rally_config"
    UPDATE_RALLY_CONFIG = "update_rally_config"


class Resource(Enum):
    """Resources in the Rally system"""
    CHECKPOINT = "checkpoint"
    TEAM = "team"
    SCORE = "score"
    RALLY_SETTINGS = "rally_settings"
    VERSUS_GROUP = "versus_group"
    ACTIVITY = "activity"
    ACTIVITY_RESULT = "activity_result"
    RALLY_EVENT = "rally_event"
    RALLY_CONFIG = "rally_config"


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
    
    def __post_init__(self) -> None:
        if self.request_time is None:
            self.request_time = datetime.now(timezone.utc)


@dataclass
class Policy:
    """ABAC policy definition"""
    name: str
    description: str
    effect: str  # "allow" or "deny"
    conditions: dict[str, Any]
    priority: int = 0


class ABACEngine:
    """ABAC policy evaluation engine"""
    
    def __init__(self) -> None:
        self.policies: list[Policy] = []
        self._load_default_policies()
    
    def _load_default_policies(self) -> None:
        """Load default Rally ABAC policies"""
        self._load_admin_policies()
        self._load_manager_policies()
        self._load_staff_policies()
        self._load_default_deny_policy()
    
    def _load_admin_policies(self) -> None:
        """Load admin access policies"""
        self.policies.append(Policy(
            name="admin_full_access",
            description="Admins have full access to all Rally resources",
            effect="allow",
            conditions={
                "user_scopes": {"contains": "admin"}
            },
            priority=100
        ))
    
    def _load_manager_policies(self) -> None:
        """Load rally manager access policies"""
        # Rally managers can manage checkpoints and teams
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
                    Action.VIEW_CHECKPOINT_TEAMS.value,
                    Action.CREATE_ACTIVITY.value,
                    Action.VIEW_ACTIVITY.value,
                    Action.UPDATE_ACTIVITY.value,
                    Action.DELETE_ACTIVITY.value,
                    Action.CREATE_RALLY_EVENT.value,
                    Action.VIEW_RALLY_EVENT.value,
                    Action.UPDATE_RALLY_EVENT.value,
                    Action.DELETE_RALLY_EVENT.value,
                    Action.VIEW_RALLY_CONFIG.value,
                    Action.UPDATE_RALLY_CONFIG.value
                ]}
            },
            priority=90
        ))

        # Rally managers can manage versus groups
        self.policies.append(Policy(
            name="rally_manager_versus_access",
            description="Rally managers can manage versus team pairings",
            effect="allow",
            conditions={
                "user_scopes": {"contains": "manager-rally"},
                "action": {"in": [
                    Action.CREATE_VERSUS_GROUP.value,
                    Action.VIEW_VERSUS_GROUP.value
                ]},
                "resource": {"equals": Resource.VERSUS_GROUP.value}
            },
            priority=90
        ))
        
        # Rally managers can manage rally settings
        self.policies.append(Policy(
            name="rally_manager_settings_access",
            description="Rally managers can manage rally settings",
            effect="allow",
            conditions={
                "user_scopes": {"contains": "manager-rally"},
                "action": {"in": [
                    Action.UPDATE_RALLY_SETTINGS.value,
                    Action.VIEW_RALLY_SETTINGS.value
                ]},
                "resource": {"equals": Resource.RALLY_SETTINGS.value}
            },
            priority=90
        ))
    
    def _load_staff_policies(self) -> None:
        """Load staff access policies"""
        # Staff can only add scores at their assigned checkpoint
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
        
        # Staff can view teams at their checkpoint
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
        
        # Staff can create and view activity results at their assigned checkpoint
        self.policies.append(Policy(
            name="staff_activity_results_access",
            description="Staff can manage activity results at their assigned checkpoint",
            effect="allow",
            conditions={
                "user_scopes": {"contains": "rally-staff"},
                "action": {"in": [
                    Action.CREATE_ACTIVITY_RESULT.value,
                    Action.VIEW_ACTIVITY_RESULT.value,
                    Action.UPDATE_ACTIVITY_RESULT.value
                ]},
                "user_staff_checkpoint_id": {"equals": "checkpoint_id"},
                "checkpoint_id": {"is_not_null": True}
            },
            priority=80
        ))
        
        # Staff can view activities at their checkpoint
        self.policies.append(Policy(
            name="staff_view_activities",
            description="Staff can view activities at their assigned checkpoint",
            effect="allow",
            conditions={
                "user_scopes": {"contains": "rally-staff"},
                "action": Action.VIEW_ACTIVITY.value,
                "user_staff_checkpoint_id": {"equals": "checkpoint_id"},
                "checkpoint_id": {"is_not_null": True}
            },
            priority=80
        ))
        
        # Deny all other staff actions
        self.policies.append(Policy(
            name="staff_default_deny",
            description="Deny all other staff actions",
            effect="deny",
            conditions={
                "user_scopes": {"contains": "rally-staff"},
                "action": {"not_in": [
                    Action.ADD_CHECKPOINT_SCORE.value,
                    Action.VIEW_CHECKPOINT_TEAMS.value,
                    Action.CREATE_ACTIVITY_RESULT.value,
                    Action.VIEW_ACTIVITY_RESULT.value,
                    Action.UPDATE_ACTIVITY_RESULT.value,
                    Action.VIEW_ACTIVITY.value
                ]}
            },
            priority=70
        ))
    
    def _load_default_deny_policy(self) -> None:
        """Load default deny policy for unauthenticated users"""
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
    
    def _evaluate_conditions(self, conditions: dict[str, Any], context: Context) -> bool:
        """Evaluate policy conditions against context"""
        
        for condition_key, condition_value in conditions.items():
            if not self._evaluate_condition(condition_key, condition_value, context):
                return False
        
        return True
    
    def _evaluate_condition(self, key: str, value: Any, context: Context) -> bool:
        """Evaluate a single condition"""
        
        # Delegate to specific condition evaluators
        evaluators = {
            "user_scopes": self._evaluate_user_scopes,
            "action": self._evaluate_action,
            "resource": self._evaluate_resource,
            "checkpoint_id": self._evaluate_checkpoint_id,
            "user_staff_checkpoint_id": self._evaluate_user_staff_checkpoint_id,
            "time_window": self._evaluate_time_window,
        }
        
        evaluator = evaluators.get(key)
        if evaluator:
            return evaluator(value, context)
        
        return False
    
    def _evaluate_user_scopes(self, value: Any, context: Context) -> bool:
        """Evaluate user scope conditions"""
        if "contains" in value:
            scope_to_check = value["contains"]
            if isinstance(scope_to_check, str):
                return scope_to_check in context.auth.scopes
            else:
                return any(scope in context.auth.scopes for scope in scope_to_check)
        elif "not_in" in value:
            return not any(scope in context.auth.scopes for scope in value["not_in"])
        return False
    
    def _evaluate_action(self, value: Any, context: Context) -> bool:
        """Evaluate action conditions"""
        if isinstance(value, dict):
            if "in" in value:
                return bool(context.action.value in value["in"])
            elif "not_in" in value:
                return bool(context.action.value not in value["not_in"])
            elif "equals" in value:
                return bool(context.action.value == value["equals"])
        else:
            return bool(context.action.value == value)
        return False
    
    def _evaluate_resource(self, value: Any, context: Context) -> bool:
        """Evaluate resource conditions"""
        if isinstance(value, dict):
            if "equals" in value:
                return bool(context.resource.value == value["equals"])
        else:
            return bool(context.resource.value == value)
        return False
    
    def _evaluate_checkpoint_id(self, value: Any, context: Context) -> bool:
        """Evaluate checkpoint ID conditions"""
        if isinstance(value, dict):
            if "is_not_null" in value and value["is_not_null"]:
                return context.checkpoint_id is not None
            elif "equals" in value:
                return bool(context.checkpoint_id == value["equals"])
        else:
            return bool(context.checkpoint_id == value)
        return False
    
    def _evaluate_user_staff_checkpoint_id(self, value: Any, context: Context) -> bool:
        """Evaluate user staff checkpoint ID conditions"""
        if isinstance(value, dict):
            if "equals" in value and value["equals"] == "checkpoint_id":
                return context.user.staff_checkpoint_id == context.checkpoint_id
            elif "is_not_null" in value and value["is_not_null"]:
                return context.user.staff_checkpoint_id is not None
        return False
    
    def _evaluate_time_window(self, value: Any, context: Context) -> bool:
        """Evaluate time-based conditions"""
        if "hours" in value and context.request_time is not None:
            window_start = context.request_time - timedelta(hours=value["hours"])
            return context.request_time >= window_start
        return False
    
    def add_policy(self, policy: Policy) -> None:
        """Add a custom policy"""
        self.policies.append(policy)
    
    def remove_policy(self, policy_name: str) -> None:
        """Remove a policy by name"""
        self.policies = [p for p in self.policies if p.name != policy_name]


# Global ABAC engine instance
abac_engine = ABACEngine()


def check_permission(
    user: DetailedUser,
    auth: AuthData,
    action: Action,
    resource: Resource,
    **kwargs: Any
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
    **kwargs: Any
) -> None:
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


def get_accessible_checkpoints(user: DetailedUser, auth: AuthData) -> list[int]:
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


