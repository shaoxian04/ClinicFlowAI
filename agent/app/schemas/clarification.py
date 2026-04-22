from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class RequiredField(str, Enum):
    CHIEF_COMPLAINT = "subjective.chief_complaint"
    HISTORY_OF_PRESENT_ILLNESS = "subjective.history_of_present_illness"
    PRIMARY_DIAGNOSIS = "assessment.primary_diagnosis"
    MEDICATION_DETAILS = "plan.medications"
    FOLLOW_UP_DECISION = "plan.follow_up.needed"


class AskDoctorClarificationInput(BaseModel):
    field: RequiredField
    prompt: str = Field(max_length=200)
    context: str = Field(max_length=500)


class AskDoctorClarificationOutput(BaseModel):
    status: str = "waiting_for_doctor"
