"""Agent models — citizens, tourists, vehicles (PRD §5).

Not implemented. These land in Phase 1 (FR-2.1) and are listed here so the
package boundary exists and so the dependency direction is fixed: agents depend
on `engine` (for `WorldView`), never the reverse.

The AI layer must not import this package either — agents are simulation state,
and R2 forbids an LLM from writing it.
"""

from __future__ import annotations

__all__: list[str] = []
