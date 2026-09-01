"""Tests for deferred-judged activity endpoints (B3), against real Postgres.

`validate_and_store` (R2 image upload) stays mocked — external I/O, out of
scope; everything else (DB, ABAC, routing, scoring) runs for real.
"""

from app.crud.crud_activity import activity as crud_activity
from app.crud.crud_activity import activity_result as activity_result_crud
from app.crud.crud_checkpoint import checkpoint as crud_checkpoint
from app.crud.crud_team import team as crud_team
from app.schemas.activity import ActivityCreate, ActivityType
from app.schemas.checkpoint import CheckPointCreate
from app.schemas.team import TeamCreate
from app.tests.conftest import make_event as _make_event


async def _make_checkpoint(pg_session, order=1):
    return await crud_checkpoint.create(
        pg_session, obj_in=CheckPointCreate(name=f"Checkpoint {order}", order=order), commit=True
    )


async def _make_team(pg_session, name="TeamA"):
    return await crud_team.create(pg_session, obj_in=TeamCreate(name=name), commit=True)


async def _make_activity(
    pg_session, checkpoint_id, activity_type=ActivityType.DEFERRED_JUDGED, config=None
):
    return await crud_activity.create(
        pg_session,
        obj_in=ActivityCreate(
            name="Deferred Activity",
            activity_type=activity_type,
            checkpoint_id=checkpoint_id,
            config=config or {},
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


async def test_capture_unknown_team_is_a_404(pg_session, pg_client, as_admin):
    """``ActivityResult.team_id`` is a foreign key, so an unknown id used to
    surface as an unhandled IntegrityError — a 500 for what is a 404. Nothing
    is written either way."""
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(pg_session, checkpoint.id)

    resp = pg_client.post(f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id=999999")

    assert resp.status_code == 404, resp.text
    assert await activity_result_crud.get_by_activity(pg_session, act.id) == []


async def test_capture_rejects_a_team_from_another_edition(pg_session, pg_client, as_admin):
    """A capture becomes a scored result once a judge reaches it, and a scored
    result resolves the post and moves the team's total — so it has to obey the
    same cross-edition guard every other write path applies."""
    current = await _make_event(pg_session)
    other = await _make_event(pg_session, name="Old Edition", is_current=False)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(pg_session, checkpoint.id)
    assert act.event_id == current.id
    team = await _make_team(pg_session)
    team.event_id = other.id
    pg_session.add(team)
    await pg_session.commit()

    resp = pg_client.post(f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}")

    assert resp.status_code == 404, resp.text
    assert await activity_result_crud.get_by_activity(pg_session, act.id) == []


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


async def test_judge_result_surfaces_score_recalc_failure(
    pg_session, pg_client, as_admin, monkeypatch
):
    """A recalculation failure after judging is no longer swallowed: it used to
    leave Team.total and classification stale with nothing to signal it. The
    judgment row still commits first, but the request now reports the error."""
    from unittest.mock import AsyncMock

    from app.core.exceptions import RallyError

    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(pg_session, checkpoint.id)
    team = await _make_team(pg_session)
    captured = pg_client.post(
        f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}"
    ).json()

    monkeypatch.setattr(
        "app.services.deferred_judging_service.ScoringService.update_team_scores",
        AsyncMock(side_effect=RallyError("boom")),
    )

    resp = pg_client.put(
        f"/api/rally/v1/activities/results/{captured['id']}/judge",
        json={"points": 60},
    )

    assert resp.status_code >= 400


async def test_judge_result_clamps_points_to_config_bounds(pg_session, pg_client, as_admin):
    """Regression: a judge-entered value outside the activity's declared
    min_points/max_points used to go straight to final_score uncapped."""
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(
        pg_session, checkpoint.id, config={"min_points": 0, "max_points": 50}
    )
    team = await _make_team(pg_session)
    captured = pg_client.post(
        f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}"
    ).json()

    resp = pg_client.put(
        f"/api/rally/v1/activities/results/{captured['id']}/judge",
        json={"points": 9999},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["final_score"] == 50


async def test_judge_result_clamps_negative_points_to_min(pg_session, pg_client, as_admin):
    await _make_event(pg_session)
    checkpoint = await _make_checkpoint(pg_session)
    act = await _make_activity(
        pg_session, checkpoint.id, config={"min_points": 10, "max_points": 100}
    )
    team = await _make_team(pg_session)
    captured = pg_client.post(
        f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team.id}"
    ).json()

    resp = pg_client.put(
        f"/api/rally/v1/activities/results/{captured['id']}/judge",
        json={"points": -50},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["final_score"] == 10


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


# ---------- rank ----------


class TestListResultsForActivity:
    async def test_lists_pending_and_judged_together(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team_a = await _make_team(pg_session, name="TeamA")
        team_b = await _make_team(pg_session, name="TeamB")
        captured_a = pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team_a.id}"
        ).json()
        pg_client.post(f"/api/rally/v1/activities/deferred/{act.id}/capture?team_id={team_b.id}")
        pg_client.put(
            f"/api/rally/v1/activities/results/{captured_a['id']}/judge",
            json={"points": 80},
        )

        resp = pg_client.get(f"/api/rally/v1/activities/deferred/{act.id}/results")

        assert resp.status_code == 200
        statuses = {r["judgment_status"] for r in resp.json()}
        assert statuses == {"judged", "pending_judgment"}

    async def test_empty_for_an_activity_with_no_captures(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)

        resp = pg_client.get(f"/api/rally/v1/activities/deferred/{act.id}/results")

        assert resp.status_code == 200
        assert resp.json() == []


class TestRankDeferredResults:
    async def _capture_n(self, pg_client, activity_id, teams):
        results = []
        for team in teams:
            body = pg_client.post(
                f"/api/rally/v1/activities/deferred/{activity_id}/capture?team_id={team.id}"
            ).json()
            results.append(body)
        return results

    async def test_first_place_gets_max_points_last_gets_min(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(
            pg_session, checkpoint.id, config={"max_points": 100, "min_points": 0}
        )
        teams = [await _make_team(pg_session, name=f"Team{i}") for i in range(3)]
        results = await self._capture_n(pg_client, act.id, teams)
        ordered = [r["id"] for r in results]

        resp = pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/rank",
            json={"ordered_result_ids": ordered},
        )

        assert resp.status_code == 200, resp.text
        body = {r["id"]: r["final_score"] for r in resp.json()}
        assert body[ordered[0]] == 100
        assert body[ordered[1]] == 50
        assert body[ordered[2]] == 0
        assert all(r["judgment_status"] == "judged" for r in resp.json())

    async def test_a_single_capture_gets_max_points(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id, config={"max_points": 100})
        team = await _make_team(pg_session)
        [result] = await self._capture_n(pg_client, act.id, [team])

        resp = pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/rank",
            json={"ordered_result_ids": [result["id"]]},
        )

        assert resp.status_code == 200
        assert resp.json()[0]["final_score"] == 100

    async def test_notes_are_attached_per_result(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        [result] = await self._capture_n(pg_client, act.id, [team])

        pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/rank",
            json={
                "ordered_result_ids": [result["id"]],
                "notes": {str(result["id"]): "Mais criativo"},
            },
        )

        judged = await activity_result_crud.get(pg_session, id=result["id"])
        assert judged.result_data["notes"] == "Mais criativo"

    async def test_rejects_a_result_from_another_activity(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        other_act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        [result] = await self._capture_n(pg_client, other_act.id, [team])

        resp = pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/rank",
            json={"ordered_result_ids": [result["id"]]},
        )

        assert resp.status_code == 400

    async def test_rejects_a_duplicated_result_id(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        team = await _make_team(pg_session)
        [result] = await self._capture_n(pg_client, act.id, [team])

        resp = pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/rank",
            json={"ordered_result_ids": [result["id"], result["id"]]},
        )

        assert resp.status_code == 400

    async def test_rejects_an_empty_ranking(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)

        resp = pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/rank",
            json={"ordered_result_ids": []},
        )

        assert resp.status_code == 400

    async def test_activity_not_found(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)

        resp = pg_client.post(
            "/api/rally/v1/activities/deferred/999999/rank",
            json={"ordered_result_ids": [1]},
        )

        assert resp.status_code == 404

    async def test_rejects_a_ranking_that_leaves_a_capture_out(
        self, pg_session, pg_client, as_admin
    ):
        """The scale is relative — last place *means* min_points — so ranking a
        subset silently re-scales it across the whole range. Nothing is scored
        when the set is short: the loop must not have written partial results."""
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        teams = [await _make_team(pg_session, name=f"Team{i}") for i in range(3)]
        results = await self._capture_n(pg_client, act.id, teams)

        resp = pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/rank",
            json={"ordered_result_ids": [results[0]["id"], results[1]["id"]]},
        )

        assert resp.status_code == 400, resp.text
        assert "1 missing" in resp.json()["detail"]
        stored = await activity_result_crud.get_by_activity(pg_session, act.id)
        assert all(r.judgment_status == "pending_judgment" for r in stored)

    async def test_the_full_field_includes_already_judged_captures(
        self, pg_session, pg_client, as_admin
    ):
        """A capture judged one at a time drops off the pending list but stays
        part of the field: leaving it out of the ranking would re-scale the
        others around a score it already has."""
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id)
        teams = [await _make_team(pg_session, name=f"Team{i}") for i in range(2)]
        results = await self._capture_n(pg_client, act.id, teams)
        pg_client.put(
            f"/api/rally/v1/activities/results/{results[0]['id']}/judge",
            json={"points": 80},
        )

        resp = pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/rank",
            json={"ordered_result_ids": [results[1]["id"]]},
        )

        assert resp.status_code == 400, resp.text

    async def test_the_complete_field_re_scores_an_already_judged_capture(
        self, pg_session, pg_client, as_admin
    ):
        """Covering everything is allowed to overwrite an individual score —
        that is the point of ranking the whole field in one pass."""
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(
            pg_session, checkpoint.id, config={"max_points": 100, "min_points": 0}
        )
        teams = [await _make_team(pg_session, name=f"Team{i}") for i in range(2)]
        results = await self._capture_n(pg_client, act.id, teams)
        pg_client.put(
            f"/api/rally/v1/activities/results/{results[0]['id']}/judge",
            json={"points": 80},
        )

        resp = pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/rank",
            json={"ordered_result_ids": [results[1]["id"], results[0]["id"]]},
        )

        assert resp.status_code == 200, resp.text
        scores = {r["id"]: r["final_score"] for r in resp.json()}
        assert scores[results[1]["id"]] == 100
        assert scores[results[0]["id"]] == 0

    async def test_a_re_ranked_result_updates_the_team_total(self, pg_session, pg_client, as_admin):
        await _make_event(pg_session)
        checkpoint = await _make_checkpoint(pg_session)
        act = await _make_activity(pg_session, checkpoint.id, config={"max_points": 100})
        team = await _make_team(pg_session)
        [result] = await self._capture_n(pg_client, act.id, [team])

        pg_client.post(
            f"/api/rally/v1/activities/deferred/{act.id}/rank",
            json={"ordered_result_ids": [result["id"]]},
        )

        await pg_session.refresh(team)
        assert team.total == 100


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
