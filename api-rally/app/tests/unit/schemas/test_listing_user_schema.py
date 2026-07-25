"""Direct unit test for ListingUser._derive_is_linked's ORM-object branch
(model_validate from a non-dict source), which API-level tests exercise only
indirectly through the team-members endpoint."""

from types import SimpleNamespace

from app.schemas.user import ListingUser


def test_derive_is_linked_true_when_authentik_sub_present():
    orm_like = SimpleNamespace(
        id=1, name="Ana", team_id=5, is_captain=True, authentik_sub="sub-123"
    )
    result = ListingUser.model_validate(orm_like)
    assert result.is_linked is True


def test_derive_is_linked_false_when_authentik_sub_absent():
    orm_like = SimpleNamespace(id=2, name="Bea", team_id=5, is_captain=False)
    result = ListingUser.model_validate(orm_like)
    assert result.is_linked is False


def test_derive_is_linked_passthrough_for_dict_input():
    result = ListingUser.model_validate(
        {"id": 3, "name": "Cid", "team_id": None, "is_captain": False, "is_linked": True}
    )
    assert result.is_linked is True
