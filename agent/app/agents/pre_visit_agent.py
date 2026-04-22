from __future__ import annotations

from app.agents.base import AgentContext, BaseAgent
from app.prompts.pre_visit import build_pre_visit_system_prompt


class PreVisitIntakeAgent(BaseAgent):
    agent_type = "pre_visit"

    def system_prompt(self, ctx: AgentContext, rules=None) -> str:
        return build_pre_visit_system_prompt(ctx.patient_id, ctx.visit_id)

    def build_user_message(self, ctx: AgentContext, user_input: str) -> str:
        return user_input
