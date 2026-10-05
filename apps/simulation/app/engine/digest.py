"""Deterministic world-state digest — ARCHITECTURE §8.3.

`state_digest` is what makes "two runs, same seed, identical world" a testable
claim rather than an assertion of faith.

**Scope note.** The digest covers *integer* quantities only — ids, quantised
positions, enum states. Integer hashing is reproducible across machines, Python
builds and CPU architectures, so the golden value asserted in
`tests/determinism/` is a stable contract instead of a machine-specific
artefact. Float state is deliberately excluded: NFR-1 item 8 scopes
bit-identical replay to a single engine build on a single architecture, so a
float-exact golden value would over-claim. Float determinism is covered by the
in-process replay comparison instead.

Iteration is explicitly sorted. A digest built by walking a `set` or a
string-keyed `dict` would inherit `PYTHONHASHSEED`-dependent order and pass
in-process while diverging across processes — the failure mode ARCH §8.3 exists
to catch.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable
from typing import Protocol, runtime_checkable

#: One row per entity: `(id, x_q, y_q, z_q, state)`, all integers.
#: Positions are world centimetres (`i32`, ARCH §7.5); `state` is an enum index.
DigestRow = tuple[int, int, int, int, int]


@runtime_checkable
class Digestable(Protocol):
    """Anything carrying the quantised fields a digest row needs.

    A structural Protocol rather than a concrete base class, so agents and wire
    records can both satisfy it without inheriting from the engine. Attribute
    names match the wire record exactly, which is what lets a `WireEntity` be
    digested directly with no adapter.
    """

    @property
    def id(self) -> int: ...

    @property
    def x_q(self) -> int: ...

    @property
    def y_q(self) -> int: ...

    @property
    def z_q(self) -> int: ...

    @property
    def state(self) -> int: ...


def state_digest(rows: Iterable[DigestRow]) -> str:
    """Return a stable hex SHA-256 over the given entity state.

    Rows are sorted before hashing, so the result depends on the *set* of states
    and never on the caller's iteration order. Duplicate rows are preserved:
    two agents in an identical state are two facts about the world, and
    collapsing them would let a duplicate-id bug hide.
    """
    hasher = hashlib.sha256()
    for entity_id, x_q, y_q, z_q, state in sorted(rows):
        hasher.update(f"{entity_id}:{x_q}:{y_q}:{z_q}:{state};".encode())
    return hasher.hexdigest()


def rows_from_entities(entities: Iterable[Digestable]) -> list[DigestRow]:
    """Extract digest rows from wire-shaped entities.

    Kept separate from `state_digest` so the digest itself stays trivially
    auditable and callable from a plain tuple fixture in tests.
    """
    return [(entity.id, entity.x_q, entity.y_q, entity.z_q, entity.state) for entity in entities]
