"""Rule-based strategist — the default and the fallback (ARCHITECTURE §10.4).

The fallback is not an error path; **it is the default state**. It is
constructed unconditionally, before any provider is touched, so there is no code
path in which an LLM-backed controller exists without a fallback behind it.

Making this real is Phase 5 work. It exists at scaffold stage because R1
("the engine never depends on the AI layer") is only verifiable if there is a
non-LLM implementation of the seam to verify against.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - typing only
    from app.ai.actions import StrategicAction, StrategicState

__all__ = ["RuleBasedController"]


class RuleBasedController:
    """Deterministic strategist. Zero LLM calls, always available."""

    async def propose(self, state: StrategicState) -> list[StrategicAction]:
        """Return rule-derived proposals.

        Deliberately unimplemented at scaffold stage. An empty return would be
        *wrong* rather than conservative: it would make "no LLM configured" and
        "rule-based controller finished thinking" indistinguishable in the
        metrics, which is exactly the signal Criterion 13 and Criterion 14
        depend on.
        """
        raise NotImplementedError("Rule-based strategist lands in Phase 5 (FR-8.5)")
