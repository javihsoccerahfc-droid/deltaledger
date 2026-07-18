"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addExchangeRateAction } from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";

export function ExchangeRateForm({
  currencies,
  existingRates,
}: {
  currencies: string[];
  existingRates: { id: string; baseCurrency: string; quoteCurrency: string; rate: number; rateDate: string }[];
}) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const [isPending, startTransition] = useTransition();
  const [baseCurrency, setBaseCurrency] = useState(currencies[0] ?? "");
  const [rate, setRate] = useState("1.00");
  const [rateDate, setRateDate] = useState(new Date().toISOString().slice(0, 10));

  function handleAdd() {
    const parsed = Number(rate);
    if (!baseCurrency || !Number.isFinite(parsed) || parsed <= 0) return;
    startTransition(async () => {
      await addExchangeRateAction(
        {
          baseCurrency,
          quoteCurrency: "USD",
          rate: parsed,
          rateDate,
          source: "manual entry",
          enteredBy: currentUser.id,
        },
        currentUser
      );
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-line bg-white p-4">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        <label className="text-xs">
          <span className="mb-1 block font-medium text-ink">From currency</span>
          <select
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value)}
            className="w-full rounded-sm border border-line px-2 py-1.5 text-xs"
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium text-ink">Rate to USD</span>
          <input
            type="number"
            step="0.0001"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-full rounded-sm border border-line px-2 py-1.5 text-xs"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium text-ink">Rate date</span>
          <input
            type="date"
            value={rateDate}
            onChange={(e) => setRateDate(e.target.value)}
            className="w-full rounded-sm border border-line px-2 py-1.5 text-xs"
          />
        </label>
      </div>
      <button
        onClick={handleAdd}
        disabled={isPending}
        className="mt-3 rounded-sm bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-deep disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Add rate"}
      </button>

      {existingRates.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-ink-soft">
          {existingRates.map((r) => (
            <div key={r.id}>
              {r.baseCurrency} → {r.quoteCurrency}: {r.rate} (as of {r.rateDate})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
