"""Smoke test: exercises the full team-login -> check-in -> evaluation ->
scoreboard flow against a *real* running api-rally + Postgres (no route
mocking). This is the second mock-drift mitigation: e2e specs mock every API
response, so a backend contract change can go unnoticed until it reaches
users. This script hits the real HTTP API end-to-end and fails loudly on any
unexpected status code or missing field.

Requires:
- api-rally running and reachable at API_BASE_URL (real DB migrations applied)
- fake_oidc_provider.py running and api-rally's OIDC_PROVIDER_URL/CLIENT_ID
  pointed at it (see docker-compose.smoke.yml)

Run: python scripts/smoke/run_smoke.py
"""

import os
import time
from typing import Any

import httpx

API_BASE_URL = os.getenv("SMOKE_API_BASE_URL", "http://localhost:8003")
API_V1 = f"{API_BASE_URL}/api/rally/v1"
OIDC_PROVIDER_URL = os.getenv("OIDC_PROVIDER_URL", "http://localhost:9009")


def mint_token(*, sub: str, name: str, groups: list[str]) -> str:
    """Mint a token via the fake OIDC provider's own /mint endpoint, so it's
    always signed with the keypair that provider's /jwks actually serves."""
    response = httpx.post(
        f"{OIDC_PROVIDER_URL}/mint",
        json={"sub": sub, "name": name, "groups": groups},
        timeout=5.0,
    )
    response.raise_for_status()
    token: str = response.json()["access_token"]
    return token


def _check(response: httpx.Response, expected: int, step: str) -> Any:
    if response.status_code != expected:
        raise SystemExit(
            f"[SMOKE FAIL] {step}: expected {expected}, got {response.status_code}\n{response.text}"
        )
    print(f"[SMOKE OK] {step} -> {response.status_code}")
    return response.json() if response.content else {}


def wait_for_api(timeout_seconds: int = 60) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            r = httpx.get(f"{API_BASE_URL}/docs", timeout=2.0)
            if r.status_code == 200:
                print("[SMOKE] api-rally is up")
                return
        except httpx.HTTPError:
            pass
        time.sleep(1)
    raise SystemExit("[SMOKE FAIL] api-rally did not become ready in time")


def main() -> None:
    wait_for_api()

    admin_token = mint_token(sub="smoke-admin", name="Smoke Admin", groups=["admin"])
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Admin creates a checkpoint (order=1) -----------------------------
    checkpoint = _check(
        httpx.post(
            f"{API_V1}/checkpoint/",
            json={"name": "Smoke Checkpoint", "order": 1, "arrival_radius_m": 50},
            headers=admin_headers,
        ),
        201,
        "create checkpoint",
    )
    checkpoint_id = checkpoint["id"]

    # 2. Admin creates a boolean activity at that checkpoint ---------------
    activity = _check(
        httpx.post(
            f"{API_V1}/activities/",
            json={
                "name": "Smoke Activity",
                "activity_type": "BooleanActivity",
                "checkpoint_id": checkpoint_id,
                "config": {},
                "is_active": True,
            },
            headers=admin_headers,
        ),
        200,
        "create activity",
    )
    activity_id = activity["id"]

    # 3. Admin creates a team, learns its access code ----------------------
    team = _check(
        httpx.post(
            f"{API_V1}/team/",
            json={"name": "Smoke Team"},
            headers=admin_headers,
        ),
        201,
        "create team",
    )
    team_id = team["id"]
    access_code = team["access_code"]

    # 4. Team logs in with its access code (real HS256 team-auth path) -----
    login = _check(
        httpx.post(f"{API_V1}/team-auth/login", json={"access_code": access_code}),
        200,
        "team login",
    )
    team_token = login["access_token"]
    team_headers = {"Authorization": f"Bearer {team_token}"}
    _check(httpx.get(f"{API_V1}/team-auth/verify", headers=team_headers), 200, "team token verify")

    # 5. Staff (admin) checks the team in at the checkpoint -----------------
    _check(
        httpx.post(
            f"{API_V1}/checkpoint/staff-check-in",
            json={"team_code": access_code, "checkpoint_id": checkpoint_id},
            headers=admin_headers,
        ),
        200,
        "staff check-in",
    )

    # 6. Staff evaluates the team's activity (avaliação) --------------------
    _check(
        httpx.post(
            f"{API_V1}/staff/teams/{team_id}/activities/{activity_id}/evaluate",
            json={"result_data": {"success": True}, "extra_shots": 0, "penalties": {}},
            headers=admin_headers,
        ),
        200,
        "evaluate activity",
    )

    # 7. Scoreboard reflects the team ---------------------------------------
    scoreboard = _check(
        httpx.get(f"{API_V1}/scoreboard/live", headers=admin_headers),
        200,
        "scoreboard live",
    )
    team_ids_on_board = {entry["team_id"] for entry in scoreboard}
    if team_id not in team_ids_on_board:
        raise SystemExit(f"[SMOKE FAIL] scoreboard live: team {team_id} missing from {scoreboard}")
    print("[SMOKE OK] scoreboard contains the smoke team")

    print("\n[SMOKE PASS] login -> check-in -> evaluation -> scoreboard all succeeded against the real stack")


if __name__ == "__main__":
    main()
