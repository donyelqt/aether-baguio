"""Citizen agent — PRD §5.1. Phase 1 (FR-2.1).

States: HOME · COMMUTING · WORKING · SHOPPING · EATING · RESTING · WALKING ·
WAITING · EVACUATING.
"""

from __future__ import annotations


class Citizen:
    """A resident with a home, workplace, schedule, and per-agent preferences."""

    def __init__(self) -> None:
        raise NotImplementedError("Citizen lands in Phase 1 (FR-2.1)")
