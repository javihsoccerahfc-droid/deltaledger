"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { addSupplierTermsAction } from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";
import { InlineFeedback } from "@/components/shared/States";
import { Button } from "@/components/design-system/Button";

export function SupplierTermsForm({
  suppliers,
  activeTerms,
}: {
  suppliers: { id: string; name: string }[];
  activeTerms: { supplierId: string; terms: { id: string; ncnr: boolean; cancellationWindowDays: number | null; source: string; validUntil: string | null }[] }[];
}) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const [isPending, startTransition] = useTransition();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [ncnr, setNcnr] = useState(false);
  const [cancellationWindowDays, setCancellationWindowDays] = useState("30");
  const [source, setSource] = useState<"verified_contract" | "supplier_provided" | "unconfirmed">("verified_contract");
  const [validUntil, setValidUntil] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const isSubmitting = useRef(false);

  function handleAdd() {
    if (isSubmitting.current) return;
    if (!supplierId) {
      setFeedback({ type: "error", message: "Choose a supplier first." });
      return;
    }
    const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? supplierId;
    const now = new Date().toISOString();
    isSubmitting.current = true;
    startTransition(async () => {
      try {
        await addSupplierTermsAction(
          supplierId,
          {
            partId: null,
            ncnr,
            standardLeadTimeDays: null,
            cancellationWindowDays: ncnr ? null : Number(cancellationWindowDays) || null,
            source,
            effectiveDate: now.slice(0, 10),
            notes: null,
            verifiedAt: now,
            verifiedBy: currentUser.id,
            validUntil: validUntil || null,
          },
          currentUser
        );
        setFeedback({ type: "success", message: `Terms saved for ${supplierName}. Any prior active terms for this supplier were superseded.` });
        setNcnr(false);
        setCancellationWindowDays("30");
        setValidUntil("");
        router.refresh();
      } catch (err) {
        setFeedback({ type: "error", message: err instanceof Error ? err.message : `Could not save terms for ${supplierName}.` });
      } finally {
        isSubmitting.current = false;
      }
    });
  }

  return (
    <div className="rounded-md border border-line bg-white p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <label className="text-xs">
          <span className="mb-1 block font-medium text-ink">Supplier</span>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-sm border border-line px-2 py-1.5 text-xs"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium text-ink">Source</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as typeof source)}
            className="w-full rounded-sm border border-line px-2 py-1.5 text-xs"
          >
            <option value="verified_contract">Verified contract</option>
            <option value="supplier_provided">Supplier-provided</option>
            <option value="unconfirmed">Unconfirmed</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 pt-5 text-xs">
          <input type="checkbox" checked={ncnr} onChange={(e) => setNcnr(e.target.checked)} />
          NCNR
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium text-ink">Cancellation window (days)</span>
          <input
            type="number"
            disabled={ncnr}
            value={cancellationWindowDays}
            onChange={(e) => setCancellationWindowDays(e.target.value)}
            className="w-full rounded-sm border border-line px-2 py-1.5 text-xs disabled:bg-paper"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium text-ink">Valid until</span>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="w-full rounded-sm border border-line px-2 py-1.5 text-xs"
          />
        </label>
      </div>
      <Button size="sm" className="mt-3" onClick={handleAdd} disabled={isPending}>
        {isPending ? "Saving…" : "Add terms"}
      </Button>
      {feedback && <InlineFeedback type={feedback.type} message={feedback.message} />}

      {activeTerms.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-ink-soft">
          <p className="mb-1 font-medium text-ink">Currently active</p>
          {activeTerms.map(({ supplierId, terms }) =>
            terms.map((t) => (
              <div key={t.id}>
                {suppliers.find((s) => s.id === supplierId)?.name ?? supplierId}:{" "}
                {t.ncnr ? "NCNR" : t.cancellationWindowDays !== null ? `${t.cancellationWindowDays}-day cancellation window` : "no cancellation window on file"}
                {" · "}
                {t.source.replace(/_/g, " ")}
                {t.validUntil ? ` · valid until ${t.validUntil}` : ""}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
