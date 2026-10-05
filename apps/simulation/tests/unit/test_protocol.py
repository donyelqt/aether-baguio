"""Wire record layout and NFR-4 bandwidth arithmetic — ARCHITECTURE §7.

These are the tests that stop a silent ~4.5% bandwidth overrun: the entity
record has two `H` codes after `heading_q` (heading + explicit pad), and
dropping either produces a stream that still decodes plausibly on the client
while quietly exceeding the budget.
"""

from __future__ import annotations

import math
import re
import struct

import pytest

from app.wire import protocol
from app.wire.protocol import (
    ENTITY,
    ENTITY_STRIDE,
    HEADER,
    HEADER_SIZE,
    SCENE,
    SCENE_RECORD_SIZE,
    FrameFlag,
    WireEntity,
    WireScene,
    decode_heading,
    encode_entity,
    encode_frame,
    frame_size,
    quantise_heading,
)


class TestRecordSizes:
    def test_header_is_28_bytes(self) -> None:
        assert HEADER_SIZE == 28
        assert struct.calcsize(HEADER) == 28

    def test_entity_record_is_44_bytes(self) -> None:
        assert ENTITY_STRIDE == 44
        assert struct.calcsize(ENTITY) == 44

    def test_scene_record_is_14_bytes(self) -> None:
        assert SCENE_RECORD_SIZE == 14
        assert struct.calcsize(SCENE) == 14

    def test_entity_format_has_two_h_codes_after_heading(self) -> None:
        """The pad is what keeps the record self-documenting at 44 B.

        Layout is three `i32` positions, then `heading_q` **and** an explicit
        `reserved0` as two consecutive `u16`s. Without the second `H` the
        record is 42 B and every offset from `vx` onward shifts by two —
        silently, and in a way that still decodes without error.
        """
        assert re.match(r"^<IiiiHH", ENTITY), (
            f"expected three i32 positions followed by heading+pad, got {ENTITY}"
        )
        assert ENTITY.count("H") == 6  # heading, pad, state, type, route, occupancy

    def test_sizes_are_derived_not_hand_written(self) -> None:
        assert struct.calcsize(protocol.HEADER) == protocol.HEADER_SIZE
        assert struct.calcsize(protocol.ENTITY) == protocol.ENTITY_STRIDE


class TestFrameSize:
    """The NFR-4 budget is arithmetic over a fixed record size — verify the arithmetic."""

    @pytest.mark.parametrize(
        ("entities", "scenes"),
        [(0, 0), (1, 0), (500, 0), (500, 4)],
    )
    def test_frame_size_matches_layout(self, entities: int, scenes: int) -> None:
        assert frame_size(entities, scenes) == HEADER_SIZE + entities * 44 + scenes * 14

    def test_500_entity_frame_is_about_21_5_kb(self) -> None:
        # ARCH §7.3
        assert frame_size(500) == 28 + 500 * 44
        assert frame_size(500) == 22028

    def test_negative_counts_rejected(self) -> None:
        with pytest.raises(ValueError):
            frame_size(-1)

    def test_encoded_frame_length_equals_predicted_size(
        self, sample_entities: list[WireEntity]
    ) -> None:
        frame = encode_frame(tick=1, sim_time=1 / 15, entities=sample_entities)
        assert len(frame) == frame_size(len(sample_entities))

    def test_encoded_frame_with_scene_length(self, sample_entities: list[WireEntity]) -> None:
        scene = [WireScene(kind=1, status=1, target_id=42, start_tick=0, end_tick=600)]
        frame = encode_frame(tick=1, sim_time=0.0, entities=sample_entities, scene=scene)
        assert len(frame) == frame_size(len(sample_entities), len(scene))

    def test_bandwidth_at_15hz_within_nfr4(self) -> None:
        """NFR-4 (<= 50 KB/s) caps the pass rate at ~15% of the world.

        At 44 B/record and 15 Hz only 76 of 500 entities fit — this is why
        interest culling is mandatory in V1 rather than an optimisation.
        """
        per_client_budget = 50_000
        max_entities = per_client_budget // (ENTITY_STRIDE * 15)
        assert max_entities == 75
        assert frame_size(max_entities) * 15 <= per_client_budget
        assert frame_size(80) * 15 > per_client_budget


