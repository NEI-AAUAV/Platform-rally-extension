"""Who may take over an existing user row that shares their email.

A matching email alone never proves ownership: Authentik does not enforce
unique emails, so a second account can carry the same verified address. When a
row is bound to a specific Authentik account (by an admin link or a legacy
link that stored the uuid as the subject), the caller must be that account,
confirmed against the Authentik management API.
"""

import logging

from app.api import authentik_client
from app.api.authentik_client import AuthentikUnavailableError
from app.models.user import User

logger = logging.getLogger(__name__)


def _bound_account_uuid(row: User) -> str | None:
    """The Authentik uuid ``row`` is reserved for, if any.

    - ``authentik_uuid`` set, never logged in: reserved by an admin link.
    - ``authentik_sub`` set and equal to ``authentik_uuid`` (or with no uuid
      recorded): a legacy admin link that stored the uuid as the subject.
    """
    if row.authentik_sub is None:
        return row.authentik_uuid
    if row.authentik_uuid in (None, row.authentik_sub):
        return row.authentik_sub
    return None


async def may_claim_by_email(row: User, oidc_sub: str) -> bool:
    """True when the caller ``oidc_sub`` may claim ``row``, matched by email.

    Fails closed: an unreachable Authentik means the claim is refused.
    """
    if row.authentik_sub == oidc_sub:
        return True
    if row.authentik_sub is None and row.authentik_uuid is None:
        # A plain mirror (e.g. eagerly created from an Authentik group): the
        # caller's email-verification rule is the only gate, applied upstream.
        return True
    if row.authentik_sub is not None and row.authentik_uuid not in (None, row.authentik_sub):
        # A real login by another subject already owns this row.
        return False
    account_uuid = _bound_account_uuid(row)
    if account_uuid is None:
        return False
    try:
        return await authentik_client.account_has_subject(account_uuid, oidc_sub)
    except AuthentikUnavailableError:
        logger.warning(
            "Refusing to hand user row %s to sub=%s: Authentik could not confirm "
            "the account it is linked to.",
            row.id,
            oidc_sub,
        )
        return False
