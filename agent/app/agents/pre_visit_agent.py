from __future__ import annotations

import json
import logging
import re

from app.agents.base import AgentContext, BaseAgent
from app.prompts.pre_visit import SLOT_EXTRACTION_PROMPT, build_pre_visit_system_prompt
from app.schemas.pre_visit import PreVisitSlots

_log = logging.getLogger(__name__)
_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


class PreVisitIntakeAgent(BaseAgent):
    agent_type = "pre_visit"

    def system_prompt(self, ctx: AgentContext, rules=None) -> str:
        return build_pre_visit_system_prompt(ctx.patient_id, ctx.visit_id)

    def build_user_message(self, ctx: AgentContext, user_input: str) -> str:
        return user_input

    async def extract_slots(self, history: list[dict]) -> PreVisitSlots:
        """Post-hoc structured extraction of slots from the full intake history.

        Uses a dedicated LLM call with a strict JSON-output prompt. Returns an
        empty PreVisitSlots on any parse failure (never raises) so a broken
        extraction cannot break the patient-facing turn response.
        """
        try:
            resp = await self._llm.chat(
                messages=[
                    {"role": "system", "content": SLOT_EXTRACTION_PROMPT},
                    {"role": "user", "content": json.dumps(history)},
                ],
                tools=[],
            )
            text = _FENCE_RE.sub("", resp.text or "").strip()
            data = json.loads(text)
            return PreVisitSlots.model_validate(data)
        except Exception as exc:  # noqa: BLE001 — last-resort graceful fallback
            _log.warning("extract_slots failed, returning empty slots: %s", exc)
            return PreVisitSlots()
