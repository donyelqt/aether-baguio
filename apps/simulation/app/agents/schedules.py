"""Agent schedules — PRD §5.1. Phase 1.

A schedule drives FSM lifecycle transitions (HOME → COMMUTE → WORK → COMMUTE →
HOME). It must be a pure function of simulated time so that replay reproduces
it exactly; wall-clock time is not an input.
"""

from __future__ import annotations

__all__: list[str] = []
