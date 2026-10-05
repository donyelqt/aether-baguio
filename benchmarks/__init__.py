"""Benchmark and evaluation harness — repo root (ARCH §3, TECH_STACK §6).

Lives here, not under `apps/simulation/`, so a scenario run and the engine it
exercises are visibly separate: the runner compares runs against each other and
must not be able to import engine internals by accident.

    python -m benchmarks.scenario S1     # from the repo root
    pytest -m perf                        # nightly tick-budget gates

`scenario/` holds seeded scenarios; `perf/` holds the tick-budget and bandwidth
gates. Both are stubs until the engine lands.
"""