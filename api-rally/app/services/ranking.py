"""Score-by-ranking: turn an ordered list of entries into points.

Pure function, no DB access — mirrors the pattern in ``route_stages.py``.
Used by deferred judging (rank the captured photos for one post, 1st place
gets max_points) so the judge orders, not types a number per photo.
"""


def linear_rank_points(*, rank: int, total: int, max_points: float, min_points: float) -> float:
    """Points for finishing ``rank`` (1-indexed, 1 = best) out of ``total``.

    Linearly interpolates from ``max_points`` at rank 1 down to
    ``min_points`` at the last rank — the same shape as a race's placement
    scoring. A single entry gets ``max_points``: with nothing to compare
    against, "first place" is the only judgment there is to make.
    """
    if total <= 1:
        return max_points
    fraction = (rank - 1) / (total - 1)
    return max_points - fraction * (max_points - min_points)
