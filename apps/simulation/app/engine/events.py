"""Append-only event log and total event ordering — ARCHITECTURE §8.4.

Two rules are load-bearing here and both are easy to get wrong:

1. **Ordering is total.** `order_key` is `(tick, priority, source_id, seq)`.
   Every component is in the key precisely because omitting one reintroduces
   insertion-order dependence — the thing NFR-1 forbids. `type` and `payload`
   are deliberately *not* in the key: they are data, not ordering.
2. **Player input and god-mode injections are events too** (PRD FR-7.4), with
   `source_id = client_session_id`. If they were not logged, a seeded replay of
   an interactive session would silently diverge from the original run.

The log is append-only and never rewritten. Replay reads it; it never
re-derives inputs.
"""

from __future__ import annotations

from dataclasses import dataclass, field

#: Metric emitted when a stage overruns its tick budget and defers work
#: (ARCH §4.2). A deferral is a *later* execution of the same work, never a
#: cancellation — with the single exception of `publish()`, which carries no
#: simulation state.
DEFERRED_METRIC = "sim.stage.deferred_total"


@dataclass(frozen=True, slots=True)
class Event:
    """One immutable entry in the world event log."""

    tick: int
    #: Explicit priority. **Lower resolves first**, so emergency work is given a
    #: lower value than routine work. Never inferred from `type`.
    priority: int
    #: Unique emitter id: an agent, a system, or a client session id.
    source_id: int
    #: Per-`(tick, source_id)` monotonic counter. This is what removes the
    #: last trace of insertion-order dependence (ARCH §8.4).
    seq: int
    type: str
    payload: bytes = b""
    entity_ids: tuple[int, ...] = ()

    @property
    def order_key(self) -> tuple[int, int, int, int]:
        """Total order across the whole log."""
        return (self.tick, self.priority, self.source_id, self.seq)


@dataclass(slots=True)
class EventLog:
    """Append-only log. Entries are never mutated or removed."""

    events: list[Event] = field(default_factory=list)

    def append(self, event: Event) -> None:
        self.events.append(event)

    def resolve_order(self) -> list[Event]:
        """Return events in resolution order.

        A stable sort on a total key. Two events cannot tie, because
        `(source_id, seq)` is unique within a tick by construction — if that
        invariant is broken the ordering degrades to insertion order, which is
        why ids are required to be unique (ARCH §8).
        """
        return sorted(self.events, key=lambda e: e.order_key)

    def __len__(self) -> int:
        return len(self.events)
