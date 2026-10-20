"""compute_paces reuses one ranking across requests for PACE_CACHE_TTL_SECONDS."""

import pytest

from app.services import pace_service
from app.services.pace_service import TeamPace


def _pace(team_id: int) -> TeamPace:
    return TeamPace(
        team_id=team_id,
        started_at=None,
        last_progress_at=None,
        elapsed_seconds=None,
        resolved_count=0,
        total_published=3,
        is_finished=False,
        rank=0,
    )


@pytest.fixture
def loads(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    calls: list[int] = []

    async def fake_load(db: object, settings: object) -> list[TeamPace]:
        calls.append(1)
        return [_pace(len(calls))]

    async def fake_event_id(db: object) -> int:
        return 1

    clock = {"now": 100.0}
    monkeypatch.setattr(pace_service, "_load_paces", fake_load)
    monkeypatch.setattr(pace_service, "current_event_id", fake_event_id)
    monkeypatch.setattr(pace_service.time, "monotonic", lambda: clock["now"])
    monkeypatch.setattr(pace_service.app_settings, "PACE_CACHE_TTL_SECONDS", 2.0)
    monkeypatch.setattr(pace_service, "_pace_cache", {})
    return calls


async def test_second_call_within_ttl_is_served_from_cache(loads: list[int]) -> None:
    first = await pace_service.compute_paces(object(), object())  # type: ignore[arg-type]
    second = await pace_service.compute_paces(object(), object())  # type: ignore[arg-type]

    assert len(loads) == 1
    assert first == second


async def test_call_after_ttl_recomputes(loads: list[int], monkeypatch: pytest.MonkeyPatch) -> None:
    await pace_service.compute_paces(object(), object())  # type: ignore[arg-type]
    monkeypatch.setattr(pace_service.time, "monotonic", lambda: 103.0)

    refreshed = await pace_service.compute_paces(object(), object())  # type: ignore[arg-type]

    assert len(loads) == 2
    assert refreshed[0].team_id == 2


async def test_refresh_is_claimed_so_concurrent_callers_get_the_old_ranking(
    loads: list[int], monkeypatch: pytest.MonkeyPatch
) -> None:
    await pace_service.compute_paces(object(), object())  # type: ignore[arg-type]
    monkeypatch.setattr(pace_service.time, "monotonic", lambda: 103.0)
    seen_during_refresh: list[list[TeamPace]] = []

    async def slow_load(db: object, settings: object) -> list[TeamPace]:
        # A second request arrives while the first one is still recomputing.
        seen_during_refresh.append(
            await pace_service.compute_paces(object(), object())  # type: ignore[arg-type]
        )
        return [_pace(99)]

    monkeypatch.setattr(pace_service, "_load_paces", slow_load)
    await pace_service.compute_paces(object(), object())  # type: ignore[arg-type]

    assert seen_during_refresh[0][0].team_id == 1


async def test_ttl_zero_disables_the_cache(
    loads: list[int], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(pace_service.app_settings, "PACE_CACHE_TTL_SECONDS", 0.0)

    await pace_service.compute_paces(object(), object())  # type: ignore[arg-type]
    await pace_service.compute_paces(object(), object())  # type: ignore[arg-type]

    assert len(loads) == 2


async def test_failed_load_is_not_cached(loads: list[int], monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(db: object, settings: object) -> list[TeamPace]:
        raise RuntimeError("db down")

    monkeypatch.setattr(pace_service, "_load_paces", boom)
    with pytest.raises(RuntimeError):
        await pace_service.compute_paces(object(), object())  # type: ignore[arg-type]

    assert pace_service._pace_cache == {}
