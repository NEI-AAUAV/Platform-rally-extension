"""Email normalization shared by the OIDC login path and the Authentik mirror.

The Authentik management API and the JWT ``email`` claim are two different
sources for the same address and do not agree on case or padding. Both the
placeholder lookup (``crud_user.get_by_email``) and the mirror insert
(``crud_user.get_or_create_mirror``) compare on this value, so a mismatch
there silently creates a second user row for one person.
"""


def normalize_email(value: str | None) -> str | None:
    """Lowercase and strip an address; empty/blank becomes ``None``."""
    if value is None:
        return None
    return value.strip().lower() or None
