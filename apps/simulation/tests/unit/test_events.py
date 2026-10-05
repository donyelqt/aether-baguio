"""Event ordering totality — ARCHITECTURE §8.4.

An ordering key that references a field outside its own schema cannot totally
order events, and ties silently fall back to insertion order — exactly what
NFR-1 forbids. These tests pin the key's shape and its totality properties.
"""

from __future__ import annotations

from app.engine.events import DEFERRED_METRIC, Event, EventLog


def make_event(
    tick: int = 1,
    priority: int = 0,
    source_id: int = 1,
    seq: int = 0,
    event_type: str = "TICK",
    entity_ids: tuple[int, ...] = (),
) -> Event:
    return Event(
        tick=tick,
        priority=priority,
        source_id=source_id,
        seq=seq,
        type=event_type,
        entity_ids=entity_ids,
    )


class TestOrderKey:
    def test_key_is_tick_priority_source_seq(self) -> None:
        event = make_event(tick=9, priority=2, source_id=5, seq=3)
        assert event.order_key == (9, 2, 5, 3)

    def test_type_is_not_in_the_order_key(self) -> None:
        """`type` is data, not ordering. Two events differing only in type must
        still be totally ordered by `(source_id, seq)`."""
        a = make_event(source_id=1, seq=0, event_type="ACCIDENT")
        b = make_event(source_id=1, seq=1, event_type="DISPATCH_UNIT")
        assert a.order_key < b.order_key

    def test_emergency_outranks_routine_at_equal_tick(self) -> None:
        """Lower `priority` resolves first, so emergency sorts ahead of routine."""
        emergency = make_event(priority=0, source_id=1, seq=0, event_type="DISPATCH_UNIT")
        routine = make_event(priority=10, source_id=1, seq=0, event_type="TICK")
        assert emergency.order_key < routine.order_key


class TestResolutionOrder:
    def test_orders_by_tick_first(self) -> None:
        log = EventLog()
        log.append(make_event(tick=5))
        log.append(make_event(tick=1))
        assert [e.tick for e in log.resolve_order()] == [1, 5]

    def test_same_source_same_tick_breaks_on_seq(self) -> None:
        """`seq` is what removes the last trace of insertion-order dependence."""
        log = EventLog()
        log.append(make_event(seq=2))
        log.append(make_event(seq=0))
        log.append(make_event(seq=1))
        assert [e.seq for e in log.resolve_order()] == [0, 1, 2]

    def test_resolution_is_insertion_order_independent(self) -> None:
        forward = EventLog()
        backward = EventLog()
        events = [
            make_event(tick=1, source_id=1, seq=0),
            make_event(tick=1, source_id=2, seq=0),
            make_event(tick=1, source_id=1, seq=1),
            make_event(tick=2, source_id=1, seq=0),
        ]
        for event in events:
            forward.append(event)
        for event in reversed(events):
            backward.append(event)
        assert [e.order_key for e in forward.resolve_order()] == [
            e.order_key for e in backward.resolve_order()
        ]

    def test_player_input_orders_against_engine_events(self) -> None:
        """PRD FR-7.4 — client input is an event with `source_id = session id`,
        so replay reconstructs it in the right order relative to engine events."""
        log = EventLog()
        log.append(make_event(tick=3, source_id=99, seq=0, event_type="PLAYER_INPUT"))
        log.append(make_event(tick=3, source_id=1, seq=0, event_type="TRAFFIC_UPDATE"))
        assert [e.type for e in log.resolve_order()] == ["TRAFFIC_UPDATE", "PLAYER_INPUT"]

    def test_log_length(self) -> None:
        log = EventLog()
        log.append(make_event())
        assert len(log) == 1


class TestDeferralMetric:
    def test_metric_name_is_stable(self) -> None:
        """ARCH §4.2 — dashboards and Criterion 10 alert on this exact name."""
        assert DEFERRED_METRIC == "sim.stage.deferred_total"
