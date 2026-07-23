/**
 * A single, explicit toggle -- not a scattered set of "is this the demo" checks. Creating a new
 * engineering change has no existing row to attach a read-only flag to (see
 * src/domains/deltaledger/readOnly.ts for the per-EC mechanism used everywhere else), so it
 * needs its own gate.
 *
 * In this environment there is no real authentication yet, so there is no way to distinguish
 * "a real, authenticated user of a real customer's instance" from "a visitor exploring the
 * public demo" -- today's single-tenant deployment effectively *is* the demo. Setting this to
 * `true` disables creation entirely. A real production deployment (with real customer
 * accounts) would replace this constant with an actual permission check tied to that
 * authentication -- the createEngineeringChangeAction code path itself is untouched and fully
 * functional; only this one gate stands in front of it.
 */
export const ENGINEERING_CHANGE_CREATION_DISABLED = true;
