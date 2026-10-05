"""Binary snapshot wire format — ARCHITECTURE §7.2, §7.5.

Single source of truth for the encoder's record layout. The TypeScript decoder
(`packages/shared-types/src/wire.ts`) derives its strides from the same
numbers, and `tests/unit/test_protocol.py` asserts both sides agree — a
round-trip test is the only guard against drift.

**Why the layout is asserted rather than trusted.** The entity format has two
`H` codes after `heading_q`: one is the heading, one is explicit padding. Drop
either and the record silently becomes 42 or 46 bytes. A 46-byte record is a
~4.5% bandwidth overrun that still produces a perfectly plausible-looking
stream and would not fail any functional test. Hence `calcsize` asserts here and
in CI.

**Why `i32` positions.** World extent is ~4 km = 400,000 cm. `i16` saturates at
±32,767 cm — a 327 m radius, which overflows on a single city block.

**Why headings are `u16` and wrapped.** The real `u16` angular resolution is
2π/65536 ≈ 9.587e-5 rad. Quantising without wrapping overflows the field
somewhere past 2π and corrupts the angle.
"""

from __future__ import annotations

import math
import struct
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

__all__ = [
    "ENTITY",
    "ENTITY_STRIDE",
    "HEADER",
    "HEADER_SIZE",
    "PROTOCOL_VERSION",
    "SCENE",
    "SCENE_RECORD_SIZE",
    "FrameFlag",
    "WireEntity",
    "WireScene",
    "decode_heading",
    "encode_entity",
    "encode_frame",
    "encode_header",
    "frame_size",
    "quantise_heading",
]

# --- struct formats: the contract -------------------------------------------------

#: version, tick, sim_time, entity_count, flags, reserved
HEADER = "<IIdIII"

#: id, x, y, z, heading_q, pad, vx, vy, vz, state, type, route, occupancy, flags
ENTITY = "<IiiiHHiiiHHHHI"

#: kind, status, target_id, start_tick, end_tick
SCENE = "<BBIII"

# Derived, never hand-written. These must equal the TypeScript constants
# `HEADER_SIZE`, `ENTITY_STRIDE`, `SCENE_RECORD_SIZE`.
HEADER_SIZE = struct.calcsize(HEADER)
ENTITY_STRIDE = struct.calcsize(ENTITY)
SCENE_RECORD_SIZE = struct.calcsize(SCENE)

assert HEADER_SIZE == 28, f"header drifted to {HEADER_SIZE} B, expected 28 (ADR-16)"
assert ENTITY_STRIDE == 44, f"entity record drifted to {ENTITY_STRIDE} B, expected 44 (ADR-16)"
assert SCENE_RECORD_SIZE == 14, f"scene record drifted to {SCENE_RECORD_SIZE} B, expected 14"

#: Bumped on any breaking layout change (ARCH §7.2).
PROTOCOL_VERSION = 1


class FrameFlag:
    """Header flag bits — mirrors `FrameFlag` in `packages/shared-types`."""

    KEYFRAME = 1 << 0
    DELTA = 1 << 1
    SCENE_EVENTS = 1 << 2


#: `u16` heading scale: 2π / 65536.
HEADING_SCALE = 65536.0 / (2.0 * math.pi)


def quantise_heading(theta: float) -> int:
    """Wrap radians to `[0, 2π)` and quantise to `u16` (ARCH §7.5).

    Resolution is 2π/65536 ≈ 9.587e-5 rad — far below visible angular error.
    """
    wrapped = math.fmod(theta, 2.0 * math.pi)
    if wrapped < 0.0:
        wrapped += 2.0 * math.pi
    return round(wrapped * HEADING_SCALE) & 0xFFFF


def decode_heading(quantised: int) -> float:
    """Inverse of `quantise_heading`, in radians within `[0, 2π)`."""
    return (quantised & 0xFFFF) / HEADING_SCALE


@dataclass(frozen=True, slots=True)
class WireEntity:
    """One entity record, already quantised to its on-wire integer form."""

    id: int
    x_q: int
    y_q: int
    z_q: int
    heading_q: int
    vx_q: int
    vy_q: int
    vz_q: int
    state: int
    type: int
    route_cursor: int = 0
    occupancy: int = 0
    flags: int = 0


@dataclass(frozen=True, slots=True)
class WireScene:
    """An active intervention — replayed on reconnect (ARCH §12.2, §16)."""

    kind: int
    #: 0 = inactive/expired, 1 = active.
    status: int
    target_id: int
    start_tick: int
    end_tick: int


def frame_size(entity_count: int, scene_count: int = 0) -> int:
    """Total bytes of a frame. One frame is one message (ARCH §7.2)."""
    if entity_count < 0 or scene_count < 0:
        raise ValueError("counts must be non-negative")
    return HEADER_SIZE + entity_count * ENTITY_STRIDE + scene_count * SCENE_RECORD_SIZE


def encode_header(
    *,
    tick: int,
    sim_time: float,
    entity_count: int,
    flags: int,
    version: int = PROTOCOL_VERSION,
) -> bytes:
    return struct.pack(HEADER, version, tick, sim_time, entity_count, flags, 0)


def encode_entity(entity: WireEntity) -> bytes:
    """Pack one entity. The trailing `0` is the explicit reserved `u16` pad."""
    return struct.pack(
        ENTITY,
        entity.id,
        entity.x_q,
        entity.y_q,
        entity.z_q,
        entity.heading_q,
        0,
        entity.vx_q,
        entity.vy_q,
        entity.vz_q,
        entity.state,
        entity.type,
        entity.route_cursor,
        entity.occupancy,
        entity.flags,
    )


def encode_frame(
    *,
    tick: int,
    sim_time: float,
    entities: Sequence[WireEntity],
    keyframe: bool = False,
    scene: Iterable[WireScene] = (),
) -> bytes:
    """Encode one complete frame.

    Entities are emitted in the order given. The caller is responsible for that
    order being deterministic — the encoder does not sort, because sorting here
    would hide an upstream ordering bug rather than surface it.
    """
    scene_records = list(scene)
    flags = FrameFlag.KEYFRAME if keyframe else FrameFlag.DELTA
    if scene_records:
        flags |= FrameFlag.SCENE_EVENTS
    parts = [
        encode_header(
            tick=tick,
            sim_time=sim_time,
            entity_count=len(entities),
            flags=flags,
        )
    ]
    parts.extend(encode_entity(entity) for entity in entities)
    parts.extend(
        struct.pack(SCENE, rec.kind, rec.status, rec.target_id, rec.start_tick, rec.end_tick)
        for rec in scene_records
    )
    return b"".join(parts)
