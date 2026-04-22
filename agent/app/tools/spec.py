from __future__ import annotations

from dataclasses import dataclass, field
from typing import Awaitable, Callable, Literal

from pydantic import BaseModel

Permission = Literal["read", "write"]


class ToolNotFoundError(KeyError):
    pass


class ToolNotPermittedError(PermissionError):
    pass


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    input_schema: type[BaseModel]
    output_schema: type[BaseModel]
    handler: Callable[[BaseModel], Awaitable[BaseModel]]
    permission: Permission = "read"

    def __post_init__(self) -> None:
        word_count = len(self.description.split())
        if word_count > 15:
            raise ValueError(
                f"ToolSpec.description must be <=15 words (got {word_count}): {self.name}"
            )


@dataclass
class ToolRegistry:
    tools: list[ToolSpec]
    _allowlists: dict[str, list[str]] = field(default_factory=dict)
    _by_name: dict[str, ToolSpec] = field(init=False)

    def __post_init__(self) -> None:
        self._by_name = {t.name: t for t in self.tools}

    def get(self, name: str) -> ToolSpec:
        try:
            return self._by_name[name]
        except KeyError as exc:
            raise ToolNotFoundError(name) from exc

    def register_allowlist(self, agent_name: str, tool_names: list[str]) -> None:
        unknown = [n for n in tool_names if n not in self._by_name]
        if unknown:
            raise ToolNotFoundError(f"unknown tools for {agent_name}: {unknown}")
        self._allowlists[agent_name] = list(tool_names)

    def for_agent(self, agent_name: str) -> list[ToolSpec]:
        if agent_name not in self._allowlists:
            raise ToolNotPermittedError(f"no allowlist registered for agent {agent_name!r}")
        allowed = self._allowlists[agent_name]
        return [self._by_name[n] for n in allowed]
