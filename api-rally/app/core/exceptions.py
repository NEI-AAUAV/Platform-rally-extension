"""Domain exceptions for the Rally API.

Raise these from services and CRUD instead of returning ambiguous
success/error tuples or swallowing failures. A FastAPI exception handler
(registered in app/main.py) maps them to HTTP responses, so business code
never has to assemble HTTP errors itself.
"""


class RallyError(Exception):
    """Base class for expected Rally domain errors.

    status_code is the HTTP status the API handler returns for this error.
    Subclasses with status_code >= 500 are logged with a traceback.
    """

    status_code: int = 500

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class RallyValidationError(RallyError):
    """A request is well-formed but violates a business rule (HTTP 400)."""

    status_code = 400
