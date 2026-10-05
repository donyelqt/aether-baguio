"""Tourist agent — PRD §5.2. Phase 1 (FR-2.6).

Tourism is a simulation *variable*, not a spawn script: a surge must raise
Burnham demand → Session Road demand → pedestrian density → traffic purely
emergently (Criterion 3). Nothing in this module may hard-code that chain.
"""

from __future__ import annotations


class Tourist:
    """A visitor holding a budget, interests, group size, and an itinerary."""

    def __init__(self) -> None:
        raise NotImplementedError("Tourist lands in Phase 1 (FR-2.6)")
