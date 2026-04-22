from __future__ import annotations

from app.agents.base import AgentContext, BaseAgent
from app.prompts.report import build_report_system_prompt


class ReportAgent(BaseAgent):
    agent_type = "report"

    def __init__(self, *args, rules_json: str | None = None, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._rules_json = rules_json

    def system_prompt(self, ctx: AgentContext, rules=None) -> str:
        return build_report_system_prompt(self._rules_json)

    def build_user_message(self, ctx: AgentContext, user_input: str) -> str:
        return f"Visit {ctx.visit_id} — transcript / edit input:\n\n{user_input}"
