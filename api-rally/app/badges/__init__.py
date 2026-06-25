"""Badge evaluation: rules that turn scoring results into team badges."""

from app.badges.evaluators import BadgeAward, evaluate_result

__all__ = ["BadgeAward", "evaluate_result"]
