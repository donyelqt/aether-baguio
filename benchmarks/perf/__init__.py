"""Tick-budget and bandwidth gates — ARCHITECTURE §4.2, §7.3, PRD NFR-2/NFR-4.

Marked `perf` and run nightly, not per commit: a timing assertion on shared CI
runners fails for reasons that have nothing to do with the code.

The two numbers this will enforce are *different measurements*, and conflating
them is a common error:

| Number | What it is | Gate |
|---|---|---|
| **≤ 20 ms** | **mean** tick CPU at 500 agents | PRD NFR-2 — the per-commit perf target |
| **≤ 66 ms** | **worst-case** tick, the 66.6 ms period ceiling | ARCH §4.2 — the deferral threshold |

A tick averaging 20 ms with a 66 ms worst case is normal and expected. The
deferral rule exists because spikes happen; it is not evidence that the mean
target was missed.

Bandwidth (NFR-4, ≤ 50 KB/s) is pure arithmetic over a fixed 44 B record at
15 Hz, so it is asserted as a *test* in
`apps/simulation/tests/unit/test_protocol.py` rather than benchmarked. Only
75 of 500 entities fit in the budget — which is why interest culling is
mandatory in V1 and not an optimisation.

Nothing here is implemented; the gate definitions land with the engine.
"""