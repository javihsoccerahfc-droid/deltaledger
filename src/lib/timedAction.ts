/**
 * Framework-agnostic core for running an async operation with a bounded client-side timeout,
 * and safely reconciling a late resolution against whatever the current attempt is by the
 * time it arrives. Deliberately has no React/DOM dependency so it can be unit tested with
 * plain vitest (see src/lib/__tests__/timedAction.test.ts) -- this repo intentionally has no
 * component-rendering test infrastructure (see README "Current limitations"), so keeping the
 * actual logic here, outside the "use client" hook that wraps it for React, is what makes it
 * testable at all without adding jsdom/React Testing Library.
 *
 * WHY THIS EXISTS (see BomsClient.tsx / PoClient.tsx for the calling code):
 * Next.js Server Actions invoked as direct function calls (as opposed to a native <form>
 * submission) do not expose an AbortSignal/cancellation hook to the caller. Racing the action
 * promise against a timeout only stops the CLIENT from waiting on it -- it does NOT cancel
 * whatever is still running on the server. Practically, that means once a timeout fires:
 *   - the true outcome is genuinely unknown -- the UI must say so, not claim success
 *   - the UI must not silently auto-retry: if the original request was merely slow rather
 *     than truly lost, an automatic retry could create a second import row for the same slot
 *   - a late resolution can still arrive afterward, and real work may actually have completed
 *     server-side, so it must be reconciled rather than ignored outright
 *
 * A manual retry is NOT necessarily allowed immediately after a timeout -- that's a policy
 * decision left to the caller. Specifically, BomsClient.tsx/PoClient.tsx require a full page
 * refresh before permitting another attempt on the same slot (see src/lib/importSlotState.ts),
 * precisely because the original request's outcome is unknown and an immediate retry could
 * create a duplicate import. This module only tracks whether a late result still belongs to
 * the attempt that was waiting on it -- it does not itself decide when retrying is safe.
 */

export type SettleOutcome<T> = { status: "resolved"; value: T } | { status: "rejected"; error: unknown };

export type RaceResult<T> = SettleOutcome<T> | { status: "timeout" };

export interface RunTimedOptions<T> {
  timeoutMs: number;
  /** Called immediately if the timeout fires before the action settles. */
  onTimeout?: () => void;
  /**
   * Called if the action settles AFTER a timeout was already reported, but only if no newer
   * attempt has been started since (see `attemptTracker`). A newer attempt owns the visible
   * "busy"/"error" UI state at that point, so this is for reconciling side effects (e.g.
   * quietly refreshing data if it turns out the original request actually succeeded) without
   * overwriting that newer attempt's own state.
   */
  onStaleSettle?: (outcome: SettleOutcome<T>) => void;
}

/** Minimal mutable counter used to detect whether a newer attempt has superseded this one. */
export interface AttemptTracker {
  current: number;
}

export function createAttemptTracker(): AttemptTracker {
  return { current: 0 };
}

/**
 * Runs `action()` racing against a `timeoutMs` timer.
 *
 * Returns as soon as EITHER settles:
 *  - if the action settles first, returns its resolved/rejected outcome directly.
 *  - if the timeout fires first, calls `onTimeout` and returns `{ status: "timeout" }`
 *    immediately (does not keep the caller waiting), while still attaching a continuation to
 *    the action promise so a later resolution can be reconciled via `onStaleSettle`.
 *
 * `tracker` must be shared across calls for the same logical "slot" (e.g. one per file input)
 * so a late settle can tell whether it's still the most recent attempt.
 */
export async function runTimedAction<T>(
  action: () => Promise<T>,
  tracker: AttemptTracker,
  options: RunTimedOptions<T>
): Promise<RaceResult<T>> {
  const attemptId = ++tracker.current;

  const actionOutcome: Promise<SettleOutcome<T>> = action().then(
    (value): SettleOutcome<T> => ({ status: "resolved", value }),
    (error): SettleOutcome<T> => ({ status: "rejected", error })
  );

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutOutcome = new Promise<{ status: "timeout" }>((resolve) => {
    timeoutHandle = setTimeout(() => resolve({ status: "timeout" }), options.timeoutMs);
  });

  const first = await Promise.race([actionOutcome, timeoutOutcome]);

  if (first.status === "timeout") {
    options.onTimeout?.();
    actionOutcome.then((late) => {
      // Only reconcile if no newer attempt has started for this slot since the timeout fired.
      if (attemptId === tracker.current) {
        options.onStaleSettle?.(late);
      }
    });
    return first;
  }

  clearTimeout(timeoutHandle);
  return first;
}
