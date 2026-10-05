"""AETHER AI layer — the ADR-9 seam (ARCHITECTURE §1 R1, §10.4).

This directory is the **only** place `langgraph` may ever be imported. The
engine and wire layers must not import it, and a lint/test guard enforces that
(`tests/guards/`). Deleting this whole directory must leave a fully functional
simulation at `0 LLM calls` — that is rule R1, and it is what makes "AI is
optional" an architectural property rather than a promise.

Only the seam exists at scaffold stage: the controller protocol and the
rule-based default that calls nothing. `llm.py`, `policy.py`, `summarizer.py`,
`state.py` and `graph.py` arrive in Phase 5, and `langgraph` is deliberately
**not** installed — importing it now would both add dependency weight and make
the R1 seam unverifiable.
"""

from app.ai.controller import StrategicController
from app.ai.rule_based import RuleBasedController

__all__ = ["RuleBasedController", "StrategicController"]
