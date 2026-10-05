"""Vehicle agent — PRD §5.3. Phase 1 (FR-2.1, FR-5.4).

Types: private · taxi · jeepney · bus · motorcycle · delivery · ambulance ·
firetruck · police.
"""

from __future__ import annotations


class Vehicle:
    """A road vehicle with occupancy, capacity, and a route over the graph."""

    def __init__(self) -> None:
        raise NotImplementedError("Vehicle lands in Phase 1 (FR-2.1)")
