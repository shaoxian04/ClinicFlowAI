from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field

from app.graph.driver import get_driver
from app.tools.spec import ToolSpec

_QUERY = """
MATCH (r:AdaptiveRule)
WHERE r.doctor_id = $doctor_id
  AND r.status = 'APPROVED'
  AND (r.specialty IS NULL OR r.specialty = $specialty)
RETURN r.id AS id, r.rule_text AS rule_text, r.category AS category
ORDER BY r.updated_at DESC
LIMIT $limit
"""


class GetAdaptiveRulesInput(BaseModel):
    doctor_id: UUID
    specialty: str | None = None
    limit: int = Field(default=10, ge=1, le=50)


class AdaptiveRuleItem(BaseModel):
    id: str
    rule_text: str
    category: str | None = None


class GetAdaptiveRulesOutput(BaseModel):
    rules: list[AdaptiveRuleItem] = Field(default_factory=list)


async def _h_get_applicable_adaptive_rules(inp: GetAdaptiveRulesInput) -> GetAdaptiveRulesOutput:
    driver = get_driver()
    async with driver.session() as session:
        result = await session.run(
            _QUERY, doctor_id=str(inp.doctor_id), specialty=inp.specialty, limit=inp.limit,
        )
        rules: list[AdaptiveRuleItem] = []
        async for row in result:
            rules.append(AdaptiveRuleItem(id=row["id"], rule_text=row["rule_text"], category=row["category"]))
    return GetAdaptiveRulesOutput(rules=rules)


TOOL_GET_APPLICABLE_ADAPTIVE_RULES = ToolSpec(
    name="get_applicable_adaptive_rules",
    description="Return approved style rules matching current doctor and specialty.",
    input_schema=GetAdaptiveRulesInput,
    output_schema=GetAdaptiveRulesOutput,
    handler=_h_get_applicable_adaptive_rules,
    permission="read",
)
