"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importPurchaseOrderAction } from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";
import { EmptyState, FailureState, SuccessState } from "@/components/shared/States";
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
}: {
  ecId: string;
  purchaseOrders: PurchaseOrderRow[];
  poLines: PoLine[];
  suppliers: SupplierRow[];
  exchangeRates: ExchangeRateRow[];
}) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastImportSummary, setLastImportSummary] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    const result = await importPurchaseOrderAction(ecId, file, currentUser);
    setBusy(false);
    if (!result.success) setError(result.message);
    else {
      setLastImportSummary(`${result.lineCount} line(s), ${result.supplierCount} supplier(s)`);
      router.refresh();
    }
  }

  const currencies = Array.from(new Set(poLines.map((l) => l.transactionCurrency)));
  const needsFx = currencies.filter((c) => c !== "USD");

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Open PO Import</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Import the open-PO export (.xlsx, .xls, or .csv). Rows are grouped into purchase orders and
        suppliers by PO number and supplier name.
      </p>

      <div className="mt-5 rounded-md border border-line bg-white p-4">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-sm border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {busy ? "Importing…" : poLines.length > 0 ? "Re-import open PO export" : "Import open PO export"}
        </button>
        {poLines.length > 0 && (
          <span className="ml-3 text-xs text-ink-soft">
            {purchaseOrders.length} PO(s), {poLines.length} line(s), {suppliers.length} supplier(s)
          </span>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <FailureState title="Could not import file" body={error} />
        </div>
      )}
      {lastImportSummary && (
        <div className="mt-4">
          <SuccessState title="PO lines imported" body={lastImportSummary} />
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">Open PO Lines</h2>
        {poLines.length === 0 ? (
          <EmptyState title="No PO lines yet" body="Import an open-PO export to see lines here." />
        ) : (
          <div className="overflow-auto rounded-md border border-line bg-white">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-2.5 font-medium">PO number</th>
                  <th className="px-4 py-2.5 font-medium">Supplier</th>
                  <th className="px-4 py-2.5 font-medium">Part number</th>
                  <th className="px-4 py-2.5 font-medium">Qty open</th>
                  <th className="px-4 py-2.5 font-medium">Unit price</th>
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
                      <td className="data-num px-4 py-2.5 text-xs">
                        {line.quantityOpen === null ? <span className="text-status-critical">missing</span> : line.quantityOpen}
                      </td>
                      <td className="data-num px-4 py-2.5 text-xs">
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
          <SupplierTermsForm suppliers={suppliers} />
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
    </div>
  );
}
