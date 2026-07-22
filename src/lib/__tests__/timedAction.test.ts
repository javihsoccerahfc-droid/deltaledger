import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAttemptTracker, runTimedAction } from "../timedAction";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runTimedAction", () => {
  it("returns the resolved value when the action settles before the timeout", async () => {
    const tracker = createAttemptTracker();
    const promise = runTimedAction(() => Promise.resolve("ok"), tracker, { timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;
    expect(result).toEqual({ status: "resolved", value: "ok" });
  });

  it("returns a rejected outcome (not a thrown error) when the action rejects before the timeout", async () => {
    const tracker = createAttemptTracker();
    const err = new Error("boom");
    const promise = runTimedAction(() => Promise.reject(err), tracker, { timeoutMs: 1000 });
    const result = await promise;
    expect(result).toEqual({ status: "rejected", error: err });
  });

  it("fires onTimeout and returns a timeout status if the action never settles in time", async () => {
    const tracker = createAttemptTracker();
    const onTimeout = vi.fn();
    const { promise: neverSettles } = deferred<string>();

    const runPromise = runTimedAction(() => neverSettles, tracker, { timeoutMs: 1000, onTimeout });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await runPromise;

    expect(result).toEqual({ status: "timeout" });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("does not report success on timeout even if the action later resolves -- onStaleSettle sees it instead", async () => {
    const tracker = createAttemptTracker();
    const onTimeout = vi.fn();
    const onStaleSettle = vi.fn();
    const { promise: slow, resolve } = deferred<{ success: true }>();

    const runPromise = runTimedAction(() => slow, tracker, { timeoutMs: 1000, onTimeout, onStaleSettle });
    await vi.advanceTimersByTimeAsync(1000);
    const first = await runPromise;

    // The caller's immediate result is "timeout", never a fabricated success -- the outcome
    // was genuinely unknown at that point.
    expect(first).toEqual({ status: "timeout" });
    expect(onStaleSettle).not.toHaveBeenCalled();

    // The original request "completes" on the server after the client gave up waiting.
    resolve({ success: true });
    await vi.advanceTimersByTimeAsync(0);

    expect(onStaleSettle).toHaveBeenCalledWith({ status: "resolved", value: { success: true } });
  });

  it("does not call onStaleSettle if a newer attempt has started on the same tracker", async () => {
    const tracker = createAttemptTracker();
    const onStaleSettle = vi.fn();
    const { promise: firstAttemptSlow, resolve: resolveFirst } = deferred<string>();

    // First attempt times out.
    const firstRun = runTimedAction(() => firstAttemptSlow, tracker, {
      timeoutMs: 1000,
      onStaleSettle,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await firstRun;

    // A second attempt starts on the SAME tracker (simulating a manual retry) and resolves
    // immediately.
    await runTimedAction(() => Promise.resolve("second"), tracker, { timeoutMs: 1000 });

    // Now the first attempt's original action finally resolves -- it must NOT reconcile,
    // since a newer attempt has already superseded it.
    resolveFirst("first, but late");
    await vi.advanceTimersByTimeAsync(0);

    expect(onStaleSettle).not.toHaveBeenCalled();
  });

  it("clears the timeout handle when the action wins the race (no dangling timer callback)", async () => {
    const tracker = createAttemptTracker();
    const onTimeout = vi.fn();
    await runTimedAction(() => Promise.resolve("fast"), tracker, { timeoutMs: 1000, onTimeout });
    await vi.advanceTimersByTimeAsync(5000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
