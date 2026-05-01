import pytest
from app.agents.evaluator.dose_parser import (
    parse_dose_mg,
    parse_frequency_per_day,
    DoseParseResult,
    FreqParseResult,
)


@pytest.mark.parametrize("raw,expected_mg", [
    ("500mg", 500.0),
    ("500 mg", 500.0),
    ("250 MG", 250.0),
    ("1g", 1000.0),
    ("1 g", 1000.0),
    ("0.5g", 500.0),
    ("100mcg", 0.1),
])
def test_parse_dose_mg_known(raw, expected_mg):
    r = parse_dose_mg(raw)
    assert r.ok is True
    assert r.dose_mg == expected_mg


@pytest.mark.parametrize("raw", ["500", "twice", "five mg", "", "  "])
def test_parse_dose_mg_unknown(raw):
    r = parse_dose_mg(raw)
    assert r.ok is False
    assert r.reason == "dose_unit_missing"


@pytest.mark.parametrize("raw,expected", [
    ("OD", 1),
    ("BD", 2),
    ("TDS", 3),
    ("QID", 4),
    ("QDS", 4),
    ("Q4H", 6),
    ("Q6H", 4),
    ("Q8H", 3),
    ("Q12H", 2),
    ("once daily", 1),
    ("twice daily", 2),
    ("three times daily", 3),
    ("four times daily", 4),
    ("Once a day", 1),
    ("BD", 2),
    ("bd", 2),
])
def test_parse_frequency_known(raw, expected):
    r = parse_frequency_per_day(raw)
    assert r.ok is True
    assert r.per_day == expected


@pytest.mark.parametrize("raw", ["when needed", "PRN", "as required", "ad lib", ""])
def test_parse_frequency_unparseable(raw):
    r = parse_frequency_per_day(raw)
    assert r.ok is False
    assert r.reason == "frequency_unparseable"
