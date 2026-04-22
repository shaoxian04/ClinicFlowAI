from __future__ import annotations

import json
from uuid import UUID

from app.agents.base import AgentContext, BaseAgent
from app.prompts.report import build_report_system_prompt
from app.tools.hermes_tools import GetAdaptiveRulesInput, _h_get_applicable_adaptive_rules


class ReportAgent(BaseAgent):
    agent_type = "report"

    def __init__(self, *args, rules_json: str | None = None, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._rules_json = rules_json

    def system_prompt(self, ctx: AgentContext, rules=None) -> str:
        return build_report_system_prompt(self._rules_json)

    def build_user_message(self, ctx: AgentContext, user_input: str) -> str:
        return f"Visit {ctx.visit_id} — transcript / edit input:\n\n{user_input}"

    @classmethod
    async def build_with_rules(cls, doctor_id: UUID | None, specialty: str | None, **kwargs) -> "ReportAgent":
        rules_json: str | None = None
        if doctor_id is not None:
            try:
                rules = await _h_get_applicable_adaptive_rules(
                    GetAdaptiveRulesInput(doctor_id=doctor_id, specialty=specialty)
                )
                if rules.rules:
                    rules_json = json.dumps([r.model_dump() for r in rules.rules], ensure_ascii=False)
            except Exception:
                rules_json = None
        return cls(*kwargs.pop("args", ()), rules_json=rules_json, **kwargs)
