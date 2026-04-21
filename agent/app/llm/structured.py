from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.tools.spec import ToolSpec


def tool_spec_to_openai_schema(spec: ToolSpec) -> dict[str, Any]:
    """Convert a ToolSpec's Pydantic input schema to OpenAI's function-tool JSON schema."""
    schema = spec.input_schema.model_json_schema()
    return {
        "type": "function",
        "function": {
            "name": spec.name,
            "description": spec.description,
            "parameters": schema,
        },
    }


def validate_tool_arguments(spec: ToolSpec, raw: dict[str, Any]) -> BaseModel:
    return spec.input_schema.model_validate(raw)