class TestFlags:
    def test_keyframe_sets_bit0(self, sample_entities: list[WireEntity]) -> None:
        frame = encode_frame(tick=1, sim_time=0.0, entities=sample_entities, keyframe=True)
        flags = struct.unpack_from("<I", frame, 20)[0]
        assert flags & FrameFlag.KEYFRAME

    def test_delta_sets_bit1(self, sample_entities: list[WireEntity]) -> None:
        frame = encode_frame(tick=1, sim_time=0.0, entities=sample_entities)
        flags = struct.unpack_from("<I", frame, 20)[0]
        assert flags & FrameFlag.DELTA
        assert not flags & FrameFlag.KEYFRAME

    def test_scene_records_set_bit2(self, sample_entities: list[WireEntity]) -> None:
        scene = [WireScene(kind=3, status=1, target_id=9, start_tick=0, end_tick=60)]
        frame = encode_frame(tick=1, sim_time=0.0, entities=sample_entities, scene=scene)
        flags = struct.unpack_from("<I", frame, 20)[0]
        assert flags & FrameFlag.SCENE_EVENTS


class TestHeaderRoundTrip:
    def test_header_fields_round_trip(self) -> None:
        frame = encode_frame(tick=1234, sim_time=82.266, entities=[])
        version, tick, sim_time, count, _flags, _reserved = struct.unpack_from(HEADER, frame, 0)
        assert version == protocol.PROTOCOL_VERSION
        assert tick == 1234
        assert sim_time == pytest.approx(82.266)
        assert count == 0


class TestHeadingQuantisation:
    """ARCH §7.5 — real `u16` resolution is 2pi/65536, and it must wrap."""

    def test_zero_is_zero(self) -> None:
        assert quantise_heading(0.0) == 0
        assert decode_heading(0) == 0.0

    def test_full_turn_wraps_to_zero(self) -> None:
        assert quantise_heading(2 * math.pi) == 0

    def test_negative_angles_wrap_into_range(self) -> None:
        assert quantise_heading(-math.pi / 2) == quantise_heading(3 * math.pi / 2)

    def test_result_always_fits_u16(self) -> None:
        for turns in range(-20, 21):
            value = quantise_heading(turns * math.pi)
            assert 0 <= value <= 0xFFFF

    @pytest.mark.parametrize(
        "theta",
        [0.0, 0.1, math.pi / 2, math.pi, 3 * math.pi / 2, 2 * math.pi - 0.001],
    )
    def test_round_trip_error_below_visible_threshold(self, theta: float) -> None:
        decoded = decode_heading(quantise_heading(theta))
        error = abs(decoded - theta)
        # Resolution is 2pi/65536 ~= 9.587e-5 rad; half that is the worst case.
        assert error <= math.pi / 65536

    def test_resolution_is_2pi_over_65536(self) -> None:
        assert pytest.approx(65536.0 / (2 * math.pi)) == protocol.HEADING_SCALE


class TestEntityEncoding:
    def test_entity_packs_to_exactly_44_bytes(self, sample_entities: list[WireEntity]) -> None:
        for entity in sample_entities:
            assert len(encode_entity(entity)) == ENTITY_STRIDE

    def test_fields_round_trip(self) -> None:
        entity = WireEntity(
            id=99,
            x_q=-123456,
            y_q=654321,
            z_q=7,
            heading_q=40000,
            vx_q=-555,
            vy_q=555,
            vz_q=0,
            state=6,
            type=4,
            route_cursor=3,
            occupancy=17,
            flags=1,
        )
        decoded = struct.unpack(ENTITY, encode_entity(entity))
        assert decoded == (
            99,
            -123456,
            654321,
            7,
            40000,
            0,  # reserved pad
            -555,
            555,
            0,
            6,
            4,
            3,
            17,
            1,
        )

    def test_i32_position_range_covers_the_world(self) -> None:
        """4 km world = 400,000 cm. `i16` would saturate at +-327 m — one block."""
        assert 2**31 > 400_000
        assert 2**15 < 40_000  # i16 is nowhere near enough
