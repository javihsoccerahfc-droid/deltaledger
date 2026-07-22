"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { addExchangeRateAction } from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";
import { InlineFeedback } from "@/components/shared/States";
import { Button } from "@/components/design-system/Button";

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
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const isSubmitting = useRef(false);

  function handleAdd() {
    if (isSubmitting.current) return;
    const parsed = Number(rate);
    if (!baseCurrency || !Number.isFinite(parsed) || parsed <= 0) {
      setFeedback({ type: "error", message: "Enter a valid, positive rate before saving." });
      return;
    }
    isSubmitting.current = true;
    startTransition(async () => {
      try {
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
        setFeedback({ type: "success", message: `Rate saved: ${baseCurrency} → USD at ${parsed} (${rateDate}).` });
        router.refresh();
      } catch (err) {
        setFeedback({ type: "error", message: err instanceof Error ? err.message : "Could not save this exchange rate." });
      } finally {
        isSubmitting.current = false;
      }
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
      <Button size="sm" className="mt-3" onClick={handleAdd} disabled={isPending}>
        {isPending ? "Saving…" : "Add rate"}
      </Button>
      {feedback && <InlineFeedback type={feedback.type} message={feedback.message} />}

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
