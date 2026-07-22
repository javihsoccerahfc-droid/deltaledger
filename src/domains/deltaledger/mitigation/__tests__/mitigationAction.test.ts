import { describe, it, expect } from "vitest";
import { createMitigationAction, transitionMitigationStatus } from "@/domains/deltaledger/mitigation/mitigationAction";

describe("createMitigationAction", () => {
  it("creates an action in 'open' status", () => {
    const action = createMitigationAction("exp-1", "cancel", "buyer-1", "2026-08-01", "2026-07-16T00:00:00Z");
    expect(action.status).toBe("open");
    expect(action.exposureRecordId).toBe("exp-1");
    expect(action.ownerUserId).toBe("buyer-1");
  });
});

describe("transitionMitigationStatus", () => {
  it("allows open -> in_progress -> done", () => {
    let action = createMitigationAction("exp-1", "cancel", "buyer-1", null, "t");
    action = transitionMitigationStatus(action, "in_progress");
    expect(action.status).toBe("in_progress");
    action = transitionMitigationStatus(action, "done");
    expect(action.status).toBe("done");
  });

  it("does not allow transitioning out of a terminal 'done' status", () => {
    let action = createMitigationAction("exp-1", "cancel", "buyer-1", null, "t");
    action = transitionMitigationStatus(action, "in_progress");
    action = transitionMitigationStatus(action, "done");
    expect(() => transitionMitigationStatus(action, "in_progress")).toThrow();
  });

  it("allows reopening an abandoned action", () => {
    let action = createMitigationAction("exp-1", "cancel", "buyer-1", null, "t");
    action = transitionMitigationStatus(action, "abandoned");
    action = transitionMitigationStatus(action, "open");
    expect(action.status).toBe("open");
  });

  it("does not allow an invalid direct jump", () => {
    const action = createMitigationAction("exp-1", "cancel", "buyer-1", null, "t");
    expect(() => transitionMitigationStatus(action, "done")).toThrow();
  });
});
