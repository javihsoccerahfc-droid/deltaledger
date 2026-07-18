"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateMappingSuggestionsAction,
  setMappingErpIdAction,
  setMappingTypeAction,
  setAllocationRuleAction,
  approveMappingAction,
  rejectMappingAction,
} from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";
import { EmptyState } from "@/components/shared/States";
import { ReviewStatusBadge } from "@/components/shared/Badges";
import { canApproveCrosswalk } from "@/domains/deltaledger/crosswalk";

const HIGH_CONFIDENCE_THRESHOLD = 0.95;

interface Crosswalk {
  id: string;
  plmPartId: string;
  erpPartId: string;
  matchMethod: string;
  confidence: number;
  matchEvidence: string | null;
  reviewStatus: "unreviewed" | "approved" | "rejected";
  mappingType: "one_to_one" | "one_to_many" | "many_to_one";
}
interface AllocationRule {
  id: string;
  crosswalkId: string;
  method: string;
}

export function MappingClient({
  ecId,
  crosswalks,
  allocationRules,
  eligiblePartIds,
  poLinePartNumbers,
}: {
  ecId: string;
  crosswalks: Crosswalk[];
  allocationRules: AllocationRule[];
  eligiblePartIds: string[];
  poLinePartNumbers: string[];
}) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canApprove = canApproveCrosswalk(currentUser);
  const unreviewed = crosswalks.filter((c) => c.reviewStatus === "unreviewed");
  const highConfidenceUnreviewed = unreviewed.filter((c) => c.confidence >= HIGH_CONFIDENCE_THRESHOLD);

  function handleGenerate() {
    startTransition(async () => {
      await generateMappingSuggestionsAction(ecId, currentUser);
      router.refresh();
    });
  }

  function handleApprove(crosswalkId: string) {
    startTransition(async () => {
      const result = await approveMappingAction(ecId, crosswalkId, currentUser);
      setError(result.success ? null : result.message);
      router.refresh();
    });
  }
  function handleReject(crosswalkId: string) {
    startTransition(async () => {
      const result = await rejectMappingAction(ecId, crosswalkId, currentUser);
      setError(result.success ? null : result.message);
      router.refresh();
    });
  }
  function handleBulkApprove() {
    startTransition(async () => {
      let firstError: string | null = null;
      for (const c of highConfidenceUnreviewed) {
        const result = await approveMappingAction(ecId, c.id, currentUser);
        if (!result.success && !firstError) firstError = result.message;
      }
      setError(firstError);
      router.refresh();
    });
  }
  function handleErpIdChange(crosswalkId: string, erpPartId: string) {
    startTransition(async () => {
      await setMappingErpIdAction(ecId, crosswalkId, erpPartId);
      router.refresh();
    });
  }
  function handleMappingTypeChange(crosswalkId: string, mappingType: Crosswalk["mappingType"]) {
    startTransition(async () => {
      await setMappingTypeAction(ecId, crosswalkId, mappingType);
      router.refresh();
    });
  }
  function handleAllocationRuleChange(crosswalkId: string, method: string) {
    startTransition(async () => {
      await setAllocationRuleAction(ecId, crosswalkId, {
        method: method as "fixed_quantity" | "percentage" | "plant_specific" | "supplier_specific" | "manual",
        plantCode: null,
        supplierId: null,
        fixedQuantity: null,
        percentage: method === "percentage" ? 100 : null,
        notes: null,
        effectiveDate: new Date().toISOString().slice(0, 10),
      });
      router.refresh();
    });
  }

  void poLinePartNumbers;

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">PLM-to-ERP Part Mapping</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Only <span className="font-semibold">Part Data Owner</span> or <span className="font-semibold">Admin</span> may
            approve a mapping. No exposure may be classified without an approved mapping.
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={eligiblePartIds.length === 0 || isPending}
          className="rounded-sm border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {isPending ? "Working…" : "Generate mapping suggestions"}
        </button>
      </div>

      {!canApprove && (
        <div className="mt-4 rounded-sm border border-status-warning/30 bg-status-warningBg px-3 py-2 text-xs text-status-warning">
          You&apos;re viewing as <span className="font-semibold capitalize">{currentUser.role.replace(/_/g, " ")}</span> — this
          role cannot approve or reject mappings. Switch to Part Data Owner or Admin above.
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-sm border border-status-critical/30 bg-status-criticalBg px-3 py-2 text-xs text-status-critical">
          {error}
        </div>
      )}

      {highConfidenceUnreviewed.length > 1 && canApprove && (
        <div className="mt-4 flex items-center justify-between rounded-md border border-accent/30 bg-accent-soft px-4 py-3">
          <p className="text-sm text-accent">
            {highConfidenceUnreviewed.length} mappings are exact or near-exact matches (
            {(HIGH_CONFIDENCE_THRESHOLD * 100).toFixed(0)}%+ confidence).
          </p>
          <button
            onClick={handleBulkApprove}
            disabled={isPending}
            className="whitespace-nowrap rounded-sm bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-deep"
          >
            Approve all {highConfidenceUnreviewed.length} high-confidence matches
          </button>
        </div>
      )}

      <div className="mt-5">
        {crosswalks.length === 0 ? (
          <EmptyState title="No mapping suggestions yet" body="Import BOMs and the open PO export, then generate mapping suggestions." />
        ) : (
          <div className="space-y-3">
            {crosswalks.map((c) => {
              const rules = allocationRules.filter((r) => r.crosswalkId === c.id);
              const confidencePct = Math.round(c.confidence * 100);
              const barColor =
                confidencePct >= 95 ? "bg-status-success" : confidencePct >= 70 ? "bg-status-warning" : "bg-status-critical";
              return (
                <div key={c.id} className="rounded-md border border-line bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-mono font-medium text-ink">{c.plmPartId}</span>
                      <span className="text-ink-soft">→</span>
                      <input
                        defaultValue={c.erpPartId}
                        onBlur={(e) => e.target.value !== c.erpPartId && handleErpIdChange(c.id, e.target.value)}
                        disabled={c.reviewStatus === "approved"}
                        className="rounded-sm border border-line px-2 py-1 font-mono text-sm disabled:bg-paper"
                      />
                      <span className="rounded-sm border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink-soft">
                        {c.matchMethod}
                      </span>
                    </div>
                    <ReviewStatusBadge status={c.reviewStatus} />
                  </div>

                  {c.matchEvidence && <p className="mt-1.5 text-xs text-ink-soft">{c.matchEvidence}</p>}

                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-paper">
                      <div className={`h-full ${barColor}`} style={{ width: `${confidencePct}%` }} />
                    </div>
                    <span className="text-xs text-ink-soft">{confidencePct}% match confidence</span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5">
                      <span className="text-ink-soft">Mapping type</span>
                      <select
                        value={c.mappingType}
                        disabled={c.reviewStatus === "approved"}
                        onChange={(e) => handleMappingTypeChange(c.id, e.target.value as Crosswalk["mappingType"])}
                        className="rounded-sm border border-line px-2 py-1 disabled:bg-paper"
                      >
                        <option value="one_to_one">One-to-one</option>
                        <option value="one_to_many">One-to-many</option>
                        <option value="many_to_one">Many-to-one</option>
                      </select>
                    </label>

                    {c.mappingType !== "one_to_one" && (
                      <>
                        <span className="text-ink-soft">Allocation rule:</span>
                        <select
                          value={rules[0]?.method ?? "manual"}
                          disabled={c.reviewStatus === "approved"}
                          onChange={(e) => handleAllocationRuleChange(c.id, e.target.value)}
                          className="rounded-sm border border-line px-2 py-1 disabled:bg-paper"
                        >
                          <option value="fixed_quantity">Fixed quantity</option>
                          <option value="percentage">Percentage</option>
                          <option value="plant_specific">Plant-specific</option>
                          <option value="supplier_specific">Supplier-specific</option>
                          <option value="manual">Manual</option>
                        </select>
                        {!rules[0] && (
                          <span className="text-status-critical">
                            No allocation rule set yet — exposure will be Unresolved until one is added.
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {c.reviewStatus === "unreviewed" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleApprove(c.id)}
                        disabled={!canApprove || isPending}
                        className="rounded-sm border border-status-success/30 bg-status-successBg px-3 py-1.5 text-xs font-medium text-status-success disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(c.id)}
                        disabled={!canApprove || isPending}
                        className="rounded-sm border border-status-critical/30 bg-status-criticalBg px-3 py-1.5 text-xs font-medium text-status-critical disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Reject
                      </button>
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
