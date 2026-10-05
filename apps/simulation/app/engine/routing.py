"""Incremental routing over the road graph — ARCHITECTURE §6.2.

Not implemented (Phase 1, FR-2.3). The intended shape is fixed here so the
scaffold cannot drift into the wrong architecture: `scipy.sparse.csgraph` on
the tick path with incremental re-solve on dirty edges, and NetworkX strictly
offline for graph validation and scenario authoring. NetworkX's per-call
overhead is wrong for 500 agents at 15 Hz.
"""

from __future__ import annotations


class RoutingSystem:
    """Computes and refreshes agent routes as edge costs change."""

    def update(self) -> None:
        raise NotImplementedError("Incremental routing lands in Phase 1 (FR-2.3)")
