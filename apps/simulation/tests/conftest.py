"""Shared fixtures. Deliberately minimal — no world, no agents, no network."""

from __future__ import annotations

import os

import pytest

from app.engine.digest import DigestRow
from app.wire.protocol import WireEntity


@pytest.fixture
def repo_root() -> str:
    """Absolute path to the workspace root (`apps/simulation/..`)."""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, "..", "..", ".."))


@pytest.fixture
def sample_entities() -> list[WireEntity]:
    """Three entities with distinct states, deliberately out of id order.

    Out of order on purpose: any code that silently relies on input ordering
    rather than an explicit sort shows up here.
    """
    return [
        WireEntity(
            id=7, x_q=100, y_q=200, z_q=0, heading_q=0, vx_q=0, vy_q=0, vz_q=0, state=2, type=1
        ),
        WireEntity(
            id=3, x_q=-50, y_q=25, z_q=10, heading_q=16384, vx_q=10, vy_q=0, vz_q=0, state=0, type=0
        ),
        WireEntity(
            id=5, x_q=0, y_q=0, z_q=0, heading_q=32768, vx_q=0, vy_q=0, vz_q=0, state=1, type=2
        ),
    ]


@pytest.fixture
def sample_rows() -> list[DigestRow]:
    return [(7, 100, 200, 0, 2), (3, -50, 25, 10, 0), (5, 0, 0, 0, 1)]
