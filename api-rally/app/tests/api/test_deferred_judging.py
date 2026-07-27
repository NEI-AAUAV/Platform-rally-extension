"""Tests for deferred-judged activity endpoints (B3), against real Postgres.

`validate_and_store` (R2 image upload) stays mocked — external I/O, out of
scope; everything else (DB, ABAC, routing, scoring) runs for real.
"""

from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.schemas.activity import ActivityCreate, ActivityType
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate
from app.tests.conftest import make_event as _make_event


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order)
    )


async def _make_team(pg_session, name="TeamA"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name))


async def _make_activity(pg_session, checkpoint_id, activity_type=ActivityType.DEFERRED_JUDGED):
    return await crud_activity.create(
        pg_session,
        obj_in=ActivityCreate(
            name="Deferred Activity",
            activity_type=activity_type,
            checkpoint_id=checkpoint_id,
            config={},
            is_active=True,
        ),
    )


# ---------- capture ----------


async def test_capture_deferred_result_no_images(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(pg_session, checkpoint.id)
    team = await _make_team(pg_session)

    resp = pg_client.post(f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}")

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["judgment_status"] == "pending_judgment"
    assert body["media_urls"] == []


async def test_capture_wrong_activity_type(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(pg_session, checkpoint.id, activity_type=ActivityType.BOOLEAN)
    team = await _make_team(pg_session)

    resp = pg_client.post(f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}")

    assert resp.status_code == 400


async def test_capture_activity_not_found(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.post("/api/rally/v1/activities/deferred/999999/capture?team_id=2")

    assert resp.status_code == 404


async def test_capture_missing_team_id(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(pg_session, checkpoint.id)

    resp = pg_client.post(f"/api/rally/v1/activities/deferred/{act.id}/capture")

    assert resp.status_code == 400


async def test_capture_with_images_uploads_and_stores_urls(
    pg_session, pg_client, as_admin, monkeypatch
):
    import io
    from unittest.mock import AsyncMock

    monkeypatch.setattr(
        "app.api.api_v1.deferred_judging.validate_and_store",
        AsyncMock(return_value="https://r2/photo.png"),
    )

    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(pg_session, checkpoint.id)
    team = await _make_team(pg_session)

    resp = pg_client.post(
        f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}",
        files={"images": ("photo.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 8), "image/png")},
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["media_urls"] == ["https://r2/photo.png"]


async def test_capture_existing_result_appends(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(pg_session, checkpoint.id)
    team = await _make_team(pg_session)
    first = pg_client.post(f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}")
    assert first.status_code == 201

    resp = pg_client.post(f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}")

    assert resp.status_code == 201
    assert resp.json()["id"] == first.json()["id"]  # upserted, not duplicated


# ---------- judge ----------


async def test_judge_result(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(pg_session, checkpoint.id)
    team = await _make_team(pg_session)
    captured = pg_client.post(
        f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}"
    ).json()

    resp = pg_client.put(
        f"/api/rally/v1/activities/results/{captured['id']}/judge",
        json={"points": 75, "notes": "great outfit"},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["final_score"] == 75
    assert body["judgment_status"] == "judged"
    assert body["is_completed"] is True


async def test_judge_result_succeeds_even_if_score_recalc_fails(
    pg_session, pg_client, as_admin, monkeypatch
):
    """Score recalculation failure after judging must not fail the request —
    the judgment itself already committed successfully."""
    from unittest.mock import AsyncMock

    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(pg_session, checkpoint.id)
    team = await _make_team(pg_session)
    captured = pg_client.post(
        f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}"
    ).json()

    monkeypatch.setattr(
        "app.services.deferred_judging_service.ScoringService.update_team_scores",
        AsyncMock(side_effect=RuntimeError("boom")),
    )

    resp = pg_client.put(
        f"/api/rally/v1/activities/results/{captured['id']}/judge",
        json={"points": 60},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["judgment_status"] == "judged"


async def test_judge_result_not_found(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.put("/api/rally/v1/activities/results/999999/judge", json={"points": 50})

    assert resp.status_code == 404


async def test_judge_already_judged(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(pg_session, checkpoint.id)
    team = await _make_team(pg_session)
    captured = pg_client.post(
        f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}"
    ).json()
    first_judge = pg_client.put(
        f"/api/rally/v1/activities/results/{captured['id']}/judge", json={"points": 80}
    )
    assert first_judge.status_code == 200

    resp = pg_client.put(
        f"/api/rally/v1/activities/results/{captured['id']}/judge", json={"points": 50}
    )

    assert resp.status_code == 400


# ---------- list pending ----------


async def test_list_pending_judgments(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(pg_session, checkpoint.id)
    team_a = await _make_team(pg_session, name="TeamA")
    team_b = await _make_team(pg_session, name="TeamB")
    pg_client.post(f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team_a.id}")
    pg_client.post(f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team_b.id}")

    resp = pg_client.get("/api/rally/v1/activities/deferred/pending")

    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_list_pending_empty(pg_session, pg_client, as_admin):
    await _make_event(pg_session)

    resp = pg_client.get("/api/rally/v1/activities/deferred/pending")

    assert resp.status_code == 200
    assert resp.json() == []


# ---------- set-team-photo ----------


async def _enable_photo_as_team_photo(pg_session):
    from app.crud.crud_rally_settings import rally_settings
    from app.schemas.rally_settings import RallySettingsResponse, RallySettingsUpdate

    settings = await rally_settings.get_or_create(pg_session)
    data = RallySettingsResponse.model_validate(settings).model_dump(exclude={"id"})
    data["allow_photo_as_team_photo"] = True
    return await rally_settings.update(
        pg_session, id=settings.id, obj_in=RallySettingsUpdate(**data), commit=True
    )


class TestSetTeamPhotoFromResult:
    async def test_set_team_photo_disabled_by_default_403(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        captured = pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}"
        ).json()

        resp = pg_client.put(
            f"/api/rally/v1/activities/results/{captured['id']}/set-team-photo",
            json={"image_url": "https://r2/x.png"},
        )

        assert resp.status_code == 403

    async def test_set_team_photo_result_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _enable_photo_as_team_photo(pg_session)

        resp = pg_client.put(
            "/api/rally/v1/activities/results/999999/set-team-photo",
            json={"image_url": "https://r2/x.png"},
        )

        assert resp.status_code == 404

    async def test_set_team_photo_url_not_in_media_urls(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        await _enable_photo_as_team_photo(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        captured = pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}"
        ).json()

        resp = pg_client.put(
            f"/api/rally/v1/activities/results/{captured['id']}/set-team-photo",
            json={"image_url": "https://r2/not-mine.png"},
        )

        assert resp.status_code == 400

    async def test_set_team_photo_success(self, pg_session, pg_client, as_admin, monkeypatch):
        import io
        from unittest.mock import AsyncMock

        monkeypatch.setattr(
            "app.api.api_v1.deferred_judging.validate_and_store",
            AsyncMock(return_value="https://r2/photo.png"),
        )

        await _make_event(pg_session)
        await _enable_photo_as_team_photo(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        captured = pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}",
            files={
                "images": (
                    "photo.png",
                    io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 8),
                    "image/png",
                )
            },
        ).json()

        resp = pg_client.put(
            f"/api/rally/v1/activities/results/{captured['id']}/set-team-photo",
            json={"image_url": "https://r2/photo.png"},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["team_id"] == team.id
        assert body["photo_url"] == "https://r2/photo.png"
