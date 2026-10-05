"""`StrategicController` protocol — the ADR-9 seam (ARCHITECTURE §10.4).

The engine depends on this protocol and nothing else about the AI layer. Two
implementations satisfy it — `RuleBasedController` (default, zero LLM calls)
and `LLMController` (optional overlay) — and swapping between them, including
mid-session, is safe precisely because the swap replaces an object behind the
protocol rather than mutating a live one. An in-flight request is dropped at the
next `propose` boundary; it can never strand.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:  # pragma: no cover - typing only, keeps runtime imports at zero
    from app.ai.actions import StrategicAction, StrategicState

__all__ = ["StrategicController"]


@runtime_checkable
class StrategicController(Protocol):
    """Proposes typed strategic actions from a coarse world summary."""

    async def propose(self, state: StrategicState) -> list[StrategicAction]:
        """Return proposed actions.

        Returning an empty list is a valid outcome: policy may reject every
        proposal, and the engine then simply applies no intervention that
        interval. It must **not** fall back in that case — falling back would
        convert a policy rejection into a rule-based action the model never
        asked for (ARCH §10.4). Only transport and schema failures fall back.
        """
        ...
