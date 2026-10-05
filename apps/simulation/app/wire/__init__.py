"""Binary wire format — ARCHITECTURE §7.

`protocol.py` is the single source of truth for the record layout on the Python
side. The TypeScript decoder in `packages/shared-types` mirrors it, and both
sides are asserted against the same numbers so the two cannot drift.
"""
