"""Append-only event log persistence — ARCHITECTURE §11.

V1 ships file-based state and **no database**. For 50-150 road segments and
10-20 landmarks a spatial database is pure operational overhead: a connection
pool, a migration tool, and a container that must be healthy before the app
boots. PostgreSQL/PostGIS/Redis return when a requirement breaks without them,
not when they would be architecturally tidy (ARCH §11).
"""

from __future__ import annotations

__all__: list[str] = []
