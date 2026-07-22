/**
 * Pure state machine for a single import upload slot (e.g. "current BOM", "proposed BOM", or
 * the one open-PO slot). Deliberately has no React/DOM dependency, for the same reason as
 * src/lib/timedAction.ts: it lets the actual state-transition logic be unit tested with plain
 * vitest, and it's also the single source of truth the "use client" components dispatch
 * against, so there's no separate, only-informally-equivalent copy of this logic living in
 * component code.
 *
 * The state that matters most here is "unknown": entered only via a timeout, and -- by
 * construction of this reducer -- there is no event that transitions OUT of "unknown". The
 * only way back to "idle" is a fresh state object, i.e. a full page refresh (a new component
 * mount). This is deliberate: after a timeout we cannot tell whether the original Server
 * Action is still running server-side (see timedAction.ts), so re-enabling the control for an
 * immediate retry could create a duplicate import. Requiring a refresh forces the user to
 * actually check current state before trying again.
 */

export type ImportSlotState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; message: string }
  | { status: "success" }
  | { status: "unknown"; message: string }; // locked pending a full page refresh

export const initialImportSlotState: ImportSlotState = { status: "idle" };

export type ImportSlotEvent =
  | { type: "start" }
  | { type: "timeout"; message: string }
  | { type: "settled"; outcome: "success" | "failure"; message?: string }
  /**
   * A resolution that arrives after a timeout was already reported for this attempt (see
   * runTimedAction's onStaleSettle). Deliberately a no-op for STATE -- it must never clear the
   * "unknown" warning, show an ordinary success message, or re-enable the control. The caller
   * (BomsClient/PoClient) may still perform a side effect like router.refresh() to reconcile
   * server data when a stale outcome turns out to have succeeded, but that is a side effect
   * outside this state machine, not a state transition.
   */
  | { type: "staleSettled" };

/** Whether a NEW import attempt is allowed to start from this state. */
export function canStartImport(state: ImportSlotState): boolean {
  return state.status === "idle" || state.status === "error" || state.status === "success";
}

export function reduceImportSlotEvent(state: ImportSlotState, event: ImportSlotEvent): ImportSlotState {
  switch (event.type) {
    case "start":
      // Guards re-entrancy AND the post-timeout lock in one place: canStartImport is false for
      // both "busy" and "unknown", so this is a no-op (state unchanged) in either case -- the
      // control stays exactly as locked/busy as it was.
      if (!canStartImport(state)) return state;
      return { status: "busy" };

    case "timeout":
      // Only a currently-busy attempt can time out into the unknown/locked state.
      if (state.status !== "busy") return state;
      return { status: "unknown", message: event.message };

    case "settled":
      // A direct (non-stale) settle only applies to an attempt that's still busy from this
      // state machine's point of view. If a timeout already fired, state is "unknown" and any
      // resolution from that same original request must come through "staleSettled" instead.
      if (state.status !== "busy") return state;
      return event.outcome === "success"
        ? { status: "success" }
        : { status: "error", message: event.message ?? "Import failed." };

    case "staleSettled":
      return state; // see the type's doc comment above -- intentionally never changes state

    default:
      return state;
  }
}
