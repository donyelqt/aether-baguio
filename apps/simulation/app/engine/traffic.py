"""Road occupancy and congestion — ARCHITECTURE §6.2, FR-3.1.

Not implemented (Phase 1). Occupancy is vectorised with NumPy on the tick path;
a pure-Python loop cannot reach the ARCH §4.2 budget at 500 agents.
"""

from __future__ import annotations


class TrafficSystem:
    """Maintains per-segment occupancy and derives congestion."""

    def update(self) -> None:
        raise NotImplementedError("Traffic occupancy lands in Phase 1 (FR-3.1)")
