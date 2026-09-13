"""Settings construction with the same defaults for preflight and persistence."""
from app.models.rally_settings import RallySettings
from .policies import initial_settings_defaults
from .reconciler import reconcile_policy_state


def new_settings_for_profile(*, event_id: int, event_type: str, profile: str, config: dict | None = None) -> RallySettings:
    values = {}
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
