"""Unit tests for the pure normalize_home_layout/normalize_ticker_items
helpers in app.schemas.rally_settings — no test file previously covered
these branches directly."""
from app.schemas.rally_settings import (
    HOME_SECTION_KEYS,
    MAX_TICKER_ITEMS,
    normalize_home_layout,
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
