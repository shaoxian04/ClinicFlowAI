from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class DoseParseResult:
    ok: bool
    dose_mg: float | None = None
    reason: str | None = None


@dataclass(frozen=True)
class FreqParseResult:
    ok: bool
    per_day: int | None = None
    reason: str | None = None


_DOSE_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*(mg|g|mcg|µg)\s*$", re.IGNORECASE)
_UNIT_TO_MG = {"mg": 1.0, "g": 1000.0, "mcg": 0.001, "µg": 0.001}


def parse_dose_mg(raw: str) -> DoseParseResult:
    if not raw or not raw.strip():
        return DoseParseResult(ok=False, reason="dose_unit_missing")
    m = _DOSE_RE.match(raw)
    if not m:
        return DoseParseResult(ok=False, reason="dose_unit_missing")
    value = float(m.group(1))
    unit = m.group(2).lower()
    return DoseParseResult(ok=True, dose_mg=value * _UNIT_TO_MG[unit])


_FREQ_TABLE: dict[str, int] = {
    "OD": 1, "BD": 2, "TDS": 3, "TID": 3, "QID": 4, "QDS": 4,
    "Q4H": 6, "Q6H": 4, "Q8H": 3, "Q12H": 2, "Q24H": 1,
    "ONCE A DAY": 1, "ONCE DAILY": 1,
    "TWICE A DAY": 2, "TWICE DAILY": 2,
    "THREE TIMES A DAY": 3, "THREE TIMES DAILY": 3,
    "FOUR TIMES A DAY": 4, "FOUR TIMES DAILY": 4,
}


def parse_frequency_per_day(raw: str) -> FreqParseResult:
    if not raw or not raw.strip():
        return FreqParseResult(ok=False, reason="frequency_unparseable")
    key = raw.strip().upper()
    if key in _FREQ_TABLE:
        return FreqParseResult(ok=True, per_day=_FREQ_TABLE[key])
    return FreqParseResult(ok=False, reason="frequency_unparseable")
