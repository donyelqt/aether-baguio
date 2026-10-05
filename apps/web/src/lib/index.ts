/**
 * Shared client utilities.
 *
 * Reserved for helpers used by more than one of `components/`, `net/`, and
 * `state/`. Nothing lands here until a second caller exists — a single-use
 * helper belongs next to its caller, not in a shared bag.
 *
 * Do **not** put world maths here. Simulation runs in the engine (NFR-1), and
 * client-side copies of that maths would drift from the authoritative version.
 */
export {};
