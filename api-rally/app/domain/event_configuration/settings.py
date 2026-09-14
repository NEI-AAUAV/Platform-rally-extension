from typing import Any

from app.domain.event_configuration.policies import initial_settings_defaults
from app.domain.event_configuration.reconciler import reconcile_policy_state
from app.models.rally_settings import RallySettings


def new_settings_for_profile(
    *, event_id: int, event_type: str, profile: str, config: dict[str, Any] | None = None
) -> RallySettings:
    values: dict[str, Any] = {}
    for column in RallySettings.__table__.columns:
        if column.name in {"id", "event_id"} or column.default is None:
            continue
        default = column.default.arg
        if callable(default):
            # SQLAlchemy wraps context-aware column generators (notably list)
            # as callables receiving an execution context.
            try:
                values[column.name] = default()
            except TypeError:
                values[column.name] = default(None)
        else:
            values[column.name] = default
    values.update(initial_settings_defaults(event_type, profile))
    settings = RallySettings(event_id=event_id, **values)
    reconcile_policy_state(event_type=event_type, profile=profile, settings=settings, config=config)
    return settings
