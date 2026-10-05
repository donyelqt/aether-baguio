"""Dirty-set snapshot encoder — ARCHITECTURE §7, §4.2.

Not implemented (Phase 0/1). The wire *record layout* it will emit is already
fixed and tested in `app/wire/protocol.py`, because that layout is the single
highest-risk performance surface in the project: the NFR-4 bandwidth budget is
arithmetic over a fixed record size, so any drift in that size silently eats the
budget while still looking plausible.

Two rules the implementation must preserve:

- Publish is the **only** stage that may be dropped. It carries no simulation
  state; the next keyframe supersedes it. Every other stage defers rather than
  skips (ARCH §4.2).
- Culling here decides what is *sent*, never what is *computed*. Interest
  culling is client-facing and non-authoritative (ARCH §9.2).
"""

from __future__ import annotations


class StatePublisher:
    """Turns a dirty entity set into binary delta frames."""

    def update(self) -> None:
        raise NotImplementedError("Snapshot encoder lands in Phase 0/1 (FR-6.1, FR-6.3)")

    def publish(self) -> None:
        """Emit the current frame. The one droppable stage (ARCH §4.2)."""
        raise NotImplementedError("Snapshot encoder lands in Phase 0/1 (FR-6.1, FR-6.3)")
