"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addSupplierTermsAction } from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";

export function SupplierTermsForm({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const [isPending, startTransition] = useTransition();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [ncnr, setNcnr] = useState(false);
  const [cancellationWindowDays, setCancellationWindowDays] = useState("30");
  const [source, setSource] = useState<"verified_contract" | "supplier_provided" | "unconfirmed">("verified_contract");
  const [validUntil, setValidUntil] = useState("");

  function handleAdd() {
    if (!supplierId) return;
    const now = new Date().toISOString();
    startTransition(async () => {
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
      router.refresh();
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
      <button
        onClick={handleAdd}
        disabled={isPending}
        className="mt-3 rounded-sm bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-deep disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Add terms"}
      </button>
    </div>
  );
}
