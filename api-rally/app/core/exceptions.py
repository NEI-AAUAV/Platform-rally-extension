"""Domain exceptions for the Rally API.

Raise these from services and CRUD instead of returning ambiguous
success/error tuples or swallowing failures. A FastAPI exception handler
(registered in app/main.py) maps them to HTTP responses, so business code
never has to assemble HTTP errors itself.
"""

from typing import Any


class RallyError(Exception):
    """Base class for expected Rally domain errors.

    status_code is the HTTP status the API handler returns for this error.
    Subclasses with status_code >= 500 are logged with a traceback.

    ``details`` carries a machine-readable companion to ``message``, echoed
    into the response body under the same key. It exists so a client can act
    on *what* went wrong without parsing the prose: the app was running a
    regular expression over the "too far from checkpoint" sentence to recover
    the distance band, which made a message reworded for readability a silent
    client-side breakage.
    """

    status_code: int = 500

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class RallyValidationError(RallyError):
    """A request is well-formed but violates a business rule (HTTP 400)."""

    status_code = 400


class RallyForbiddenError(RallyError):
    """The action is understood but not permitted (HTTP 403)."""

    status_code = 403


class RallyNotFoundError(RallyError):
    """A referenced resource does not exist (HTTP 404)."""

    status_code = 404


class RallyUnauthorizedError(RallyError):
    """The caller is not authenticated (HTTP 401)."""

    status_code = 401


class RallyConflictError(RallyError):
    """The request conflicts with the current state of the resource (HTTP 409)."""

    status_code = 409
