"""Typed strategic action and strategic state — ARCHITECTURE §10.2, §10.5.

This is the R2 boundary in concrete form: **an LLM never writes world state.**
It emits one of these typed proposals, which must then survive schema
validation (here), policy validation (`policy.py`, Phase 5), and the engine's
own final veto before anything changes.

**Why `extra="forbid"` is load-bearing.** Without it, Pydantic silently drops
unrecognised fields. A model that hallucinated an extra `severity` field would
appear to succeed while executing against a target it interpreted differently —
a schema veto that does not veto.

**Why the literal is closed.** An open-ended action vocabulary means the policy
layer cannot enumerate what it must constrain. The engine cannot apply an action
it does not have code for, so the list is the contract.
"""

from __future__ import annotations

from typing import Literal, TypedDict

from pydantic import BaseModel, ConfigDict, Field

__all__ = ["StrategicAction", "StrategicActionKind", "StrategicState"]

StrategicActionKind = Literal[
    "CHANGE_SIGNAL_TIMING",
    "PRIORITIZE_ROUTE",
    "CLOSE_LANE",
    "DISPATCH_UNIT",
    "REROUTE_AMBULANCE",
    "PRIORITIZE_EMERGENCY_ROUTE",
    "INCREASE_SERVICE",
    "REROUTE_BUS",
    "PRIORITIZE_TRANSIT",
    "NO_ACTION",
]


class StrategicAction(BaseModel):
    """A validated, bounded proposal. Never applied directly to world state."""

    model_config = ConfigDict(extra="forbid")

    action: StrategicActionKind
    target: str
    #: Bounded effect — a proposal that outlives its window is a policy failure.
    duration_seconds: int = Field(ge=5, le=600)
    rationale: str = Field(max_length=280)


class StrategicState(TypedDict, total=False):
    """Coarse aggregates handed to a strategist.

    Contains region-level summaries only, never raw per-agent state
    (ARCH §10.1): a traffic strategist needs corridor congestion, not every
    jeepney's position.

    The LangGraph reducers (ARCH §10.5) attach when `graph.py` lands in Phase 5.
    Defining the shape here keeps the AI layer importable — and deletable —
    without pulling in `langgraph`.
    """

    tick: int
    summary: str
    actions: list[StrategicAction]
    rejected: list[str]
