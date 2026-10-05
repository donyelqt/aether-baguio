"""AETHER: Baguio — simulation engine and realtime gateway.

One deployable unit, not two services. Splitting the gateway from the engine
would buy nothing at V1 and cost a network hop *inside* the tick loop
(ARCH §3).

Import direction is one-way and enforced by tests:

    ai  →  engine  →  wire
    engine  →  wire
    ai  ✗  wire        (an LLM may not reach the wire directly)
    ai  ✗  engine state (R2: no LLM writes world state)

Deleting `app/ai/` must leave a working simulation at 0 LLM calls (R1).
"""
