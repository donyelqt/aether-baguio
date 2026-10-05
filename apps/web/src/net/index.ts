/**
 * Network layer — transport, snapshot buffer, interpolation.
 *
 * Implemented in Phase 0. The types in `./transport` fix the contract first:
 * reconnect/resume (FR-6.4) is a Phase 0 requirement rather than a later fix
 * because Cloud Run caps request duration at 3600 s while a 3-hour observation
 * session is a normal use case (ARCH §12.2).
 */

export type { ConnectionState, Snapshot, SnapshotTransport, ViewReport } from './transport';
