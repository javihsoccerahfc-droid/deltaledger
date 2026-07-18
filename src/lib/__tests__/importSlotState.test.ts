import { describe, it, expect } from "vitest";
import {
  initialImportSlotState,
  reduceImportSlotEvent,
  canStartImport,
  ImportSlotState,
} from "../importSlotState";

const TIMEOUT_MESSAGE =
  "The import is taking longer than expected. Its final status is unknown. Refresh the page " +
  "before trying again to avoid creating a duplicate import.";

describe("importSlotState", () => {
  it("starts idle and allows starting an import", () => {
    expect(canStartImport(initialImportSlotState)).toBe(true);
  });

  it("a timeout while busy enters the unknown/locked state with the required message", () => {
    const busy = reduceImportSlotEvent(initialImportSlotState, { type: "start" });
    expect(busy).toEqual({ status: "busy" });

    const timedOut = reduceImportSlotEvent(busy, { type: "timeout", message: TIMEOUT_MESSAGE });
    expect(timedOut).toEqual({ status: "unknown", message: TIMEOUT_MESSAGE });
  });

  it("the import control remains locked (cannot start) once in the unknown state", () => {
    const unknown: ImportSlotState = { status: "unknown", message: TIMEOUT_MESSAGE };
    expect(canStartImport(unknown)).toBe(false);

    // Dispatching "start" against a locked slot is a no-op -- state is unchanged, not busy.
    const afterAttemptedStart = reduceImportSlotEvent(unknown, { type: "start" });
    expect(afterAttemptedStart).toEqual(unknown);
  });

  it("a late (stale) success does NOT replace the unknown-state warning, show success, or unlock the control", () => {
    const unknown: ImportSlotState = { status: "unknown", message: TIMEOUT_MESSAGE };

    const afterStaleSuccess = reduceImportSlotEvent(unknown, { type: "staleSettled" });

    // Still exactly the same unknown state -- message intact, not "success", not unlocked.
    expect(afterStaleSuccess).toEqual(unknown);
    expect(afterStaleSuccess.status).not.toBe("success");
    expect(canStartImport(afterStaleSuccess)).toBe(false);
  });

  it("a late (stale) failure is likewise a no-op against the unknown state", () => {
    const unknown: ImportSlotState = { status: "unknown", message: TIMEOUT_MESSAGE };
    const after = reduceImportSlotEvent(unknown, { type: "staleSettled" });
    expect(after).toEqual(unknown);
  });

  it("there is no event that transitions out of 'unknown' -- only a fresh state (a page refresh) allows another attempt", () => {
    const unknown: ImportSlotState = { status: "unknown", message: TIMEOUT_MESSAGE };

    // Every event type, thrown at the locked state, leaves it exactly as locked.
    const events: Parameters<typeof reduceImportSlotEvent>[1][] = [
      { type: "start" },
      { type: "timeout", message: "irrelevant" },
      { type: "settled", outcome: "success" },
      { type: "settled", outcome: "failure", message: "irrelevant" },
      { type: "staleSettled" },
    ];
    for (const event of events) {
      expect(reduceImportSlotEvent(unknown, event)).toEqual(unknown);
    }

    // The only way back to a startable state is a brand-new initial state -- i.e. a fresh
    // component mount from a page refresh, not any in-app action.
    expect(canStartImport(initialImportSlotState)).toBe(true);
  });

  it("a normal (non-timeout) success/failure still resolves busy -> success/error as before", () => {
    const busy = reduceImportSlotEvent(initialImportSlotState, { type: "start" });
    const success = reduceImportSlotEvent(busy, { type: "settled", outcome: "success" });
    expect(success).toEqual({ status: "success" });
    expect(canStartImport(success)).toBe(true); // a completed, non-locked attempt can retry/re-import

    const busyAgain = reduceImportSlotEvent(initialImportSlotState, { type: "start" });
    const failed = reduceImportSlotEvent(busyAgain, { type: "settled", outcome: "failure", message: "bad file" });
    expect(failed).toEqual({ status: "error", message: "bad file" });
    expect(canStartImport(failed)).toBe(true);
  });
});
