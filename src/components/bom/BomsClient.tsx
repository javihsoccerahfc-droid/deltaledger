"use client";

import { useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import { importBomAction } from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";
import { useTimedAction } from "@/lib/useTimedAction";
import {
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_FILE_SIZE_LABEL,
  IMPORT_TIMEOUT_MS,
  IMPORT_TIMEOUT_UNKNOWN_MESSAGE,
} from "@/lib/importLimits";
import { reduceImportSlotEvent, canStartImport, initialImportSlotState } from "@/lib/importSlotState";
import { EmptyState, FailureState, SuccessState, WarningState } from "@/components/shared/States";

const CHANGE_TYPE_STYLES: Record<string, string> = {
  added: "bg-status-successBg text-status-success border-status-success/30",
  removed: "bg-status-criticalBg text-status-critical border-status-critical/30",
  replaced: "bg-accent-soft text-accent border-accent/30",
  qty_reduced: "bg-status-warningBg text-status-warning border-status-warning/30",
  qty_increased: "bg-paper text-ink-soft border-line",
};

interface BomImportSummary {
  bomImport: { sourceFile: string };
  lines: unknown[];
}

export function BomsClient({
  ecId,
  imports,
  diff,
}: {
  ecId: string;
  imports: Partial<Record<"current" | "proposed", BomImportSummary>>;
  diff: { id: string; partId: string; changeType: string; fromQuantity: number | null; toQuantity: number | null }[];
}) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const currentInputRef = useRef<HTMLInputElement>(null);
  const proposedInputRef = useRef<HTMLInputElement>(null);

  // Each upload slot has its own state machine (see src/lib/importSlotState.ts) AND its own
  // timeout attempt tracker -- a timeout/retry on "proposed" must never interact with "current".
  const [currentState, dispatchCurrent] = useReducer(reduceImportSlotEvent, initialImportSlotState);
  const [proposedState, dispatchProposed] = useReducer(reduceImportSlotEvent, initialImportSlotState);
  const currentTimer = useTimedAction();
  const proposedTimer = useTimedAction();

  async function handleFile(versionLabel: "current" | "proposed", file: File | undefined) {
    if (!file) return;
    const state = versionLabel === "current" ? currentState : proposedState;
    const dispatch = versionLabel === "current" ? dispatchCurrent : dispatchProposed;

    // Guards re-entrancy AND the post-timeout lock: canStartImport is false while "busy" (an
    // import is already running) and while "unknown" (a prior import's outcome was never
    // confirmed -- see IMPORT_TIMEOUT_UNKNOWN_MESSAGE). Only a page refresh, not any action in
    // this component, can clear the "unknown" state.
    if (!canStartImport(state)) return;
    dispatch({ type: "start" });

    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      dispatch({
        type: "settled",
        outcome: "failure",
        message:
          `"${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). ` +
          `Files must be ${MAX_IMPORT_FILE_SIZE_LABEL} or smaller.`,
      });
      return;
    }

    const timer = versionLabel === "current" ? currentTimer : proposedTimer;

    const first = await timer.run(
      () => {
        const formData = new FormData();
        formData.set("ecId", ecId);
        formData.set("versionLabel", versionLabel);
        formData.set("file", file);
        formData.set("actor", JSON.stringify(currentUser));
        return importBomAction(formData);
      },
      {
        timeoutMs: IMPORT_TIMEOUT_MS,
        onTimeout: () => {
          // We can't cancel the underlying Server Action from here (see
          // src/lib/timedAction.ts), so the original request may still be running server-side
          // -- the true outcome is unknown. This locks the control (see importSlotState.ts);
          // only a page refresh, not an in-app retry, can clear it, since an immediate retry
          // while the original may still be in flight risks a duplicate import.
          dispatch({ type: "timeout", message: IMPORT_TIMEOUT_UNKNOWN_MESSAGE });
        },
        onStaleSettle: (late) => {
          // Arrives after the unknown-state warning was already shown for this attempt. Per
          // importSlotState.ts, "staleSettled" never changes state -- it must not clear the
          // warning, show an ordinary success message, or unlock the control. A late success
          // may still trigger router.refresh() to reconcile server data, but nothing else.
          dispatch({ type: "staleSettled" });
          if (late.status === "resolved" && late.value.success) {
            router.refresh();
          }
        },
      }
    );

    if (first.status === "timeout") return; // already handled by the onTimeout dispatch above

    if (first.status === "rejected") {
      // The action itself always catches its own errors and returns a typed failure result,
      // so landing here means the request never completed at all (e.g. a network/transport
      // failure) rather than a business-logic failure.
      dispatch({
        type: "settled",
        outcome: "failure",
        message: "The import request did not complete. Check your connection and try again.",
      });
      return;
    }

    if (!first.value.success) {
      dispatch({ type: "settled", outcome: "failure", message: first.value.message });
    } else {
      dispatch({ type: "settled", outcome: "success" });
      router.refresh();
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">BOM Import & Diff</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Import the current and proposed BOM (.xlsx, .xls, or .csv, up to {MAX_IMPORT_FILE_SIZE_LABEL} each).
        The diff below is computed deterministically — added/removed/replaced parts are never
        auto-inferred; a removed+added pair only becomes &quot;replaced&quot; through an explicit
        pairing action.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-sm font-medium text-ink">Current BOM</p>
          {imports.current ? (
            <p className="mt-1 text-xs text-ink-soft">
              {imports.current.bomImport.sourceFile} — {imports.current.lines.length} lines
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-soft">Not imported yet.</p>
          )}
          <input
            ref={currentInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={!canStartImport(currentState)}
            onChange={(e) => handleFile("current", e.target.files?.[0])}
          />
          <button
            onClick={() => currentInputRef.current?.click()}
            disabled={!canStartImport(currentState)}
            className="mt-3 rounded-sm border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {currentState.status === "busy"
              ? "Importing…"
              : currentState.status === "unknown"
                ? "Refresh page to retry"
                : imports.current
                  ? "Re-import current BOM"
                  : "Import current BOM"}
          </button>
          {currentState.status === "error" && (
            <div className="mt-3">
              <FailureState title="Could not import file" body={currentState.message} />
            </div>
          )}
          {currentState.status === "unknown" && (
            <div className="mt-3">
              <WarningState title="Import status unknown" body={currentState.message} />
            </div>
          )}
        </div>

        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-sm font-medium text-ink">Proposed BOM</p>
          {imports.proposed ? (
            <p className="mt-1 text-xs text-ink-soft">
              {imports.proposed.bomImport.sourceFile} — {imports.proposed.lines.length} lines
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-soft">Not imported yet.</p>
          )}
          <input
            ref={proposedInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={!canStartImport(proposedState)}
            onChange={(e) => handleFile("proposed", e.target.files?.[0])}
          />
          <button
            onClick={() => proposedInputRef.current?.click()}
            disabled={!canStartImport(proposedState)}
            className="mt-3 rounded-sm border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {proposedState.status === "busy"
              ? "Importing…"
              : proposedState.status === "unknown"
                ? "Refresh page to retry"
                : imports.proposed
                  ? "Re-import proposed BOM"
                  : "Import proposed BOM"}
          </button>
          {proposedState.status === "error" && (
            <div className="mt-3">
              <FailureState title="Could not import file" body={proposedState.message} />
            </div>
          )}
          {proposedState.status === "unknown" && (
            <div className="mt-3">
              <WarningState title="Import status unknown" body={proposedState.message} />
            </div>
          )}
        </div>
      </div>

      {imports.current && imports.proposed && (
        <div className="mt-4">
          <SuccessState title="Diff computed" body={`${diff.length} change(s) detected between current and proposed BOM.`} />
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">BOM Diff</h2>
        {diff.length === 0 ? (
          <EmptyState title="No diff yet" body="Import both the current and proposed BOM to see the deterministic diff." />
        ) : (
          <div className="overflow-hidden rounded-md border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Part number</th>
                  <th className="px-4 py-2.5 font-medium">Change type</th>
                  <th className="px-4 py-2.5 font-medium">From qty</th>
                  <th className="px-4 py-2.5 font-medium">To qty</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-mono text-ink">{d.partId}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-sm border px-2 py-0.5 text-xs font-medium ${CHANGE_TYPE_STYLES[d.changeType]}`}>
                        {d.changeType.replace("_", " ")}
                      </span>
                    </td>
                    <td className="data-num px-4 py-2.5 text-ink-soft">{d.fromQuantity ?? "—"}</td>
                    <td className="data-num px-4 py-2.5 text-ink-soft">{d.toQuantity ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
