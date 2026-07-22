"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createAlternateDemandSuggestionAction,
  approveAlternateDemandAction,
  rejectAlternateDemandAction,
  allocateAlternateDemandAction,
} from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";
import { EmptyState, InlineFeedback } from "@/components/shared/States";
import { Button } from "@/components/design-system/Button";
import { InfoHero } from "@/components/design-system/InfoHero";
import { SectionHeader } from "@/components/design-system/Typography";
import { ReviewStatusBadge } from "@/components/shared/Badges";
import { canReviewAlternateDemand } from "@/domains/deltaledger/alternateDemand/review";
import { DemandSourceType } from "@/domains/deltaledger/types";

interface AlternateDemandRecordRow {
  id: string;
  partId: string;
  demandSourceType: string;
  quantityAvailableForOffset: number;
  sourceReference: string | null;
  reviewStatus: "unreviewed" | "approved" | "rejected";
}
interface AllocationRow {
  id: string;
  alternateDemandRecordId: string;
  exposureRecordId: string;
  quantityAllocated: number;
  status: "active" | "reversed";
}
interface ExposureRecordRow {
  id: string;
  partId: string;
  netExposureValueReporting: number;
}
interface DiffEntry {
  id: string;
  partId: string;
}

export function AlternateDemandClient({
  ecId,
  records,
  allocations,
  exposureRecords,
  eligibleDiffEntries,
}: {
  ecId: string;
  records: AlternateDemandRecordRow[];
  allocations: AllocationRow[];
  exposureRecords: ExposureRecordRow[];
  eligibleDiffEntries: DiffEntry[];
}) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [partId, setPartId] = useState("");
  const [qty, setQty] = useState("");
  const [sourceType, setSourceType] = useState<DemandSourceType>("unaffected_assembly");
  const [reference, setReference] = useState("");
  const [createFeedback, setCreateFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const isSubmittingSuggestion = useRef(false);

  void eligibleDiffEntries;
  const canReview = canReviewAlternateDemand(currentUser);

  function handleCreate() {
    if (!partId.trim() || !qty) {
      setCreateFeedback({ type: "error", message: "Enter both a part number and a quantity before suggesting." });
      return;
    }
    if (isSubmittingSuggestion.current) return;
    isSubmittingSuggestion.current = true;
    const submittedPartId = partId.trim();
    startTransition(async () => {
      try {
        await createAlternateDemandSuggestionAction(
          ecId,
          {
            partId: submittedPartId,
            quantityAvailableForOffset: Number(qty),
            sourceReference: reference.trim() || "Manually entered",
            demandSourceType: sourceType,
          },
          currentUser
        );
        setCreateFeedback({ type: "success", message: `Suggested ${qty} unit(s) of ${submittedPartId} as alternate demand.` });
        setPartId("");
        setQty("");
        setReference("");
        router.refresh();
      } catch (err) {
        setCreateFeedback({ type: "error", message: err instanceof Error ? err.message : "Could not save this suggestion." });
      } finally {
        isSubmittingSuggestion.current = false;
      }
    });
  }

  function handleApprove(id: string) {
    startTransition(async () => {
      const result = await approveAlternateDemandAction(ecId, id, currentUser);
      setError(result.success ? null : result.message);
      router.refresh();
    });
  }
  function handleReject(id: string) {
    startTransition(async () => {
      const result = await rejectAlternateDemandAction(ecId, id, currentUser);
      setError(result.success ? null : result.message);
      router.refresh();
    });
  }

  const activeAllocations = allocations.filter((a) => a.status === "active");
  const totalOffsetQty = activeAllocations.reduce((s, a) => s + a.quantityAllocated, 0);
  const unreviewedCount = records.filter((r) => r.reviewStatus === "unreviewed").length;

  return (
    <div>
      <InfoHero
        eyebrow="ALTERNATE DEMAND"
        value={totalOffsetQty === 0 ? "No alternate demand confirmed yet" : `${totalOffsetQty.toLocaleString()} units offsetting exposure`}
        supporting={unreviewedCount > 0 ? `${unreviewedCount} suggestion${unreviewedCount === 1 ? "" : "s"} awaiting review.` : undefined}
      />

      <div className="mt-4">
        <p className="text-sm text-ink-soft">
          Suggestions are inert until approved by <span className="font-semibold">Supply Chain Manager</span> or{" "}
          <span className="font-semibold">Admin</span>. Neither a buyer nor a part data owner may approve their own
          offset.
        </p>
      </div>

      {!canReview && (
        <div className="mt-4 rounded-sm border border-status-warning/30 bg-status-warningBg px-3 py-2 text-xs text-status-warning">
          You&apos;re viewing as <span className="font-semibold capitalize">{currentUser.role.replace(/_/g, " ")}</span> — this
          role cannot approve alternate demand. Switch to Supply Chain Manager or Admin above.
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-sm border border-status-critical/30 bg-status-criticalBg px-3 py-2 text-xs text-status-critical">
          {error}
        </div>
      )}

      <div className="mt-5 rounded-md border border-line bg-white p-5">
        <SectionHeader>Suggest an alternate-demand offset</SectionHeader>
        <p className="mt-1 text-xs text-ink-soft">
          Identify inventory that can cover this part&apos;s exposure instead of letting it go to waste — from
          an unaffected assembly, existing independent demand, or another approved source.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div>
            <label htmlFor="alt-demand-part" className="block text-[11px] uppercase tracking-wide text-ink-soft">
              ERP part number
            </label>
            <input
              id="alt-demand-part"
              value={partId}
              onChange={(e) => setPartId(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label htmlFor="alt-demand-qty" className="block text-[11px] uppercase tracking-wide text-ink-soft">
              Qty available
            </label>
            <input
              id="alt-demand-qty"
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label htmlFor="alt-demand-source" className="block text-[11px] uppercase tracking-wide text-ink-soft">
              Source
            </label>
            <select
              id="alt-demand-source"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as DemandSourceType)}
              className="mt-1 w-full rounded-sm border border-line px-2 py-1.5 text-xs"
            >
              <option value="unaffected_assembly">Unaffected assembly</option>
              <option value="existing_independent_demand">Existing independent demand</option>
              <option value="replacement_use">Replacement use</option>
              <option value="transferable_inventory">Transferable inventory</option>
              <option value="shared_commodity">Shared commodity</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="alt-demand-reference" className="block text-[11px] uppercase tracking-wide text-ink-soft">
              Source reference
            </label>
            <input
              id="alt-demand-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line px-2 py-1.5 text-xs"
            />
          </div>
        </div>
        <Button size="sm" className="mt-4" onClick={handleCreate} disabled={isPending}>
          {isPending ? "Suggesting…" : "Suggest"}
        </Button>
        {createFeedback && <InlineFeedback type={createFeedback.type} message={createFeedback.message} />}
      </div>

      <div className="mt-5">
        {records.length === 0 ? (
          <EmptyState
            title="No alternate demand tracked yet"
            body="If inventory, another project, or a substitute part can absorb some of this quantity, record it here — it nets directly against exposure instead of leaving the full committed value on the books. Use the form above to suggest one."
          />
        ) : (
          <div className="space-y-3">
            {records.map((record) => {
              const relatedExposures = exposureRecords.filter((e) => e.partId.toUpperCase() === record.partId.toUpperCase());
              const recordAllocations = allocations.filter((a) => a.alternateDemandRecordId === record.id && a.status === "active");
              const allocatedTotal = recordAllocations.reduce((s, a) => s + a.quantityAllocated, 0);
              const remaining = record.quantityAvailableForOffset - allocatedTotal;
              return (
                <div key={record.id} className="rounded-md border border-line bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-mono font-medium text-ink">{record.partId}</span>
                      <span className="ml-2 text-ink-soft">
                        {record.quantityAvailableForOffset} units available ({remaining} remaining) —{" "}
                        {record.demandSourceType.replace(/_/g, " ")}
                      </span>
                      <p className="text-xs text-ink-soft">{record.sourceReference}</p>
                    </div>
                    <ReviewStatusBadge status={record.reviewStatus} />
                  </div>

                  {record.reviewStatus === "unreviewed" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleApprove(record.id)}
                        disabled={!canReview || isPending}
                        className="rounded-sm border border-status-success/30 bg-status-successBg px-3 py-1.5 text-xs font-medium text-status-success disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(record.id)}
                        disabled={!canReview || isPending}
                        className="rounded-sm border border-status-critical/30 bg-status-criticalBg px-3 py-1.5 text-xs font-medium text-status-critical disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {record.reviewStatus === "approved" && relatedExposures.length > 0 && remaining > 0 && (
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="mb-1.5 text-xs font-medium text-ink">Allocate to an exposure record</p>
                      {relatedExposures.map((exp) => (
                        <AllocateRow
                          key={exp.id}
                          ecId={ecId}
                          recordId={record.id}
                          exposureRecordId={exp.id}
                          label={`${exp.partId} — net exposure $${exp.netExposureValueReporting.toLocaleString()}`}
                          maxQty={remaining}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AllocateRow({
  ecId,
  recordId,
  exposureRecordId,
  label,
  maxQty,
}: {
  ecId: string;
  recordId: string;
  exposureRecordId: string;
  label: string;
  maxQty: number;
}) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const [qty, setQty] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAllocate() {
    startTransition(async () => {
      const result = await allocateAlternateDemandAction(ecId, recordId, exposureRecordId, Number(qty), currentUser);
      setMsg(result.success ? "Allocated. Recalculate exposure to see the updated net value." : result.message ?? "Failed.");
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-paper px-2.5 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <span className="font-medium text-ink">{label}</span>
        <span className="ml-2 text-ink-soft">(max {maxQty})</span>
      </div>
      <input
        type="number"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="Qty to allocate"
        aria-label="Qty to allocate"
        className="w-28 rounded-sm border border-line px-2 py-1"
      />
      <Button variant="secondary" size="sm" onClick={handleAllocate} disabled={isPending}>
        {isPending ? "Allocating…" : "Allocate"}
      </Button>
      {msg && <span className="text-ink-soft">{msg}</span>}
    </div>
  );
}
