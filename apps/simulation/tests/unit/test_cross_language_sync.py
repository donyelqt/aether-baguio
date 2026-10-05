"""Cross-language wire sync — ARCHITECTURE §7.2, §7.3.

`packages/shared-types/src/wire.ts` and `app/wire/protocol.py` define the same
record layout twice, in two languages, with no shared compiler. Nothing stops
them drifting except this test.

**Why it matters concretely.** The entity format has two `H` codes after
`heading_q` — one is the heading, one is explicit padding. Drop the pad in one
language and that language emits 42-byte records: ~4.5% over the NFR-4 budget,
producing a stream that still decodes without error and still looks plausible.
No functional test catches it. This one does.

The TypeScript constants are read as text rather than executed, so the check runs
without a Node toolchain and without a build.
"""

from __future__ import annotations

import os
import re

import pytest

from app.wire import protocol

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
TS_WIRE = os.path.join(REPO_ROOT, "packages", "shared-types", "src", "wire.ts")

pytestmark = pytest.mark.skipif(
    not os.path.exists(TS_WIRE),
    reason="packages/shared-types/src/wire.ts not found",
)


def read_ts_constant(name: str) -> int:
    """Extract `export const <name> = <integer>;` from the TS source."""
    with open(TS_WIRE, encoding="utf-8") as handle:
        text = handle.read()
    match = re.search(rf"export const {name} = (\d+);", text)
    assert match is not None, f"{name} not found in {TS_WIRE}"
    return int(match.group(1))


class TestTypeScriptMirrorsPython:
    def test_header_size_matches(self) -> None:
        assert read_ts_constant("HEADER_SIZE") == protocol.HEADER_SIZE

    def test_entity_stride_matches(self) -> None:
        assert read_ts_constant("ENTITY_STRIDE") == protocol.ENTITY_STRIDE

    def test_scene_record_size_matches(self) -> None:
        assert read_ts_constant("SCENE_RECORD_SIZE") == protocol.SCENE_RECORD_SIZE

    def test_tick_rate_matches(self) -> None:
        """Client timing must not be able to drift from the engine."""
        assert read_ts_constant("TICK_HZ") == 15


class TestTypeScriptDerivesStridesFromConstants:
    """ARCH §7.2 — the decoder must advance by the imported stride, not a literal.

    An inlined `off += 44` compiles fine, survives review, and keeps reading the
    old offset after the record changes.

    Note the deliberate asymmetry: *field* offsets within the fixed-width record
    (`off + 28` for `vz`) are legitimately numeric literals — the layout is
    fixed-width and documented in ARCH §7.2. It is the **stride** that must come
    from the shared constant.
    """

    @pytest.fixture(scope="class")
    def decode_source(self) -> str:
        with open(
            os.path.join(REPO_ROOT, "packages", "shared-types", "src", "decode.ts"),
            encoding="utf-8",
        ) as handle:
            return handle.read()

    def test_advances_by_the_imported_entity_stride(self, decode_source: str) -> None:
        assert "off += ENTITY_STRIDE" in decode_source

    def test_advances_by_the_imported_scene_stride(self, decode_source: str) -> None:
        assert "off += SCENE_RECORD_SIZE" in decode_source

    def test_starts_at_the_imported_header_size(self, decode_source: str) -> None:
        assert "let off = HEADER_SIZE" in decode_source

    def test_no_literal_stride_arithmetic(self, decode_source: str) -> None:
        literals = re.findall(r"off \+= (\d+)", decode_source)
        assert literals == [], (
            f"decode.ts advances by literal strides {literals}; import "
            f"ENTITY_STRIDE / SCENE_RECORD_SIZE instead (ADR-16)"
        )
