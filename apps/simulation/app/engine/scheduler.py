"""Decision-scheduling seam — ARCHITECTURE §5.

Scheduling agents does not exist yet (Phase 1, FR-2.2). What *is* here is
`stagger_bucket`, because NFR-1 depends on it: the stagger predicate that
distributes agents across ticks must be a pure function of the integer id, and
must never touch Python's builtin `hash()`.

`hash()` is `PYTHONHASHSEED`-dependent for strings, so a hash-derived bucket
makes the per-tick distribution — and therefore the scheduler's cost — vary
between processes. Two runs in one interpreter would agree and still diverge
across processes, which is invisible to any in-process test.
"""

from __future__ import annotations

#: Knuth multiplicative hash constant. Integer-only, seed-independent.
_KNUTH_MULTIPLIER = 2654435761


def stagger_bucket(agent_id: int, buckets: int = 4) -> int:
    """Map an integer agent id to a scheduling bucket.

    Deterministic and seed-independent: the same id yields the same bucket on
    every process and every machine. This is the `id_hash` referred to in
    ARCH §5 — it means *this function*, never the builtin `hash()`.
    """
    if buckets <= 0:
        raise ValueError(f"buckets must be positive, got {buckets}")
    return (agent_id * _KNUTH_MULTIPLIER) % buckets
