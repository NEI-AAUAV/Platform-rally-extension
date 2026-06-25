"""Exceptions for the event subsystem."""


class EventPublishError(Exception):
    """Raised when an event cannot be published to Redis."""
