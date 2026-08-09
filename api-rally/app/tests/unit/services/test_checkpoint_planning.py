"""Unit tests for route planning: readiness of a post, and parsing a route
table pasted out of a planning document.
"""

from types import SimpleNamespace

from app.services.checkpoint_planning import (
    MISSING_ACTIVITY,
    MISSING_CLUE,
    MISSING_COORDINATES,
    MISSING_NAME,
    MISSING_STAFF,
    is_undecided,
    missing_fields,
    next_orders,
    parse_route_paste,
)


def make_checkpoint(**overrides: object) -> SimpleNamespace:
    base = {
        "name": "Cantina de Santiago",
        "clue": "Segue o cheiro da comida",
        "latitude": 40.63,
        "longitude": -8.65,
        "is_placeholder": False,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


class TestMissingFields:
    def test_complete_checkpoint_is_ready(self) -> None:
        missing = missing_fields(
            make_checkpoint(),
            has_activity=True,
            has_staff=True,
            requires_coordinates=True,
            requires_clue=True,
        )

        assert missing == []

    def test_reports_every_unfilled_field(self) -> None:
        checkpoint = make_checkpoint(name="  ", clue=None, latitude=None, longitude=None)

        missing = missing_fields(
            checkpoint,
            has_activity=False,
            has_staff=False,
            requires_coordinates=True,
            requires_clue=True,
        )

        assert set(missing) == {
            MISSING_NAME,
            MISSING_CLUE,
            MISSING_COORDINATES,
            MISSING_ACTIVITY,
            MISSING_STAFF,
        }

    def test_placeholder_name_counts_as_missing(self) -> None:
        checkpoint = make_checkpoint(name="Bar 1", is_placeholder=True)

        missing = missing_fields(
            checkpoint,
            has_activity=True,
            has_staff=True,
            requires_coordinates=True,
            requires_clue=True,
        )

        assert missing == [MISSING_NAME]

    def test_coordinates_and_clue_only_required_when_the_event_uses_them(self) -> None:
        checkpoint = make_checkpoint(clue=None, latitude=None, longitude=None)

        missing = missing_fields(
            checkpoint,
            has_activity=True,
            has_staff=True,
            requires_coordinates=False,
            requires_clue=False,
        )

        assert missing == []


class TestIsUndecided:
    def test_planning_markers_are_not_content(self) -> None:
        assert is_undecided("CF DECIDE")
        assert is_undecided(" tbd ")
        assert is_undecided("")
        assert is_undecided(None)

    def test_real_text_is_content(self) -> None:
        assert not is_undecided("Pirâmide humana")


class TestParseRoutePaste:
    def test_parses_the_four_planning_columns(self) -> None:
        text = "Aristides\tFalar de desportos\tA pista seria uma bola\tGirar 5x e acertar"

        rows = parse_route_paste(text)

        assert len(rows) == 1
        assert rows[0].name == "Aristides"
        assert rows[0].staff_script == "Falar de desportos"
        assert rows[0].clue == "A pista seria uma bola"
        assert rows[0].challenge_brief == "Girar 5x e acertar"
        assert rows[0].is_placeholder is False

    def test_undecided_cells_become_empty_not_literal_text(self) -> None:
        text = "Refúgio dos Drinks\tCF DECIDE\tEstás a precisar de energia?\tCF DECIDE"

        row = parse_route_paste(text)[0]

        assert row.staff_script is None
        assert row.challenge_brief is None
        assert row.clue == "Estás a precisar de energia?"

    def test_name_only_row_is_still_a_post(self) -> None:
        rows = parse_route_paste("Bar 1\nBar 2\nBar 3")

        assert [row.name for row in rows] == ["Bar 1", "Bar 2", "Bar 3"]
        assert all(row.is_placeholder for row in rows)
        assert all(row.clue is None for row in rows)

    def test_named_venue_is_not_a_placeholder(self) -> None:
        assert parse_route_paste("Ponte dos Laços de Amizade")[0].is_placeholder is False

    def test_header_row_is_dropped_only_at_the_top(self) -> None:
        text = "Posto\tAssunto\tPista\tDesafio\nAristides\ta\tb\tc\nPosto\tx\ty\tz"

        rows = parse_route_paste(text)

        assert [row.name for row in rows] == ["Aristides", "Posto"]

    def test_pipe_and_semicolon_also_separate_cells(self) -> None:
        assert parse_route_paste("Aristides | a | b | c")[0].clue == "b"
        assert parse_route_paste("Aristides; a; b; c")[0].challenge_brief == "c"

    def test_commas_inside_prose_do_not_split_cells(self) -> None:
        row = parse_route_paste("Aristides\tFalar, incentivar, e perguntar")[0]

        assert row.staff_script == "Falar, incentivar, e perguntar"

    def test_a_row_whose_first_cell_is_empty_is_not_a_post(self) -> None:
        # A stray continuation line in the pasted table: cells but no name.
        assert parse_route_paste("\tpista órfã\tsem posto") == []

    def test_blank_lines_are_ignored(self) -> None:
        assert len(parse_route_paste("Aristides\n\n   \nBar 1\n")) == 2


class TestNextOrders:
    def test_appends_after_the_last_existing_post(self) -> None:
        assert list(next_orders(4, 3)) == [5, 6, 7]

    def test_first_import_starts_at_one(self) -> None:
        assert list(next_orders(0, 2)) == [1, 2]
