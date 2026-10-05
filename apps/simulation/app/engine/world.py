"""World model and the read-only view agents decide against — ARCHITECTURE §4.

`WorldView` is the interface every agent's scoring code reads. It exists so
decision logic never touches mutable engine state directly: agents perceive
through a narrow, read-only projection, which is what makes per-agent utility
weights the sole source of behavioural diversity (ARCH §6.1).

Geometry is **not** implemented. The world build artifact (`data/world/`,
FR-1.4) and the GIS-derived geometry that feeds it are Phase 0/2 work; road
and landmark data currently lives only on the client. This module defines the
contract those will fill.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class WorldView(Protocol):
    """Read-only projection of the world that agent scoring may consult."""

    def travel_time(self, from_ref: int, to_ref: int) -> float:
        """Estimated travel time in seconds between two places.

        Returns a non-finite value when `to_ref` is unreachable; callers are
        responsible for mapping that to a sortable position (ARCH §6.1).
        """
        ...

    def weather_score(self) -> float:
        """Current weather's effect on travel comfort, in [0, 1]."""
        ...

    def time_of_day(self) -> float:
        """Simulated time of day in hours, [0, 24)."""
        ...


class World:
    """Static world: terrain, roads, buildings, zones (FR-1.1).

    Not yet constructible — geometry lands with the world build artifact.
    """

    def __init__(self) -> None:
        raise NotImplementedError("World geometry lands with the Phase 0 build artifact (FR-1.4)")
