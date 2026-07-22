"use client";

import { useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importPurchaseOrderAction } from "@/app/actions";
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
import { InfoHero } from "@/components/design-system/InfoHero";
import { SupplierTermsForm } from "./SupplierTermsForm";
import { ExchangeRateForm } from "./ExchangeRateForm";

interface PoLine {
  id: string;
  purchaseOrderId: string;
  rawPartNumber: string;
  quantityOpen: number | null;
  unitPriceTransactionCurrency: number | null;
  transactionCurrency: string;
  promisedReceiptDate: string | null;
}
interface PurchaseOrderRow {
  id: string;
  poNumber: string;
  supplierId: string;
}
interface SupplierRow {
  id: string;
  name: string;
}
interface ExchangeRateRow {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  rateDate: string;
}

export function PoClient({
  ecId,
  purchaseOrders,
  poLines,
  suppliers,
  exchangeRates,
  activeSupplierTerms,
}: {
  ecId: string;
  purchaseOrders: PurchaseOrderRow[];
  poLines: PoLine[];
  suppliers: SupplierRow[];
  exchangeRates: ExchangeRateRow[];
  activeSupplierTerms: { supplierId: string; terms: { id: string; ncnr: boolean; cancellationWindowDays: number | null; source: string; validUntil: string | null }[] }[];
}) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, dispatch] = useReducer(reduceImportSlotEvent, initialImportSlotState);
  const [lastImportSummary, setLastImportSummary] = useState<string | null>(null);
  const importTimer = useTimedAction();

  const [confirmPrompt, setConfirmPrompt] = useState<{ file: File; message: string } | null>(null);

  async function submitFile(file: File, confirmed: boolean) {
    dispatch({ type: "start" });
    setLastImportSummary(null);

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

    const first = await importTimer.run(
      () => {
        const formData = new FormData();
        formData.set("ecId", ecId);
        formData.set("file", file);
        formData.set("actor", JSON.stringify(currentUser));
        if (confirmed) formData.set("confirmSupersedesExposure", "true");
        return importPurchaseOrderAction(formData);
      },
      {
        timeoutMs: IMPORT_TIMEOUT_MS,
        onTimeout: () => {
          // See BomsClient.tsx for the full rationale: we can't cancel the underlying request,
          // so the outcome is unknown, not success/failure. This locks the control -- only a
          // page refresh, not an in-app retry, can clear it.
          dispatch({ type: "timeout", message: IMPORT_TIMEOUT_UNKNOWN_MESSAGE });
        },
        onStaleSettle: (late) => {
          // Must not clear the unknown-state warning, show an ordinary success message, or
          // unlock the control -- see importSlotState.ts. A late success may still quietly
          // refresh server data via router.refresh(), nothing more (deliberately NOT updating
          // lastImportSummary here, since that renders as an ordinary success banner).
          dispatch({ type: "staleSettled" });
          if (late.status === "resolved" && late.value.success) {
            router.refresh();
          }
        },
      }
    );

    if (first.status === "timeout") return; // already handled above

    if (first.status === "rejected") {
      dispatch({
        type: "settled",
        outcome: "failure",
        message: "The import request did not complete. Check your connection and try again.",
      });
      return;
    }

    if (!first.value.success) {
      // P0 remediation, Decision C: re-importing PO data while active exposure exists for
      // this EC is allowed, but only after an explicit confirmation -- see
      // importPurchaseOrderAction. This is a distinct path from an ordinary failure: the
      // request was understood, nothing was written, and the user gets a choice, not an
      // error to fix.
      if (first.value.requiresConfirmation) {
        dispatch({ type: "settled", outcome: "failure", message: first.value.message });
        setConfirmPrompt({ file, message: first.value.message });
        return;
      }
      dispatch({ type: "settled", outcome: "failure", message: first.value.message });
    } else {
      dispatch({ type: "settled", outcome: "success" });
      setLastImportSummary(`${first.value.lineCount} line(s), ${first.value.supplierCount} supplier(s)`);
      router.refresh();
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;

    // See BomsClient.tsx: canStartImport is false both while busy and while locked in the
    // "unknown" post-timeout state -- only a page refresh clears the latter.
    if (!canStartImport(state)) return;
    setConfirmPrompt(null);
    await submitFile(file, false);
  }

  async function confirmReimport() {
    if (!confirmPrompt) return;
    const { file } = confirmPrompt;
    setConfirmPrompt(null);
    if (!canStartImport(state)) return;
    await submitFile(file, true);
  }

  const currencies = Array.from(new Set(poLines.map((l) => l.transactionCurrency)));
  const needsFx = currencies.filter((c) => c !== "USD");

  return (
    <div>
      <InfoHero
        eyebrow="OPEN PO"
        value={poLines.length === 0 ? "No PO data imported yet" : `${poLines.length} line${poLines.length === 1 ? "" : "s"} across ${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}`}
        supporting={
          poLines.length === 0
            ? "This is what DeltaLedger calculates financial exposure from."
            : `${purchaseOrders.length} purchase order${purchaseOrders.length === 1 ? "" : "s"} imported.`
        }
      />
      <p className="mt-3 text-sm text-ink-soft">
        Rows are grouped into purchase orders and suppliers automatically, by PO number and supplier name. Import
        the open-PO export below to get started (.xlsx, .xls, or .csv, up to {MAX_IMPORT_FILE_SIZE_LABEL}).
      </p>

      <div className="mt-5 rounded-md border border-line bg-white p-4">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          disabled={!canStartImport(state)}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={!canStartImport(state)}
          className="rounded-sm border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {state.status === "busy"
            ? "Importing…"
            : state.status === "unknown"
              ? "Refresh page to retry"
              : poLines.length > 0
                ? "Re-import open PO export"
                : "Import open PO export"}
        </button>
        {poLines.length > 0 && (
          <span className="ml-3 text-xs text-ink-soft">
            {purchaseOrders.length} PO(s), {poLines.length} line(s), {suppliers.length} supplier(s)
          </span>
        )}
      </div>

      {state.status === "error" && (
        <div className="mt-4">
          <FailureState title="Could not import file" body={state.message} />
        </div>
      )}
      {state.status === "unknown" && (
        <div className="mt-4">
          <WarningState title="Import status unknown" body={state.message} />
        </div>
      )}
      {lastImportSummary && (
        <div className="mt-4">
          <SuccessState title="PO lines imported" body={lastImportSummary} />
        </div>
      )}

      <div className="mt-6">
        {poLines.length === 0 ? (
          <EmptyState
            title="No purchase order data yet"
            body="This is where DeltaLedger calculates financial exposure from — open PO commitments against the parts affected by this change. Import your open-PO export above to get started."
          />
        ) : (
          <div className="overflow-auto rounded-md border border-line bg-white">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-2.5 font-medium">PO number</th>
                  <th className="px-4 py-2.5 font-medium">Supplier</th>
                  <th className="px-4 py-2.5 font-medium">Part number</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qty open</th>
                  <th className="px-4 py-2.5 text-right font-medium">Unit price</th>
                  <th className="px-4 py-2.5 font-medium">Currency</th>
                  <th className="px-4 py-2.5 font-medium">Promised receipt</th>
                </tr>
              </thead>
              <tbody>
                {poLines.map((line) => {
                  const po = purchaseOrders.find((p) => p.id === line.purchaseOrderId);
                  const supplier = suppliers.find((s) => s.id === po?.supplierId);
                  return (
                    <tr key={line.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{po?.poNumber}</td>
                      <td className="px-4 py-2.5 text-xs">{supplier?.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{line.rawPartNumber}</td>
                      <td className="data-num px-4 py-2.5 text-right text-xs">
                        {line.quantityOpen === null ? <span className="text-status-critical">missing</span> : line.quantityOpen}
                      </td>
                      <td className="data-num px-4 py-2.5 text-right text-xs">
                        {line.unitPriceTransactionCurrency === null ? (
                          <span className="text-status-critical">missing</span>
                        ) : (
                          line.unitPriceTransactionCurrency
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{line.transactionCurrency}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{line.promisedReceiptDate ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {suppliers.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink">Supplier Cancellation Terms</h2>
          <p className="mb-3 text-xs text-ink-soft">
            Required for a Known-grade cancellation status. Adding new terms supersedes any prior
            active terms for the same supplier — the old row is kept, never overwritten.
          </p>
          <SupplierTermsForm suppliers={suppliers} activeTerms={activeSupplierTerms} />
        </div>
      )}

      {needsFx.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink">Exchange Rates</h2>
          <p className="mb-3 text-xs text-ink-soft">
            This PO export includes non-USD currencies ({needsFx.join(", ")}). Enter the rate to
            convert to the USD reporting currency — uploaded/manually entered only, no live market-data API.
          </p>
          <ExchangeRateForm currencies={needsFx} existingRates={exchangeRates} />
        </div>
      )}

      {confirmPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30" onClick={() => setConfirmPrompt(null)}>
          <div className="w-full max-w-md rounded-md bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-ink">Re-import PO data?</h2>
            <p className="mt-2 text-sm text-ink-soft">{confirmPrompt.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmPrompt(null)}
                className="rounded-sm border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent"
              >
                Cancel
              </button>
              <button
                onClick={confirmReimport}
                className="rounded-sm bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-deep"
              >
                Continue with re-import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
