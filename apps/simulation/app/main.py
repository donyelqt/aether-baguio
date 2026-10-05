"""Realtime gateway and FastAPI entrypoint — ARCHITECTURE §2, §3.

**Scaffold stage: there is no tick loop here yet.** The 15 Hz fixed-step
`SimulationEngine.step()` is Phase 0/1 work. What exists is the process
boundary — the app, its health probe, and the WebSocket route that Phase 0
replaces — so that compose wiring, container health checks, and the client
connection path can be built and tested against a real server now.

The WebSocket route accepts and then closes deliberately rather than hanging or
half-implementing the protocol. A socket that opens and silently produces no
frames is harder to diagnose than one that refuses with a stated reason.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.engine.clock import DT, TICK_HZ
from app.wire.protocol import ENTITY_STRIDE, HEADER_SIZE, PROTOCOL_VERSION, SCENE_RECORD_SIZE

#: Deliberate close reason. A client that retries should log this and stop.
WS_NOT_IMPLEMENTED_REASON = "scaffold: simulation tick loop lands in Phase 0 (FR-6.1)"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Process lifecycle. The always-on session registry lands in Phase 0.

    Engine start/stop belongs here and nowhere else: the tick loop runs
    *between* requests, so it is a background worker, not a request handler.
    That is what makes the Cloud Run CPU-throttling and 3600 s request-cap
    constraints real (ARCH §12.1, §12.2).
    """
    yield


app = FastAPI(
    title="AETHER: Baguio — simulation",
    version="0.1.0",
    description="Deterministic multi-agent urban simulation. Core mode runs at 0 LLM calls.",
    lifespan=lifespan,
)

# The client is a WebSocket-fed island served from a different origin in dev
# (Vercel in prod). No credentials: V1 is local/private deployment only, and a
# public deploy is gated on an opaque session token first (PRD R8, assumption 5).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict[str, object]:
    """Liveness probe for compose and the container health check.

    Reports the wire contract alongside health because a drifted record stride
    is the failure this service is least able to notice on its own.
    """
    return {
        "status": "ok",
        "mode": "core",
        "llm_calls": 0,
        "tick_hz": TICK_HZ,
        "dt": DT,
        "protocol_version": PROTOCOL_VERSION,
        "wire": {
            "header_bytes": HEADER_SIZE,
            "entity_bytes": ENTITY_STRIDE,
            "scene_bytes": SCENE_RECORD_SIZE,
        },
        "tick_loop": "not implemented (Phase 0)",
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Snapshot stream. Phase 0 replaces this body with the session registry.

    Phase 0 must also implement FR-6.4 reconnect/resume, and its keyframe has to
    carry **active interventions** — a lane closure or a dispatched unit is not
    an entity field, so an entity-only keyframe would leave a reconnecting
    client rendering a world that disagrees with the server's (ARCH §12.2).
    """
    await websocket.accept()
    await websocket.close(code=1000, reason=WS_NOT_IMPLEMENTED_REASON)
