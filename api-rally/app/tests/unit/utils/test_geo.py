"""Unit tests for haversine distance utility."""
import pytest
from app.utils.geo import distance_m


def test_same_point_zero():
    assert distance_m(41.1496, -8.6109, 41.1496, -8.6109) == pytest.approx(0.0, abs=0.01)


def test_known_distance_porto_lisbon():
    # Porto (41.1496, -8.6109) to Lisbon (38.7169, -9.1399) ≈ 274 km (haversine straight-line)
    d = distance_m(41.1496, -8.6109, 38.7169, -9.1399)
    assert 270_000 < d < 280_000


def test_small_distance_within_radius():
    # ~5m north
    d = distance_m(41.0, -8.0, 41.000045, -8.0)
    assert d < 10


def test_equator_crossing():
    d = distance_m(0.0, 0.0, 0.0, 1.0)
    assert abs(d - 111_195) < 500  # 1 degree longitude at equator ≈ 111.195 km
