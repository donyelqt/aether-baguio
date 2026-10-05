"""Property tests for the wire format — ARCHITECTURE §6.1, §7.

The specific properties that matter are about **total ordering and finiteness**,
because both fail silently:

- An unguarded `NaN` score makes a tuple ordering non-total, so `max()` falls
  back to whatever it meets first — reintroducing exactly the list-order
  dependence the id tiebreak exists to remove. It presents as a scoring bug.
- An un-wrapped heading silently corrupts the angle somewhere past 2π.

`hypothesis` is an optional dev dependency; the suite skips cleanly when it is
absent so a bare checkout still runs.
"""

from __future__ import annotations

import math

import pytest

pytest.importorskip("hypothesis", reason="property tests need hypothesis")

from hypothesis import given
from hypothesis import strategies as st

from app.engine.digest import state_digest
from app.wire.protocol import decode_heading, encode_entity, quantise_heading

#: The engine's documented world extent is ~4 km, so positions stay in range.
POSITION_CM = st.integers(min_value=-400_000, max_value=400_000)


@given(st.floats(min_value=-1e6, max_value=1e6, allow_nan=False, allow_infinity=False))
def test_heading_always_fits_u16(theta: float) -> None:
    assert 0 <= quantise_heading(theta) <= 0xFFFF


@given(st.floats(min_value=-1e6, max_value=1e6, allow_nan=False, allow_infinity=False))
def test_heading_round_trip_stays_within_half_a_step(theta: float) -> None:
    decoded = decode_heading(quantise_heading(theta))
    assert 0.0 <= decoded < 2 * math.pi
    # Wrapped input, so compare against the wrapped original.
    wrapped = math.fmod(theta, 2 * math.pi) % (2 * math.pi)
    assert min(abs(decoded - wrapped), 2 * math.pi - abs(decoded - wrapped)) <= math.pi / 65536


@given(
    st.lists(
        st.tuples(
            st.integers(min_value=0, max_value=10_000),
            POSITION_CM,
            POSITION_CM,
            POSITION_CM,
            st.integers(min_value=0, max_value=255),
        ),
        max_size=50,
    )
)
def test_digest_ignores_input_order(rows: list[tuple[int, int, int, int, int]]) -> None:
    """The digest must be a function of world state, never of traversal order."""
    assert state_digest(rows) == state_digest(list(reversed(rows)))


@given(
    st.lists(
        st.tuples(
            st.integers(min_value=0, max_value=10_000),
            POSITION_CM,
            POSITION_CM,
            POSITION_CM,
            st.integers(min_value=0, max_value=255),
        ),
        min_size=1,
        max_size=50,
    )
)
def test_digest_is_always_hex_sha256(rows: list[tuple[int, int, int, int, int]]) -> None:
    digest = state_digest(rows)
    assert len(digest) == 64
    assert all(char in "0123456789abcdef" for char in digest)


@given(
    entity_id=st.integers(min_value=0, max_value=2**32 - 1),
    x=POSITION_CM,
    y=POSITION_CM,
    z=POSITION_CM,
    heading=st.integers(min_value=0, max_value=0xFFFF),
    velocity=st.integers(min_value=-100_000, max_value=100_000),
)
def test_entity_always_encodes_to_44_bytes(
    entity_id: int, x: int, y: int, z: int, heading: int, velocity: int
) -> None:
    from app.wire.protocol import WireEntity

    entity = WireEntity(
        id=entity_id,
        x_q=x,
        y_q=y,
        z_q=z,
        heading_q=heading,
        vx_q=velocity,
        vy_q=0,
        vz_q=0,
        state=0,
        type=0,
    )
    assert len(encode_entity(entity)) == 44
