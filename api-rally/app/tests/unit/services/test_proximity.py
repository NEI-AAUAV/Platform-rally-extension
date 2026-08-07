"""Unit tests for the proximity aid's pure pieces — no DB, no session.

The whole feature is a trade: help a team that does not know the city without
handing over the post. These cover the two things that make that trade hold —
the bearing is coarse, and it is only offered once the team is already there.
"""

import pytest

from app.services.proximity_service import _COMPASS_BAND_M, _SECTORS, bearing_sector


class TestBearingSector:
    @pytest.mark.parametrize(
        ("to_lat", "to_lon", "expected"),
        [
            (41.0, -8.0, "N"),
            (40.0, -8.0, "S"),
            (40.5, -7.0, "E"),
            (40.5, -9.0, "O"),
        ],
    )
    def test_cardinal_directions(self, to_lat: float, to_lon: float, expected: str) -> None:
        assert (
            bearing_sector(from_lat=40.5, from_lon=-8.0, to_lat=to_lat, to_lon=to_lon) == expected
        )

    def test_diagonals_land_on_the_intercardinal_sectors(self) -> None:
        assert bearing_sector(from_lat=40.5, from_lon=-8.0, to_lat=41.0, to_lon=-7.5) == "NE"
        assert bearing_sector(from_lat=40.5, from_lon=-8.0, to_lat=40.0, to_lon=-8.5) == "SO"

    def test_only_ever_returns_one_of_eight_sectors(self) -> None:
        # 45°-wide sectors are the point: a degree-accurate bearing taken from
        # two positions crosses on the answer, a sector does not.
        results = {
            bearing_sector(
                from_lat=40.5, from_lon=-8.0, to_lat=40.5 + dy / 100, to_lon=-8.0 + dx / 100
            )
            for dy in range(-9, 10)
            for dx in range(-9, 10)
            if (dy, dx) != (0, 0)
        }
        assert results <= set(_SECTORS)

    def test_never_reports_degrees(self) -> None:
        sector = bearing_sector(from_lat=40.5, from_lon=-8.0, to_lat=40.6, to_lon=-8.03)
        assert not any(char.isdigit() for char in sector)


class TestCompassBand:
    def test_the_compass_band_is_the_innermost_distance_bucket(self) -> None:
        # The compass unlocks only where the team has effectively arrived, so
        # it must track the tightest band rather than a separate constant that
        # could drift away from it.
        from app.services.checkpoint_arrival_service import _DISTANCE_BUCKETS

        assert _DISTANCE_BUCKETS[0][0] == _COMPASS_BAND_M
