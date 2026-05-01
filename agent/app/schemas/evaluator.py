from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Severity = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
Category = Literal["DRUG_ALLERGY", "DDI", "PREGNANCY", "DOSE", "HALLUCINATION", "COMPLETENESS"]


class Finding(BaseModel):
    category: Category
    severity: Severity
    field_path: str | None = None
    message: str
    details: dict = Field(default_factory=dict)


class EvaluationResult(BaseModel):
    visit_id: UUID
    findings: list[Finding] = Field(default_factory=list)
    validators_run: list[Category] = Field(default_factory=list)
    validators_unavailable: list[tuple[Category, str]] = Field(default_factory=list)
