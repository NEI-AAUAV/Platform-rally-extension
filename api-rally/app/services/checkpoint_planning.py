"""Route-planning helpers: readiness of a checkpoint, and importing a route
that was drafted outside the app.

Both are pure functions with no database access so they can be unit-tested
directly and reused by the admin API without a service instance.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

# Field keys reported as "missing" on a checkpoint that is not ready to be
# published. Kept as plain strings because the frontend maps them to
# translated labels; adding one here is a UI change, not a contract break.
MISSING_NAME = "name"
MISSING_CLUE = "clue"
MISSING_COORDINATES = "coordinates"
MISSING_ACTIVITY = "activity"
MISSING_STAFF = "staff"
MISSING_STAGE = "stage"

# A pasted route table has four columns in the order the planning document
# uses them. Extra columns are ignored; missing trailing ones are blank.
IMPORT_COLUMNS = ("name", "staff_script", "clue", "challenge_brief")

# Cells the planning document uses to mean "not decided yet". Compared
# case-insensitively after stripping.
UNDECIDED_MARKERS = frozenset(
    {"cf decide", "cf", "-", "--", "?", "tbd", "a decidir", "por decidir"}
)


def is_undecided(value: str | None) -> bool:
    """Whether a pasted cell means "still to be decided" rather than content."""
    if value is None:
        return True
    text = value.strip().lower()
    return not text or text in UNDECIDED_MARKERS


def missing_fields(
    checkpoint: object,
    *,
    has_activity: bool,
    has_staff: bool,
    requires_coordinates: bool,
    requires_clue: bool,
    requires_stage: bool = False,
) -> list[str]:
    """What a checkpoint still lacks before it can be published.

    ``requires_coordinates`` follows the event's GPS check-in setting: a post
    with no coordinates is perfectly valid in a guided rally and unreachable
    in a self-check-in one. ``requires_clue`` follows redaction: only a route
    whose posts are hidden needs a riddle to find them by. ``requires_stage``
    follows ``route_stages_enabled``: once an event runs on stages, a post
    with none is invisible to the whole progression rule (see
    ``route_stages.is_reachable_in_stages`` — a checkpoint outside every stage
    falls back to the plain sequential rule, which is easy to mistake for
    "working as intended" when the intent was a staged route).
    """
    missing: list[str] = []
    name = (getattr(checkpoint, "name", "") or "").strip()
    if not name or getattr(checkpoint, "is_placeholder", False):
        missing.append(MISSING_NAME)
    if requires_clue and not (getattr(checkpoint, "clue", None) or "").strip():
        missing.append(MISSING_CLUE)
    if requires_coordinates and (
        getattr(checkpoint, "latitude", None) is None
        or getattr(checkpoint, "longitude", None) is None
    ):
        missing.append(MISSING_COORDINATES)
    if not has_activity:
        missing.append(MISSING_ACTIVITY)
    if not has_staff:
        missing.append(MISSING_STAFF)
    if requires_stage and getattr(checkpoint, "stage_id", None) is None:
        missing.append(MISSING_STAGE)
    return missing


@dataclass(frozen=True)
class ImportedRow:
    """One parsed row of a pasted route table."""

    name: str
    staff_script: str | None
    clue: str | None
    challenge_brief: str | None
    is_placeholder: bool


def _split_row(line: str) -> list[str]:
    """Split a pasted line into cells.

    Tabs first: pasting a table out of a document or spreadsheet produces
    tab-separated cells, and the prose in those cells is full of commas.
    Falls back to a pipe, then to a semicolon; a line with none of them is a
    name-only row.
    """
    for separator in ("\t", "|", ";"):
        if separator in line:
            return [cell.strip() for cell in line.split(separator)]
    return [line.strip()]


def _looks_like_header(cells: Sequence[str]) -> bool:
    first = cells[0].strip().lower() if cells else ""
    return first in {"name", "nome", "posto", "checkpoint", "local"}


def parse_route_paste(text: str) -> list[ImportedRow]:
    """Parse a pasted route table into rows ready to become draft posts.

    Every row becomes a checkpoint even when only the name is filled in —
    that is the point: a route is planned one cell at a time, and "Bar 1"
    with nothing else is a real, if unfinished, stop. Undecided cells
    ("CF DECIDE") are stored as empty rather than as literal text, so they
    show up as missing fields instead of masquerading as content.
    """
    rows: list[ImportedRow] = []
    for line_number, raw_line in enumerate(text.splitlines()):
        row = _parse_line(raw_line, is_first_line=line_number == 0)
        if row is not None:
            rows.append(row)
    return rows


def _parse_line(raw_line: str, *, is_first_line: bool) -> ImportedRow | None:
    """One line of a pasted table, or None when it carries no post."""
    if not raw_line.strip():
        return None
    cells = _split_row(raw_line)
    if is_first_line and _looks_like_header(cells):
        return None
    name = cells[0].strip()
    if not name:
        return None

    def cell(index: int) -> str | None:
        value = cells[index] if index < len(cells) else None
        return None if is_undecided(value) else (value or "").strip()

    return ImportedRow(
        name=name,
        staff_script=cell(1),
        clue=cell(2),
        challenge_brief=cell(3),
        is_placeholder=_is_placeholder_name(name),
    )


def _is_placeholder_name(name: str) -> bool:
    """Whether a name is a numbered stand-in like "Bar 1" or "Posto 3".

    A trailing bare number after a short generic word is what the planning
    document uses for a venue nobody has picked yet.
    """
    parts = name.strip().split()
    if len(parts) != 2 or not parts[1].isdigit():
        return False
    return parts[0].strip().lower() in {"bar", "posto", "post", "checkpoint", "local", "paragem"}


def next_orders(start: int, count: int) -> Iterable[int]:
    """Order values for ``count`` new checkpoints appended after ``start``."""
    return range(start + 1, start + 1 + count)
