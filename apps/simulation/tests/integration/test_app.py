"""Gateway surface — ARCHITECTURE §2, §12.

The process boundary must be real before Phase 0 logic lands, because compose
health checks and the container entrypoint depend on `/healthz` existing and
reporting the wire contract.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest

pytest.importorskip("httpx", reason="TestClient requires httpx")

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.engine.clock import DT, TICK_HZ
from app.main import WS_NOT_IMPLEMENTED_REASON, app
from app.wire.protocol import ENTITY_STRIDE, HEADER_SIZE


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


class TestHealth:
    def test_healthz_is_ok(self, client: TestClient) -> None:
        response = client.get("/healthz")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_healthz_reports_core_mode_and_zero_llm_calls(self, client: TestClient) -> None:
        """Criterion 13 — Core mode must make exactly zero LLM calls."""
        body = client.get("/healthz").json()
        assert body["mode"] == "core"
        assert body["llm_calls"] == 0

    def test_healthz_reports_tick_constants(self, client: TestClient) -> None:
        body = client.get("/healthz").json()
        assert body["tick_hz"] == TICK_HZ == 15
        assert body["dt"] == pytest.approx(DT)

    def test_healthz_reports_wire_contract(self, client: TestClient) -> None:
        """A drifted record stride is the failure this service cannot self-detect."""
        wire = client.get("/healthz").json()["wire"]
        assert wire["header_bytes"] == HEADER_SIZE == 28
        assert wire["entity_bytes"] == ENTITY_STRIDE == 44


class TestWebSocketScaffold:
    def test_ws_accepts_then_closes(self, client: TestClient) -> None:
        """A socket that opens and silently emits no frames is harder to
        diagnose than one that closes deliberately.

        The close *reason* is not asserted through the TestClient: Starlette's
        `WebSocketDisconnect` does not carry it, so asserting on the string
        would test the test client rather than the server. The reason is
        asserted as a constant below instead.
        """
        with client.websocket_connect("/ws") as socket, pytest.raises(WebSocketDisconnect):
            socket.receive_text()

    def test_close_reason_is_documented(self) -> None:
        """Clients that auto-reconnect need this string to be specific."""
        assert "Phase 0" in WS_NOT_IMPLEMENTED_REASON
        assert "FR-6.1" in WS_NOT_IMPLEMENTED_REASON
