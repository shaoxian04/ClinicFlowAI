from __future__ import annotations

from pydantic import BaseModel

from app.tools.spec import ToolSpec


class EmitReasoningInput(BaseModel):
    text: str


class EmitReasoningOutput(BaseModel):
    ok: bool = True


async def _h_emit_reasoning(inp: EmitReasoningInput) -> EmitReasoningOutput:
    return EmitReasoningOutput()


TOOL_EMIT_REASONING = ToolSpec(
    name="emit_reasoning",
    description="Stream reasoning text to frontend as ephemeral thinking log.",
    input_schema=EmitReasoningInput,
    output_schema=EmitReasoningOutput,
    handler=_h_emit_reasoning,
    permission="read",
)
