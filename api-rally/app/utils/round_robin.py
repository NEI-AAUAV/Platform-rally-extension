"""Round-robin rotation schedule generator (D2).

Produces a schedule where every team visits every checkpoint exactly once,
rotating through stations in a balanced way. Works for any N teams and K
checkpoints (N need not equal K).

Algorithm:
- If N <= K: each round assigns each team a distinct checkpoint; after K rounds
  every team has visited every checkpoint.
- If N > K: same idea but teams wrap around.

Returns a list of rounds; each round is a list of {team_id, checkpoint_id} pairs.
"""

from typing import Any


def generate_schedule(
    team_ids: list[int],
    checkpoint_ids: list[int],
) -> list[list[dict[str, Any]]]:
    """Generate a balanced round-robin rotation.

    Each team appears exactly once per round. The schedule has
    max(len(team_ids), len(checkpoint_ids)) rounds so every (team, checkpoint)
    pair is visited at least once over the full event.
    """
    n_teams = len(team_ids)
    n_checkpoints = len(checkpoint_ids)
    if n_teams == 0 or n_checkpoints == 0:
        return []

    n_rounds = max(n_teams, n_checkpoints)
    schedule: list[list[dict[str, Any]]] = []

    for round_idx in range(n_rounds):
        round_assignments: list[dict[str, Any]] = []
        for team_pos, team_id in enumerate(team_ids):
            cp_idx = (team_pos + round_idx) % n_checkpoints
            round_assignments.append({"team_id": team_id, "checkpoint_id": checkpoint_ids[cp_idx]})
        schedule.append(round_assignments)

    return schedule
