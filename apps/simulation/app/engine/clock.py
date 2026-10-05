"""Fixed-timestep clock — ARCHITECTURE §4.1, NFR-1.

Speed is expressed as *how many ticks are executed*, never as a scaled `dt`.
A variable delta would make world state a function of wall-clock jitter, which
is exactly what the determinism contract forbids: the same seed would diverge
between a loaded CI runner and an idle laptop.

Nothing in this module may read a wall clock. `DT` is a constant.
"""

from __future__ import annotations

from dataclasses import dataclass

#: Simulation tick rate (NFR-2).
TICK_HZ: int = 15

#: Fixed timestep in seconds. Constant, never wall-clock derived (NFR-1.1).
DT: float = 1.0 / TICK_HZ


@dataclass(slots=True)
class Clock:
    """Monotonic tick counter and simulated time.

    Advance order is load-bearing: `tick` and `sim_time` must move together or
    the published header (`tick`, `sim_time`) becomes self-inconsistent.
    """

    tick: int = 0
    sim_time: float = 0.0

    def advance(self) -> None:
        """Advance exactly one fixed timestep."""
        self.tick += 1
        self.sim_time += DT
