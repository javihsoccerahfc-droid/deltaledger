"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAlternateDemandSuggestionAction,
  approveAlternateDemandAction,
  rejectAlternateDemandAction,
  allocateAlternateDemandAction,
} from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";
import { EmptyState } from "@/components/shared/States";
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

  void eligibleDiffEntries;
  const canReview = canReviewAlternateDemand(currentUser);

  function handleCreate() {
    if (!partId.trim() || !qty) return;
    startTransition(async () => {
      await createAlternateDemandSuggestionAction(
        ecId,
        {
          partId: partId.trim(),
          quantityAvailableForOffset: Number(qty),
          sourceReference: reference.trim() || "Manually entered",
          demandSourceType: sourceType,
        },
        currentUser
      );
      setPartId("");
      setQty("");
      setReference("");
      router.refresh();
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

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Alternate Demand</h1>
        <p className="mt-1 text-sm text-ink-soft">
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

      <div className="mt-5 rounded-md border border-line bg-white p-4">
        <p className="mb-2 text-sm font-medium text-ink">Suggest an alternate-demand offset</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <input
            value={partId}
            onChange={(e) => setPartId(e.target.value)}
            placeholder="ERP part number"
            className="rounded-sm border border-line px-2 py-1.5 text-xs"
          />
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Qty available"
            className="rounded-sm border border-line px-2 py-1.5 text-xs"
          />
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as DemandSourceType)}
            className="rounded-sm border border-line px-2 py-1.5 text-xs"
          >
            <option value="unaffected_assembly">Unaffected assembly</option>
            <option value="existing_independent_demand">Existing independent demand</option>
            <option value="replacement_use">Replacement use</option>
            <option value="transferable_inventory">Transferable inventory</option>
            <option value="shared_commodity">Shared commodity</option>
          </select>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Source reference"
            className="rounded-sm border border-line px-2 py-1.5 text-xs sm:col-span-2"
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={isPending}
          className="mt-3 rounded-sm border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {isPending ? "Working…" : "Suggest"}
        </button>
      </div>

      <div className="mt-5">
        {records.length === 0 ? (
          <EmptyState title="No alternate-demand candidates yet" body="Suggest one above." />
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
        className="w-28 rounded-sm border border-line px-2 py-1"
      />
      <button
        onClick={handleAllocate}
        disabled={isPending}
        className="rounded-sm border border-line bg-white px-2 py-1 text-ink-soft hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {isPending ? "…" : "Allocate"}
      </button>
      {msg && <span className="text-ink-soft">{msg}</span>}
    </div>
  );
}
