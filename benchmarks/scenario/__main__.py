"""Scenario harness — ARCHITECTURE §3, PRD §11.

Run from the **repo root**, not from `apps/simulation/`:

    python -m benchmarks.scenario S1

That path is deliberate and easy to get wrong: `benchmarks/` lives at the repo
root, so `apps/simulation` cannot import it as a local module (TECH_STACK §6).

The harness (seeded scenario runner + metric capture) ships in **Phase 0** even
though the evaluation *programme* runs in Phase 5. It is infrastructure, and it
has to exist early so Core and AI runs are comparable against an identical
world (PRD assumption 6). The Core-vs-AI experiment itself cannot run before
Phase 5, because there is no AI layer to compare against yet.

Scaffold status: `S1` is declared but not implemented — it needs the engine.
"""

from __future__ import annotations

import sys

#: Declared scenarios. S1 is the PRD §11 evaluation scenario.
SCENARIOS: dict[str, str] = {
    "S1": "+30% tourism, heavy rain, road accident on a Session Road segment",
}

EXIT_NOT_IMPLEMENTED = 2


def describe(name: str) -> str:
    return f"{name}: {SCENARIOS[name]}"


def main(argv: list[str]) -> int:
    if not argv:
        print("usage: python -m benchmarks.scenario <scenario>", file=sys.stderr)
        print("known scenarios:", ", ".join(sorted(SCENARIOS)), file=sys.stderr)
        return EXIT_NOT_IMPLEMENTED

    unknown = [name for name in argv if name not in SCENARIOS]
    if unknown:
        print(f"unknown scenario(s): {', '.join(unknown)}", file=sys.stderr)
        print("known scenarios:", ", ".join(sorted(SCENARIOS)), file=sys.stderr)
        return EXIT_NOT_IMPLEMENTED

    for name in argv:
        print(describe(name))
    print(
        "\nnot implemented — the scenario harness lands with the engine "
        "(Phase 0). Exiting deliberately rather than reporting a fake pass.",
        file=sys.stderr,
    )
    return EXIT_NOT_IMPLEMENTED


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))