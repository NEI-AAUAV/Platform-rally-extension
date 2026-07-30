"""DB-backed tests for CRUDBadgeDefinition.update()/delete() field coverage
(against real Postgres). `storage_client.delete_image` is patched — real
object storage deletion is out of scope; everything else is real.
"""

from unittest.mock import patch

from app.crud.crud_badge_definition import badge_definition as crud_def
from app.schemas.badge_definition import BadgeDefinitionCreate, BadgeDefinitionUpdate


async def _make_badge(pg_session, **overrides):
    payload = {"code": "test_badge", "name": "Test Badge"}
    payload.update(overrides)
    return await crud_def.create(pg_session, obj_in=BadgeDefinitionCreate(**payload))


async def test_update_description(pg_session) -> None:
    badge = await _make_badge(pg_session)

    updated = await crud_def.update(
        pg_session, db_obj=badge, obj_in=BadgeDefinitionUpdate(description="New description")
    )

    assert updated.description == "New description"


async def test_update_is_active(pg_session) -> None:
    badge = await _make_badge(pg_session)

    updated = await crud_def.update(
        pg_session, db_obj=badge, obj_in=BadgeDefinitionUpdate(is_active=False)
    )

    assert updated.is_active is False


async def test_update_is_auto(pg_session) -> None:
    badge = await _make_badge(pg_session)

    updated = await crud_def.update(
        pg_session, db_obj=badge, obj_in=BadgeDefinitionUpdate(is_auto=True)
    )

    assert updated.is_auto is True


async def test_update_color(pg_session) -> None:
    badge = await _make_badge(pg_session)

    updated = await crud_def.update(
        pg_session, db_obj=badge, obj_in=BadgeDefinitionUpdate(color="#123456")
    )

    assert updated.color == "#123456"


async def test_update_glyph(pg_session) -> None:
    badge = await _make_badge(pg_session)

    updated = await crud_def.update(
        pg_session, db_obj=badge, obj_in=BadgeDefinitionUpdate(glyph="star")
    )

    assert updated.glyph == "star"


async def test_update_trigger_type(pg_session) -> None:
    badge = await _make_badge(pg_session)

    updated = await crud_def.update(
        pg_session, db_obj=badge, obj_in=BadgeDefinitionUpdate(trigger_type="win_activity")
    )

    assert updated.trigger_type == "win_activity"


async def test_update_criteria(pg_session) -> None:
    badge = await _make_badge(pg_session)

    updated = await crud_def.update(
        pg_session, db_obj=badge, obj_in=BadgeDefinitionUpdate(criteria={"count": 5})
    )

    assert updated.criteria == {"count": 5}


async def test_update_icon_url_deletes_previous_icon(pg_session) -> None:
    badge = await _make_badge(pg_session)
    badge.icon_url = "https://cdn.example.com/old-icon.png"
    pg_session.add(badge)
    await pg_session.commit()

    with patch("app.crud.crud_badge_definition.storage_client.delete_image") as mock_delete:
        updated = await crud_def.update(
            pg_session,
            db_obj=badge,
            obj_in=BadgeDefinitionUpdate(),
            icon_url="https://cdn.example.com/new-icon.png",
        )

    mock_delete.assert_called_once_with("https://cdn.example.com/old-icon.png")
    assert updated.icon_url == "https://cdn.example.com/new-icon.png"


async def test_delete_removes_icon_from_storage(pg_session) -> None:
    badge = await _make_badge(pg_session)
    badge.icon_url = "https://cdn.example.com/icon.png"
    pg_session.add(badge)
    await pg_session.commit()

    with patch("app.crud.crud_badge_definition.storage_client.delete_image") as mock_delete:
        await crud_def.delete(pg_session, db_obj=badge)

    mock_delete.assert_called_once_with("https://cdn.example.com/icon.png")
    assert await crud_def.get(pg_session, id=badge.id) is None


async def test_delete_without_icon_skips_storage_call(pg_session) -> None:
    badge = await _make_badge(pg_session)

    with patch("app.crud.crud_badge_definition.storage_client.delete_image") as mock_delete:
        await crud_def.delete(pg_session, db_obj=badge)

    mock_delete.assert_not_called()
