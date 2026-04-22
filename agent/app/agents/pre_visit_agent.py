from __future__ import annotations

from app.agents.base import AgentContext, BaseAgent
from app.prompts.pre_visit import PRE_VISIT_SYSTEM_PROMPT


class PreVisitIntakeAgent(BaseAgent):
    agent_type = "pre_visit"

    def system_prompt(self, ctx: AgentContext, rules=None) -> str:
        return PRE_VISIT_SYSTEM_PROMPT

    def build_user_message(self, ctx: AgentContext, user_input: str) -> str:
        return user_input
