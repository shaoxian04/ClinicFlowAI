from __future__ import annotations

from typing import Literal

Severity = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]

_DDI_MAP: dict[str, Severity] = {"MAJOR": "CRITICAL", "MODERATE": "HIGH", "MINOR": "LOW"}


def map_ddi_severity(raw: str) -> Severity:
    return _DDI_MAP.get(raw.upper(), "LOW")


def map_pregnancy_severity(
    pregnancy_status: str,
    category: str | None,
    lactation_safe: bool | None,
) -> Severity:
    if pregnancy_status == "PREGNANT":
        if category in ("D", "X"):
            return "CRITICAL"
        if category == "C":
            return "HIGH"
        if category in ("A", "B"):
            return "LOW"
        return "MEDIUM"
    if pregnancy_status == "LACTATING":
        if category == "X":
            return "CRITICAL"
        if category == "D":
            return "HIGH" if lactation_safe is False else "MEDIUM"
        if category == "C":
            return "MEDIUM"
        if category in ("A", "B"):
            return "LOW"
        return "MEDIUM"
    return "MEDIUM"


_DOSE_MAP: dict[str, Severity] = {
    "over_max_dose": "CRITICAL",
    "over_max_daily": "CRITICAL",
    "under_min_dose": "HIGH",
    "no_rule": "MEDIUM",
    "weight_unknown": "MEDIUM",
    "dose_unit_missing": "MEDIUM",
    "frequency_unparseable": "LOW",
    "unknown_drug": "LOW",
}


def map_dose_severity(kind: str) -> Severity:
    return _DOSE_MAP[kind]
