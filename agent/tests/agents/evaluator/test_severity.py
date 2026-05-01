import pytest
from app.agents.evaluator.severity import (
    map_ddi_severity,
    map_pregnancy_severity,
    map_dose_severity,
)


@pytest.mark.parametrize("raw,expected", [
    ("MAJOR", "CRITICAL"),
    ("MODERATE", "HIGH"),
    ("MINOR", "LOW"),
    ("major", "CRITICAL"),
    ("unknown", "LOW"),
])
def test_map_ddi_severity(raw, expected):
    assert map_ddi_severity(raw) == expected


@pytest.mark.parametrize("status,category,lactation_safe,expected", [
    ("PREGNANT", "D", None, "CRITICAL"),
    ("PREGNANT", "X", None, "CRITICAL"),
    ("PREGNANT", "C", None, "HIGH"),
    ("PREGNANT", "B", None, "LOW"),
    ("PREGNANT", "A", None, "LOW"),
    ("PREGNANT", None, None, "MEDIUM"),
    ("LACTATING", "X", None, "CRITICAL"),
    ("LACTATING", "D", False, "HIGH"),
    ("LACTATING", "D", True, "MEDIUM"),
    ("LACTATING", "D", None, "MEDIUM"),
    ("LACTATING", "C", None, "MEDIUM"),
    ("LACTATING", "B", None, "LOW"),
    ("LACTATING", None, None, "MEDIUM"),
])
def test_map_pregnancy_severity(status, category, lactation_safe, expected):
    assert map_pregnancy_severity(status, category, lactation_safe) == expected


@pytest.mark.parametrize("kind,expected", [
    ("over_max_dose", "CRITICAL"),
    ("over_max_daily", "CRITICAL"),
    ("under_min_dose", "HIGH"),
    ("no_rule", "MEDIUM"),
    ("weight_unknown", "MEDIUM"),
    ("dose_unit_missing", "MEDIUM"),
    ("frequency_unparseable", "LOW"),
    ("unknown_drug", "LOW"),
])
def test_map_dose_severity(kind, expected):
    assert map_dose_severity(kind) == expected
