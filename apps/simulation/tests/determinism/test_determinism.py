"""Determinism gate — ARCHITECTURE §8.3, PRD NFR-1 / Criterion 11.

**This suite is the reason the engine can be trusted.** Two runs, same seed,
identical digest — if that fails, something non-deterministic entered the
engine and every downstream claim (replay, Core-vs-AI evaluation, bug
reproduction) becomes suspect.

**CI must run this file three times** under `PYTHONHASHSEED=0`, `12345`, and
`999`, and all three must pass. Two runs inside one interpreter share a single
`PYTHONHASHSEED`, so a `set`/`dict` iteration-order dependency affects both
identically — the comparison passes while the bug is live. Only a *separate
process with a different seed* can catch it.

The golden value below is integers-only (ids, quantised positions, enum states),
which is what makes it stable across machines and Python builds. Float
determinism is scoped to a single build on a single architecture (NFR-1 item 8)
and is covered by `test_digest_is_stable_across_repeated_calls`.

**If this test fails after a refactor, do not regenerate the golden value.** That
is the entire failure mode it exists to detect. Find the ordering dependency.
"""

from __future__ import annotations

import pytest

from app.engine.digest import DigestRow, rows_from_entities, state_digest
from app.engine.scheduler import stagger_bucket
from app.wire.protocol import WireEntity

#: sha256 of the sorted fixture rows. See module docstring before changing.
GOLDEN_DIGEST = "0984c53e9b25c779a5a8966cd738e4def0548fe807de3f571de4c1b1dba37c8b"

#: sha256 of the empty string — what an empty world digests to.
EMPTY_DIGEST = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


class TestGoldenDigest:
    def test_fixture_matches_golden(self, sample_rows: list[DigestRow]) -> None:
        assert state_digest(sample_rows) == GOLDEN_DIGEST

    def test_empty_world(self) -> None:
        assert state_digest([]) == EMPTY_DIGEST

    def test_digest_is_order_independent(self, sample_rows: list[DigestRow]) -> None:
        """Sorted iteration is what makes the digest a function of world state
        rather than of the caller's traversal order."""
        assert state_digest(sample_rows) == state_digest(list(reversed(sample_rows)))

    def test_digest_is_stable_across_repeated_calls(self, sample_rows: list[DigestRow]) -> None:
        assert state_digest(sample_rows) == state_digest(sample_rows)


class TestHashOrderCanary:
    """The digest must be immune to `PYTHONHASHSEED`-dependent iteration.

    Building the fixture through a `set` and a string-keyed `dict` is the point:
    if `state_digest` iterated its input instead of sorting it, these fixtures
    would hash differently per process and CI's three-seed run would fail.
    """

    def test_digest_survives_set_iteration(self) -> None:
        rows: set[DigestRow] = {(7, 100, 200, 0, 2), (3, -50, 25, 10, 0), (5, 0, 0, 0, 1)}
        assert state_digest(rows) == GOLDEN_DIGEST

    def test_digest_survives_dict_iteration(self) -> None:
        by_id: dict[str, DigestRow] = {
            "seven": (7, 100, 200, 0, 2),
            "three": (3, -50, 25, 10, 0),
            "five": (5, 0, 0, 0, 1),
        }
        assert state_digest(by_id.values()) == GOLDEN_DIGEST

    def test_rows_from_entities_agrees_with_fixture(
        self, sample_entities: list[WireEntity], sample_rows: list[DigestRow]
    ) -> None:
        assert state_digest(rows_from_entities(sample_entities)) == state_digest(sample_rows)


class TestDigestSensitivity:
    """A digest that ignores a field is worse than no digest at all."""

    def test_position_change_alters_digest(self, sample_rows: list[DigestRow]) -> None:
        mutated = [(3, -50, 25, 10, 0), (5, 0, 0, 0, 1), (7, 100, 200, 0, 99)]
        assert state_digest(mutated) != GOLDEN_DIGEST

    def test_duplicate_rows_are_not_collapsed(self) -> None:
        one: list[DigestRow] = [(1, 0, 0, 0, 0)]
        two: list[DigestRow] = [(1, 0, 0, 0, 0), (1, 0, 0, 0, 0)]
        assert state_digest(one) != state_digest(two)


class TestStaggerBucketing:
    """ARCH §8.2 — the stagger predicate must be seed-independent.

    If this used the builtin `hash()`, the per-tick distribution — and therefore
    the scheduler's cost — would vary between processes.
    """

    def test_bucket_is_in_range(self) -> None:
        for agent_id in range(1000):
            assert 0 <= stagger_bucket(agent_id, 4) < 4

    def test_bucket_is_a_pure_function_of_id(self) -> None:
        assert all(stagger_bucket(agent_id) == stagger_bucket(agent_id) for agent_id in range(500))

    def test_distribution_is_even(self) -> None:
        counts = [0, 0, 0, 0]
        for agent_id in range(4000):
            counts[stagger_bucket(agent_id, 4)] += 1
        assert counts == [1000, 1000, 1000, 1000]

    def test_rejects_non_positive_bucket_count(self) -> None:
        with pytest.raises(ValueError):
            stagger_bucket(1, 0)
