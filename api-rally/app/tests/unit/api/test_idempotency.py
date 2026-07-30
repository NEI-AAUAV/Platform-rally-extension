"""DB-free tests for idempotency fingerprinting."""

from app.api.api_v1.idempotency import compute_fingerprint


def test_fingerprint_is_stable_across_key_order() -> None:
    a = compute_fingerprint({"team_id": 1, "body": {"x": 1, "y": 2}})
    b = compute_fingerprint({"body": {"y": 2, "x": 1}, "team_id": 1})
    assert a == b


def test_fingerprint_differs_on_payload_change() -> None:
    a = compute_fingerprint({"team_id": 1, "body": {"assigned_points": 50}})
    b = compute_fingerprint({"team_id": 1, "body": {"assigned_points": 90}})
    assert a != b


def test_fingerprint_is_hex_sha256() -> None:
    fp = compute_fingerprint({"a": 1})
    assert len(fp) == 64
    int(fp, 16)  # raises if not hex
