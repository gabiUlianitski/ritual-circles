"""Group-size suggestions must match the existing circle size rules."""

from app.services.hoby_enrichment import sanitize_group_size


def test_range_within_circle_cap():
    assert sanitize_group_size({"type": "range", "min": 3, "max": 6}) == {
        "type": "range",
        "min": 3,
        "max": 6,
    }


def test_values_above_six_are_capped():
    assert sanitize_group_size({"type": "range", "min": 4, "max": 8}) == {
        "type": "range",
        "min": 4,
        "max": 6,
    }


def test_invalid_shape_is_dropped():
    assert sanitize_group_size({"type": "range"}) is None
    assert sanitize_group_size("4-8") is None
    assert sanitize_group_size({"type": "crowd", "min": 2, "max": 4}) is None
