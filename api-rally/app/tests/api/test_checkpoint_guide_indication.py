"""Tests for checkpoint guide indication endpoints, against real Postgres."""
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_checkpoint_guide_indication import (
    checkpoint_guide_indication as crud_indication,
)
from app.models.activity import RallyEvent
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.checkpoint_guide_indication import CheckpointGuideIndicationCreate


async def _make_event(pg_session):
    event = RallyEvent(name="Test Event", is_current=True)
    pg_session.add(event)
    await pg_session.commit()
    await pg_session.refresh(event)
    return event


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order)
    )


async def test_list_indications(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    await crud_indication.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointGuideIndicationCreate(hint="Give this hint", order=0),
    )
    await crud_indication.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointGuideIndicationCreate(
            hint="Ask this", question="Capital?", expected_answer="Lisbon", order=1
        ),
    )

    resp = pg_client.get(f"/api/rally/v1/checkpoint/{checkpoint.id}/guide-indications")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[1]["question"] == "Capital?"
    assert data[1]["expected_answer"] == "Lisbon"


async def test_list_indications_requires_authentication(pg_session, pg_client):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)

    resp = pg_client.get(f"/api/rally/v1/checkpoint/{checkpoint.id}/guide-indications")

    assert resp.status_code in (401, 403)


async def test_list_indications_403_for_participant(pg_session, pg_client, as_user):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)

    resp = pg_client.get(f"/api/rally/v1/checkpoint/{checkpoint.id}/guide-indications")

    assert resp.status_code == 403


async def test_list_indications_404_if_checkpoint_missing(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.get("/api/rally/v1/checkpoint/999999/guide-indications")

    assert resp.status_code == 404


async def test_create_indication(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)

    resp = pg_client.post(
        f"/api/rally/v1/checkpoint/{checkpoint.id}/guide-indications",
        json={
            "hint": "Tell them about the statue",
            "question": "Who?",
            "expected_answer": "Camoes",
            "order": 0,
        },
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["hint"] == "Tell them about the statue"


async def test_create_indication_requires_hint(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)

    resp = pg_client.post(
        f"/api/rally/v1/checkpoint/{checkpoint.id}/guide-indications",
        json={"question": "x"},
    )

    assert resp.status_code == 422


async def test_delete_indication_admin(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    indication = await crud_indication.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointGuideIndicationCreate(hint="Hint", order=0),
    )

    resp = pg_client.delete(f"/api/rally/v1/checkpoint/guide-indications/{indication.id}")

    assert resp.status_code == 204
    assert await crud_indication.get(pg_session, id=indication.id) is None


async def test_delete_indication_403_without_permission(pg_session, pg_client, as_user):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    indication = await crud_indication.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointGuideIndicationCreate(hint="Hint", order=0),
    )

    resp = pg_client.delete(f"/api/rally/v1/checkpoint/guide-indications/{indication.id}")

    assert resp.status_code == 403


async def test_update_indication_admin(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    indication = await crud_indication.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointGuideIndicationCreate(hint="Old hint", order=0),
    )

    resp = pg_client.put(
        f"/api/rally/v1/checkpoint/guide-indications/{indication.id}",
        json={"hint": "New hint"},
    )

    assert resp.status_code == 200
    assert resp.json()["hint"] == "New hint"


async def test_update_indication_all_fields(pg_session, pg_client, as_admin):
    """Covers the question/expected_answer/order partial-update branches
    that `test_update_indication_admin` (hint-only) doesn't reach."""
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    indication = await crud_indication.create(
        pg_session,
        checkpoint_id=checkpoint.id,
        obj_in=CheckpointGuideIndicationCreate(hint="Old", order=0),
    )

    resp = pg_client.put(
        f"/api/rally/v1/checkpoint/guide-indications/{indication.id}",
        json={"question": "New question?", "expected_answer": "New answer", "order": 5},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["question"] == "New question?"
    assert body["expected_answer"] == "New answer"
    assert body["order"] == 5


async def test_update_indication_404_when_missing(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.put(
        "/api/rally/v1/checkpoint/guide-indications/999999",
        json={"hint": "New hint"},
    )

    assert resp.status_code == 404


async def test_delete_indication_404_when_missing(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.delete("/api/rally/v1/checkpoint/guide-indications/999999")

    assert resp.status_code == 404
