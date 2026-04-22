from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class SlotStatus(str, Enum):
    UNKNOWN = "unknown"
    PRE_POPULATED = "pre_populated"
    CONFIRMED = "confirmed"
    CORRECTED = "corrected"


class PreVisitSlots(BaseModel):
    chief_complaint: str | None = None
    symptom_duration: str | None = None
    pain_severity: int | None = Field(default=None, ge=0, le=10)
    known_allergies: list[str] = Field(default_factory=list)
    current_medications: list[str] = Field(default_factory=list)
    relevant_history: list[str] = Field(default_factory=list)


REQUIRED_SLOTS: tuple[str, ...] = ("chief_complaint", "symptom_duration")

PRE_POPULATABLE_SLOTS: tuple[str, ...] = (
    "known_allergies",
    "current_medications",
    "relevant_history",
)


class SlotState(BaseModel):
    name: str
    value: list[str] | str | int | None = None
    status: SlotStatus = SlotStatus.UNKNOWN


class PreVisitReport(BaseModel):
    patient_id: str
    slots: PreVisitSlots
    slot_states: list[SlotState]
    completed: bool
