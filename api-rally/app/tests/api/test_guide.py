"""Tests for the guide checkpoints endpoint, against real Postgres."""

from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_checkpoint_guide_indication import (
    checkpoint_guide_indication as crud_indication,
)
from app.crud.crud_checkpoint_media import checkpoint_media as crud_media
from app.crud.crud_rally_settings import rally_settings
from app.models.activity import EventType
from app.models.checkpoint_media import MediaKind
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.checkpoint_guide_indication import CheckpointGuideIndicationCreate
from app.schemas.checkpoint_media import CheckpointMediaCreate
from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate
from app.tests.conftest import make_event as _make_event


def _settings_update(current, **overrides) -> RallySettingsUpdate:
    data = RallySettingsResponse.model_validate(current).model_dump(exclude={"id"})
    data.update(overrides)
    return RallySettingsUpdate(**data)


async def _set_guide_mode(pg_session, *, enabled: bool, active: bool):
    settings = await rally_settings.get_or_create(pg_session)
    return await rally_settings.update(
        pg_session,
        id=settings.id,
        obj_in=_settings_update(settings, guide_mode_enabled=enabled, guide_mode_active=active),
        commit=True,
    )


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Posto {order}", order=order), commit=True
    )


async def test_guide_checkpoints_403_when_mode_off_and_not_peddy_paper(
    pg_session, pg_client, as_admin
):
    await _make_event(pg_session, event_type=EventType.GENERIC.value)
    await _set_guide_mode(pg_session, enabled=False, active=False)

    resp = pg_client.get("/api/rally/v1/guide/checkpoints")

    assert resp.status_code == 403


async def test_guide_checkpoints_maps_media_and_indications(pg_session, pg_client, as_admin):
    await _make_event(pg_session, event_type=EventType.GENERIC.value)
    await _set_guide_mode(pg_session, enabled=True, active=True)
    checkpoint = await _make_checkpoint(pg_session)
    photo_row = await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.photo, order=0),
    )
    photo_row.image_url = "https://r2/p.png"
    pg_session.add(photo_row)
    await crud_media.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointMediaCreate(kind=MediaKind.fun_fact, caption="Fun", order=1),
    )
    await crud_indication.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointGuideIndicationCreate(
            hint="Give this hint", question="Q?", expected_answer="A", order=0
        ),
    )
    await pg_session.commit()

    resp = pg_client.get("/api/rally/v1/guide/checkpoints")

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data) == 1
    cp_data = data[0]
    photo_item = next(m for m in cp_data["media"] if m["kind"] == "photo")
    assert photo_item["url"] == "https://r2/p.png"
    assert photo_item["display_order"] == 0
    fun = next(m for m in cp_data["media"] if m["kind"] == "fun_fact")
    assert fun["url"] is None
    assert cp_data["indications"][0]["hint"] == "Give this hint"
    assert cp_data["indications"][0]["question"] == "Q?"


async def test_guide_checkpoints_allowed_for_peddy_paper_even_if_mode_off(
    pg_session, pg_client, as_admin
):
    await _make_event(pg_session, event_type=EventType.PEDDY_PAPER.value)
    await _set_guide_mode(pg_session, enabled=False, active=False)

    resp = pg_client.get("/api/rally/v1/guide/checkpoints")

    assert resp.status_code == 200
    assert resp.json() == []
