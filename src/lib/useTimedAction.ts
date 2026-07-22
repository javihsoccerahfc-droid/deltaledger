"use client";

import { useRef, useCallback } from "react";
import { createAttemptTracker, runTimedAction, RunTimedOptions, RaceResult } from "./timedAction";

/**
 * React binding for runTimedAction (see src/lib/timedAction.ts for the full rationale and the
 * important caveat about Server Actions not being cancellable from the client). Each call to
 * the returned `run` function is one "attempt" against a tracker that lives for the lifetime
 * of the component instance -- pass a separate `useTimedAction()` per independently-retryable
 * upload slot (e.g. one for "current BOM" and one for "proposed BOM").
 */
export function useTimedAction() {
  const trackerRef = useRef(createAttemptTracker());

  const run = useCallback(<T,>(action: () => Promise<T>, options: RunTimedOptions<T>): Promise<RaceResult<T>> => {
    return runTimedAction(action, trackerRef.current, options);
  }, []);

  return { run };
}
