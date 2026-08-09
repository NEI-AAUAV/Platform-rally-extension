"""Progression rules for a route split into stages, and per-post opening hours.

Pure functions over plain data: the services fetch the rows, this module
decides. Keeping it free of the database is what makes the rules testable
without a route, a team and an event behind them.

The model deliberately works on **resolved orders** — the set of posts a team
has finished, given up on, or simply arrived at — rather than on a count.
A count is enough while the whole route is walked in sequence, but a stage
where the team picks three bars out of five breaks that assumption: two teams
with the same number of arrivals can be standing in different places.
"""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Stage:
    """One block of the route, with the orders of the posts inside it."""

    id: int
    order: int
    order_matters: bool
    # How many of this stage's posts must be resolved before the next stage
    # opens. None means all of them.
    required_count: int | None
    checkpoint_orders: tuple[int, ...]

    @property
    def required(self) -> int:
        """How many posts this stage demands, clamped to what it actually has.

        A stage asking for more posts than it contains would never complete
        and would strand the route behind it — an admin typo should not end
        the event.
        """
        total = len(self.checkpoint_orders)
        if self.required_count is None:
            return total
        return max(0, min(self.required_count, total))


def build_stages(
    rows: Iterable[tuple[int, int, bool, int | None]], orders_by_stage: Mapping[int, Sequence[int]]
) -> list[Stage]:
    """Assemble ``Stage`` objects from (id, order, order_matters, required_count)
    rows and the checkpoint orders grouped by stage id."""
    return [
        Stage(
            id=stage_id,
            order=order,
            order_matters=order_matters,
            required_count=required_count,
            checkpoint_orders=tuple(sorted(orders_by_stage.get(stage_id, ()))),
        )
        for stage_id, order, order_matters, required_count in sorted(rows, key=lambda r: r[1])
    ]


def resolved_in_stage(stage: Stage, resolved_orders: frozenset[int]) -> int:
    return sum(1 for order in stage.checkpoint_orders if order in resolved_orders)


def is_stage_complete(stage: Stage, resolved_orders: frozenset[int]) -> bool:
    return resolved_in_stage(stage, resolved_orders) >= stage.required


def is_reachable_in_stages(
    *,
    checkpoint_order: int,
    stages: Sequence[Stage],
    resolved_orders: frozenset[int],
) -> bool:
    """Whether a team may check into ``checkpoint_order`` under stage rules.

    Three conditions, in order of how often they bite:

    * the post is not already resolved — a team does not visit the same post
      twice, whichever rule its stage runs under;
    * every earlier stage has met its ``required`` count, so a team cannot
      start the bars before finishing the university block;
    * inside an ordered stage, every earlier post of that stage is resolved.
      Inside a free stage, any unresolved post is fair game.

    A post belonging to no stage falls outside this model entirely and is
    treated as reachable — the caller decides what to do with it (see
    ``TeamService``, which falls back to the count-based rule).
    """
    if checkpoint_order in resolved_orders:
        return False

    own_stage = next((s for s in stages if checkpoint_order in s.checkpoint_orders), None)
    if own_stage is None:
        return True

    for stage in stages:
        if stage.order >= own_stage.order:
            break
        if not is_stage_complete(stage, resolved_orders):
            return False

    if not own_stage.order_matters:
        return True

    return all(
        order in resolved_orders
        for order in own_stage.checkpoint_orders
        if order < checkpoint_order
    )


def is_open_at(
    *,
    available_from: datetime | None,
    available_until: datetime | None,
    now: datetime,
) -> bool:
    """Whether a post's own opening window contains ``now``.

    Both bounds are optional and independent: a bar that opens at 22:00 with
    no closing time is the common case.
    """
    if available_from is not None and now < available_from:
        return False
    return not (available_until is not None and now > available_until)


def opening_state(
    *,
    available_from: datetime | None,
    available_until: datetime | None,
    now: datetime,
) -> str:
    """``"open"``, ``"not_yet"`` or ``"closed"`` — what to tell the team.

    "Not yet" and "closed" are different situations: one is worth waiting
    for, the other means moving on.
    """
    if available_from is not None and now < available_from:
        return "not_yet"
    if available_until is not None and now > available_until:
        return "closed"
    return "open"
