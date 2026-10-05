"""Stage protocol for the tick pipeline — ARCHITECTURE §4.

The tick loop (§4) is a fixed sequence of stages. Defining the seam once, here,
keeps every stage stub honest and makes the eventual `SimulationEngine.step()`
composition a wiring exercise rather than a redesign.

A stage is a pure function of engine state plus its own deterministic state.
It must not read a wall clock, must not spawn threads, and must not drop work:
a stage that overruns its budget is *deferred* to a later tick and logged
(ARCH §4.2). The single exception is `publish()`, which carries no simulation
state and whose next keyframe supersedes it.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class Stage(Protocol):
    """One unit of per-tick work."""

    def update(self) -> None:
        """Advance this stage by exactly one fixed timestep."""
        ...
