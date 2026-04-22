from __future__ import annotations

import re

from pydantic import BaseModel, Field

from app.tools.spec import ToolSpec

_ICD10 = re.compile(r"\b[A-TV-Z][0-9]{2}(?:\.[0-9]+)?\b")
_RXNORM_HINT = re.compile(r"\b[A-Za-z][A-Za-z0-9]+(?:\s+\d+mg)?\b")


class DictionaryExtractInput(BaseModel):
    text: str


class DictionaryExtractOutput(BaseModel):
    icd10_codes: list[str] = Field(default_factory=list)
    medication_candidates: list[str] = Field(default_factory=list)


async def _h_clinical_dictionary_extract(inp: DictionaryExtractInput) -> DictionaryExtractOutput:
    icd10 = sorted(set(_ICD10.findall(inp.text)))
    meds = sorted({m.strip() for m in _RXNORM_HINT.findall(inp.text) if "mg" in m.lower()})
    return DictionaryExtractOutput(icd10_codes=icd10, medication_candidates=meds)


TOOL_CLINICAL_DICTIONARY_EXTRACT = ToolSpec(
    name="clinical_dictionary_extract",
    description="Extract ICD-10, RxNorm, SNOMED codes from clinical free text.",
    input_schema=DictionaryExtractInput,
    output_schema=DictionaryExtractOutput,
    handler=_h_clinical_dictionary_extract,
    permission="read",
)
