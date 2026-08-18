"""Unit tests for the pure normalize_home_layout/normalize_ticker_items
helpers in app.schemas.rally_settings — no test file previously covered
these branches directly."""

from app.schemas.rally_settings import (
    DEFAULT_RULE_SECTION_ICON,
    HOME_SECTION_KEYS,
    MAX_RULE_SECTION_BODY_LENGTH,
    MAX_RULE_SECTION_TITLE_LENGTH,
    MAX_RULE_SECTIONS,
    MAX_TICKER_ITEMS,
    normalize_home_layout,
    normalize_rule_sections,
    normalize_ticker_items,
)


class _Entry:
    """Object-style entry (getattr path) rather than a dict."""

    def __init__(self, key, visible=True):
        self.key = key
        self.visible = visible


def test_normalize_home_layout_drops_unknown_keys():
    result = normalize_home_layout([{"key": "not_a_real_section", "visible": True}])
    keys = [r["key"] for r in result]
    assert "not_a_real_section" not in keys
    assert set(keys) == set(HOME_SECTION_KEYS)


def test_normalize_home_layout_dedupes_repeated_keys():
    result = normalize_home_layout(
        [
            {"key": "home_hero", "visible": False},
            {"key": "home_hero", "visible": True},  # duplicate, dropped
        ]
    )
    hero_entries = [r for r in result if r["key"] == "home_hero"]
    assert len(hero_entries) == 1
    assert hero_entries[0]["visible"] is False  # first occurrence wins


def test_normalize_home_layout_accepts_object_entries():
    result = normalize_home_layout([_Entry("home_hero", visible=False)])
    hero_entries = [r for r in result if r["key"] == "home_hero"]
    assert hero_entries[0]["visible"] is False


def test_normalize_home_layout_fills_missing_keys():
    result = normalize_home_layout([])
    assert {r["key"] for r in result} == set(HOME_SECTION_KEYS)
    assert all(r["visible"] is True for r in result)


def test_normalize_ticker_items_strips_and_drops_blanks():
    result = normalize_ticker_items(["  hello  ", "   ", ""])
    assert result == ["hello"]


def test_normalize_ticker_items_caps_length():
    result = normalize_ticker_items(["x" * 100])
    assert len(result[0]) == 40


def test_normalize_ticker_items_caps_total_count():
    items = [f"item-{i}" for i in range(MAX_TICKER_ITEMS + 5)]
    result = normalize_ticker_items(items)
    assert len(result) == MAX_TICKER_ITEMS


def test_normalize_ticker_items_handles_none():
    assert normalize_ticker_items(None) == []


def test_normalize_rule_sections_drops_entries_without_id():
    result = normalize_rule_sections([{"title": "No id"}, {"id": "a", "title": "Kept"}])
    assert len(result) == 1
    assert result[0]["id"] == "a"


def test_normalize_rule_sections_trims_and_defaults_fields():
    result = normalize_rule_sections([{"id": "a", "title": "  Padded  ", "body": "  Text  "}])
    assert result[0]["title"] == "Padded"
    assert result[0]["body"] == "Text"
    assert result[0]["icon"] == DEFAULT_RULE_SECTION_ICON


def test_normalize_rule_sections_falls_back_unknown_icon():
    result = normalize_rule_sections([{"id": "a", "icon": "NotAnIcon"}])
    assert result[0]["icon"] == DEFAULT_RULE_SECTION_ICON


def test_normalize_rule_sections_keeps_allowed_icon():
    result = normalize_rule_sections([{"id": "a", "icon": "Trophy"}])
    assert result[0]["icon"] == "Trophy"


def test_normalize_rule_sections_caps_title_and_body_length():
    result = normalize_rule_sections(
        [
            {
                "id": "a",
                "title": "x" * (MAX_RULE_SECTION_TITLE_LENGTH + 50),
                "body": "y" * (MAX_RULE_SECTION_BODY_LENGTH + 50),
            }
        ]
    )
    assert len(result[0]["title"]) == MAX_RULE_SECTION_TITLE_LENGTH
    assert len(result[0]["body"]) == MAX_RULE_SECTION_BODY_LENGTH


def test_normalize_rule_sections_caps_count():
    entries = [{"id": str(i), "title": f"Section {i}"} for i in range(MAX_RULE_SECTIONS + 10)]
    result = normalize_rule_sections(entries)
    assert len(result) == MAX_RULE_SECTIONS


def test_normalize_rule_sections_preserves_order():
    entries = [{"id": "b", "title": "B"}, {"id": "a", "title": "A"}]
    result = normalize_rule_sections(entries)
    assert [s["id"] for s in result] == ["b", "a"]


def test_normalize_rule_sections_handles_none():
    assert normalize_rule_sections(None) == []
