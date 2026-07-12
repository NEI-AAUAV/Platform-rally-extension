"""
Attribute-Based Access Control (ABAC) for Rally Extension

This module implements ABAC policies for Rally checkpoint management,
ensuring staff can only add scores to teams at their assigned checkpoint.
"""

from typing import Callable, Optional, Any, Union
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from fastapi import HTTPException, status

from app.schemas.user import DetailedUser
from app.api.auth import AuthData


class Action(Enum):
    """Actions that can be performed on Rally resources"""
    ADD_CHECKPOINT_SCORE = "add_checkpoint_score"
    VIEW_CHECKPOINT_TEAMS = "view_checkpoint_teams"
    VIEW_TEAM_MEMBERS = "view_team_members"
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


# A rule decides whether a matched (scope, action) pair grants access for the
# given context. Most rules ignore context and simply return True; the staff
# rules use it to enforce the checkpoint-scoping restriction.
Rule = Callable[[Context], bool]


def _allow(_: Context) -> bool:
    return True


def _staff_own_checkpoint(context: Context) -> bool:
    """Staff may act only on the checkpoint they are assigned to."""
    return (
        context.checkpoint_id is not None
        and context.user.staff_checkpoint_id == context.checkpoint_id
    )


def _staff_has_checkpoint(context: Context) -> bool:
    """Staff may act as long as they have some checkpoint assignment."""
    return context.user.staff_checkpoint_id is not None


# Admins have unconditional access to every action; no table needed for them.
_ADMIN_SCOPE = "admin"

# Rally managers: full access to the listed actions, resource-unscoped.
_MANAGER_SCOPE = "manager-rally"
_MANAGER_ACTIONS: dict[Action, Rule] = {
    Action.CREATE_CHECKPOINT: _allow,
    Action.UPDATE_CHECKPOINT: _allow,
    Action.CREATE_TEAM: _allow,
    Action.UPDATE_TEAM: _allow,
    Action.VIEW_CHECKPOINT_TEAMS: _allow,
    Action.CREATE_ACTIVITY: _allow,
    Action.VIEW_ACTIVITY: _allow,
    Action.UPDATE_ACTIVITY: _allow,
    Action.DELETE_ACTIVITY: _allow,
    Action.CREATE_RALLY_EVENT: _allow,
    Action.VIEW_RALLY_EVENT: _allow,
    Action.UPDATE_RALLY_EVENT: _allow,
    Action.DELETE_RALLY_EVENT: _allow,
    Action.VIEW_RALLY_CONFIG: _allow,
    Action.UPDATE_RALLY_CONFIG: _allow,
    Action.VIEW_ACTIVITY_RESULT: _allow,
    Action.CREATE_VERSUS_GROUP: _allow,
    Action.VIEW_VERSUS_GROUP: _allow,
    Action.UPDATE_RALLY_SETTINGS: _allow,
    Action.VIEW_RALLY_SETTINGS: _allow,
}

# Rally staff: checkpoint-scoped access. Actions not listed here are denied
# (this replaces the old "staff_default_deny" policy).
_STAFF_SCOPE = "rally-staff"
_STAFF_ACTIONS: dict[Action, Rule] = {
    Action.ADD_CHECKPOINT_SCORE: _staff_own_checkpoint,
    Action.VIEW_CHECKPOINT_TEAMS: _staff_own_checkpoint,
    Action.VIEW_TEAM_MEMBERS: lambda ctx: ctx.checkpoint_id is not None,
    Action.CREATE_ACTIVITY_RESULT: _staff_own_checkpoint,
    Action.VIEW_ACTIVITY_RESULT: _staff_has_checkpoint,
    Action.UPDATE_ACTIVITY_RESULT: _staff_own_checkpoint,
    Action.VIEW_ACTIVITY: _allow,
    Action.VIEW_VERSUS_GROUP: _allow,
    # B4 walk-up registration: staff may pass the ABAC gate for CREATE_TEAM
    # (adding a team member) unconditionally here — the actual
    # allow_staff_registration on/off decision is made by add_team_member
    # itself after this check, per-event, since ABAC context has no DB access.
    Action.CREATE_TEAM: _allow,
}


class ABACEngine:
    """ABAC policy evaluation engine.

    Access is decided by a small per-role table of Action -> Rule instead of
    a generic priority-sorted policy list: Rally has exactly four roles
    (admin, rally manager, rally staff, unauthenticated/other), each with a
    fixed, enumerable set of allowed actions, so a table is both smaller and
    exhaustively checkable (mypy flags an unhandled Action immediately)
    compared to matching against free-form condition dicts.
    """

    def evaluate(self, context: Context) -> bool:
        """
        Evaluate ABAC rules against the given context

        Returns:
            True if access is allowed, False if denied
        """
        scopes = context.auth.scopes

        if _ADMIN_SCOPE in scopes:
            return True

        if _MANAGER_SCOPE in scopes:
            rule = _MANAGER_ACTIONS.get(context.action)
            if rule is not None:
                return rule(context)

        if _STAFF_SCOPE in scopes:
            rule = _STAFF_ACTIONS.get(context.action)
            if rule is not None:
                return rule(context)
            return False

        return False


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


class _AllCheckpoints:
    """Sentinel meaning "every checkpoint" (admins/managers).

    A distinct type instead of an empty list so that "all checkpoints" is
    never confused with "no accessible checkpoints" — a staff member with no
    assignment returns an empty list, which must NOT be treated as all-access.
    """

    __slots__ = ()

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return "ALL_CHECKPOINTS"


ALL_CHECKPOINTS = _AllCheckpoints()

AccessibleCheckpoints = Union[_AllCheckpoints, list[int]]


def get_accessible_checkpoints(
    user: DetailedUser, auth: AuthData
) -> AccessibleCheckpoints:
    """
    Get the checkpoints a user can access.

    Returns:
        ALL_CHECKPOINTS for admins/managers, or an explicit list of checkpoint
        IDs for staff (empty when the staff member has no assignment).
    """
    # Admins and rally managers can access every checkpoint.
    if "admin" in auth.scopes or "manager-rally" in auth.scopes:
        return ALL_CHECKPOINTS

    # Staff can only access their assigned checkpoint.
    if "rally-staff" in auth.scopes and user.staff_checkpoint_id:
        return [user.staff_checkpoint_id]

    return []
