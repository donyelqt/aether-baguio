"""Decision architecture — FSM, behaviour tree, utility scoring (ARCH §6).

Not implemented (Phase 1, FR-2.2/FR-2.5). The module docstring in
`docs/TECH_STACK.md` §8 carries the canonical `UtilityScorer` shape; it is
deliberately not transcribed here, because a scoring function written before
the agent model it scores would encode guesses about `Action` and `WorldView`
that Phase 1 will invalidate.

What matters architecturally and is fixed by this module's existence:
`app.agents.decision` reads the world through `app.engine.world.WorldView` only.
"""

from __future__ import annotations

__all__: list[str] = []
