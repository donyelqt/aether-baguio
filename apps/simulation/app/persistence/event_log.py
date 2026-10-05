"""JSONL event-log writer — ARCHITECTURE §11, PRD FR-7.1.

Append-only JSONL, one record per line. Chosen over a database and over a binary
format because the log's consumers are `git diff`, `grep`, and replay — all of
which want line-oriented text.

Every write is flushed. A log that loses its tail on process death cannot
support FR-7.3 replay, and a long session on a throttled host is exactly when
that would happen.
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterable, Mapping
from typing import Any

__all__ = ["append_record", "read_records", "run_log_path"]


def run_log_path(root: str, seed: int) -> str:
    """Conventional per-run log location under `data/runs/` (gitignored)."""
    return os.path.join(root, "data", "runs", f"run-{seed}.jsonl")


def append_record(path: str, record: Mapping[str, Any]) -> None:
    """Append one record as a single JSON line, creating parents as needed."""
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    line = json.dumps(record, separators=(",", ":"), sort_keys=True)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")
        handle.flush()


def read_records(path: str) -> list[dict[str, Any]]:
    """Read a log back in write order."""
    with open(path, encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def append_records(path: str, records: Iterable[Mapping[str, Any]]) -> int:
    """Append many records. Returns the count written."""
    count = 0
    for record in records:
        append_record(path, record)
        count += 1
    return count
