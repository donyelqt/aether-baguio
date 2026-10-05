/**
 * Network transport seam — ARCHITECTURE §7, §16.
 *
 * Owns the WebSocket lifecycle, the snapshot buffer, and interpolation between
 * the last two snapshots. The server publishes authoritative world state at
 * 15 Hz (NFR-2); render runs at 60 FPS (NFR-3). That 4× gap is why
 * interpolation is mandatory rather than cosmetic (ARCH §7.6).
 *
 * Nothing here is implemented yet — Phase 0. These are the types the transport
 * will satisfy, so the connection contract is reviewable before any socket is
 * opened.
 */

import type { Snapshot } from '@aether/shared-types';

/** A decoded snapshot, re-exported so consumers need one import, not two. */
export type { Snapshot };

/** Connection state, surfaced so the HUD can show reconnect state honestly. */
export type ConnectionState =
  | { status: 'idle' }
  | { status: 'connecting'; attempt: number }
  | { status: 'open'; lastAppliedTick: number }
  | { status: 'reconnecting'; attempt: number; lastAppliedTick: number }
  | { status: 'closed'; reason: string };

/**
 * The camera position a client reports to the server for interest culling.
 *
 * ARCH §9.2 is emphatic that this affects *what is sent*, never *what is
 * computed*. It must never be fed back into engine state: if it were, world
 * state would become a function of where one client looked and when its packet
 * arrived, and two clients watching the same seed could diverge.
 */
export interface ViewReport {
  type: 'view';
  /** World-space camera origin in metres, local ENU frame. */
  origin: [number, number, number];
  tick: number;
}

/** A snapshot transport. Implemented by the WebSocket client in Phase 0. */
export interface SnapshotTransport {
  connect(): void;
  close(): void;
  /** Highest tick successfully applied — the resume point for FR-6.4. */
  readonly lastAppliedTick: number;
}
