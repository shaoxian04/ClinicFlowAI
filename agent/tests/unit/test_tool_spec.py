import pytest
from pydantic import BaseModel

from app.tools.spec import (
    ToolSpec,
    ToolRegistry,
    ToolNotPermittedError,
    ToolNotFoundError,
)


class InIn(BaseModel):
    q: str


class OutOut(BaseModel):
    a: str


async def _handler(inp: InIn) -> OutOut:
    return OutOut(a=f"echo:{inp.q}")


def _spec(name: str, perm: str = "read") -> ToolSpec:
    return ToolSpec(
        name=name,
        description="Echo the input for testing.",
        input_schema=InIn,
        output_schema=OutOut,
        handler=_handler,
        permission=perm,
    )


def test_registry_get_returns_spec():
    reg = ToolRegistry([_spec("echo")])
    assert reg.get("echo").name == "echo"


def test_registry_get_unknown_raises():
    reg = ToolRegistry([_spec("echo")])
    with pytest.raises(ToolNotFoundError):
        reg.get("missing")


def test_for_agent_filters_by_allowlist():
    reg = ToolRegistry([_spec("a"), _spec("b"), _spec("c")])
    reg.register_allowlist("pre_visit", ["a", "c"])
    names = [t.name for t in reg.for_agent("pre_visit")]
    assert names == ["a", "c"]


def test_for_agent_unknown_agent_raises():
    reg = ToolRegistry([_spec("a")])
    with pytest.raises(ToolNotPermittedError):
        reg.for_agent("nobody")


def test_description_length_limit_enforced():
    with pytest.raises(ValueError, match="<=15 words"):
        ToolSpec(
            name="bad",
            description=" ".join(["word"] * 16),
            input_schema=InIn,
            output_schema=OutOut,
            handler=_handler,
        )
