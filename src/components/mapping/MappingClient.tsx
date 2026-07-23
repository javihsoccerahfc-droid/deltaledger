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
  reviseMappingAction,
  revokeMappingAction,
} from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";
import { EmptyState, InlineFeedback } from "@/components/shared/States";
import { Button } from "@/components/design-system/Button";
import { Hero } from "@/components/design-system/Hero";
import { ReviewStatusBadge } from "@/components/shared/Badges";
import { canApproveCrosswalk } from "@/domains/deltaledger/crosswalk";

const HIGH_CONFIDENCE_THRESHOLD = 0.95;

/**
 * Phase 6B -- distinguishes a mapping that replaced an earlier decision (via Revise, Reconsider,
 * or Revoke -- see db/repositories/crosswalk.ts) from an original, freshly-generated suggestion.
 * Reuses the matchEvidence text those functions already write rather than adding a new column
 * or a second query -- the active row already carries everything needed to know its own lineage.
 */
function isRevisionEvidence(matchEvidence: string | null): boolean {
  return matchEvidence !== null && (matchEvidence.startsWith("Manual revision of a prior") || matchEvidence.startsWith("Revocation of a prior"));
}

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
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const canApprove = canApproveCrosswalk(currentUser);
  const unreviewed = crosswalks.filter((c) => c.reviewStatus === "unreviewed");
  const highConfidenceUnreviewed = unreviewed.filter((c) => c.confidence >= HIGH_CONFIDENCE_THRESHOLD);

  function handleGenerate() {
    startTransition(async () => {
      try {
        const created = await generateMappingSuggestionsAction(ecId, currentUser);
        setFeedback(
          created.length > 0
            ? { type: "success", message: `Generated ${created.length} new mapping suggestion(s).` }
            : { type: "success", message: "No new suggestions — every eligible part already has a mapping suggestion on file." }
        );
        router.refresh();
      } catch (err) {
        setFeedback({ type: "error", message: err instanceof Error ? err.message : "Could not generate mapping suggestions." });
      }
    });
  }

  function handleApprove(crosswalkId: string) {
    startTransition(async () => {
      const result = await approveMappingAction(ecId, crosswalkId, currentUser);
      setFeedback(result.success ? { type: "success", message: "Mapping approved." } : { type: "error", message: result.message });
      router.refresh();
    });
  }
  function handleReject(crosswalkId: string) {
    startTransition(async () => {
      const result = await rejectMappingAction(ecId, crosswalkId, currentUser);
      setFeedback(result.success ? { type: "success", message: "Mapping rejected." } : { type: "error", message: result.message });
      router.refresh();
    });
  }
  function handleBulkApprove() {
    startTransition(async () => {
      let firstError: string | null = null;
      let approvedCount = 0;
      for (const c of highConfidenceUnreviewed) {
        const result = await approveMappingAction(ecId, c.id, currentUser);
        if (result.success) approvedCount += 1;
        else if (!firstError) firstError = result.message;
      }
      setFeedback(
        firstError
          ? { type: "error", message: firstError }
          : { type: "success", message: `Approved ${approvedCount} high-confidence mapping(s).` }
      );
      router.refresh();
    });
  }
  function handleErpIdChange(crosswalkId: string, erpPartId: string) {
    startTransition(async () => {
      try {
        await setMappingErpIdAction(ecId, crosswalkId, erpPartId);
        router.refresh();
      } catch (err) {
        setFeedback({ type: "error", message: err instanceof Error ? err.message : "Could not update this ERP part number." });
      }
    });
  }
  function handleMappingTypeChange(crosswalkId: string, mappingType: Crosswalk["mappingType"]) {
    startTransition(async () => {
      try {
        await setMappingTypeAction(ecId, crosswalkId, mappingType);
        router.refresh();
      } catch (err) {
        setFeedback({ type: "error", message: err instanceof Error ? err.message : "Could not update the mapping type." });
      }
    });
  }
  function handleAllocationRuleChange(crosswalkId: string, method: string) {
    startTransition(async () => {
      try {
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
      } catch (err) {
        setFeedback({ type: "error", message: err instanceof Error ? err.message : "Could not update the allocation rule." });
      }
    });
  }

  const poLinePartNumberSet = new Set(poLinePartNumbers.map((p) => p.toUpperCase()));

  return (
    <div>
      <datalist id="po-line-part-numbers">
        {poLinePartNumbers.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <Hero
        eyebrow="MAPPING"
        tone={unreviewed.length > 0 ? "warning" : crosswalks.length === 0 ? "critical" : "success"}
        value={
          crosswalks.length === 0
            ? "No mappings generated yet"
            : unreviewed.length > 0
              ? `${unreviewed.length} mapping${unreviewed.length === 1 ? "" : "s"} need${unreviewed.length === 1 ? "s" : ""} review`
              : "All mappings approved and current"
        }
        supporting={
          <p>
            Only Part Data Owner or Admin may approve a mapping. No exposure may be classified without an approved mapping.
          </p>
        }
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={handleGenerate}
            disabled={eligiblePartIds.length === 0 || isPending}
            className="border-white/20 bg-white/10 text-white hover:border-white/30 hover:bg-white/20"
          >
            {isPending ? "Generating suggestions…" : "Generate mapping suggestions"}
          </Button>
        }
      />

      {!canApprove && (
        <div className="mt-4 rounded-sm border border-status-warning/30 bg-status-warningBg px-3 py-2 text-xs text-status-warning">
          You&apos;re viewing as <span className="font-semibold capitalize">{currentUser.role.replace(/_/g, " ")}</span> — this
          role cannot approve or reject mappings. Switch to Part Data Owner or Admin above.
        </div>
      )}
      {feedback && (
        <div
          className={`mt-3 rounded-sm border px-3 py-2 text-xs ${
            feedback.type === "success"
              ? "border-status-success/30 bg-status-successBg text-status-success"
              : "border-status-critical/30 bg-status-criticalBg text-status-critical"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {highConfidenceUnreviewed.length > 1 && canApprove && (
        <div className="mt-4 flex items-center justify-between rounded-md border border-accent/30 bg-accent-soft px-4 py-3">
          <p className="text-sm text-accent">
            {highConfidenceUnreviewed.length} mappings are exact or near-exact matches (
            {(HIGH_CONFIDENCE_THRESHOLD * 100).toFixed(0)}%+ confidence).
          </p>
          <Button size="sm" className="whitespace-nowrap" onClick={handleBulkApprove} disabled={isPending}>
            Approve all {highConfidenceUnreviewed.length} high-confidence matches
          </Button>
        </div>
      )}

      <div className="mt-5">
        {crosswalks.length === 0 ? (
          <EmptyState
            title="No part mappings yet"
            body="DeltaLedger calculates on the part number your ERP actually recognizes, not just the engineering part number — this is where that mapping gets confirmed before any dollar figure is trusted. Import BOMs and the open PO export, then generate mapping suggestions."
          />
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
                        disabled={c.reviewStatus !== "unreviewed"}
                        aria-label={c.reviewStatus === "unreviewed" ? "ERP part number" : "Current ERP part number (read-only)"}
                        list="po-line-part-numbers"
                        className="rounded-sm border border-line px-2 py-1 font-mono text-sm disabled:bg-paper"
                      />
                      <span
                        className={`rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${
                          confidencePct >= 95
                            ? "bg-status-successBg text-status-success"
                            : confidencePct >= 70
                              ? "bg-status-warningBg text-status-warning"
                              : "bg-status-criticalBg text-status-critical"
                        }`}
                      >
                        {confidencePct}% match
                      </span>
                      <span className="rounded-sm border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink-soft">
                        {c.matchMethod}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ReviewStatusBadge status={c.reviewStatus} />
                      {isRevisionEvidence(c.matchEvidence) && (
                        <span
                          className="rounded-sm border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink-soft"
                          title="This mapping replaced an earlier one -- see Audit Trail for the full history."
                        >
                          ↺ {c.matchEvidence?.startsWith("Revocation") ? "Revoked & replaced" : "Revised"}
                        </span>
                      )}
                    </div>
                  </div>

                  {!poLinePartNumberSet.has(c.erpPartId.toUpperCase()) && (
                    <p className="mt-1.5 text-xs text-status-warning">
                      &ldquo;{c.erpPartId}&rdquo; doesn&apos;t match any part number in the imported PO data — double-check this
                      mapping before approving.
                    </p>
                  )}

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
                        disabled={c.reviewStatus !== "unreviewed"}
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
                          disabled={c.reviewStatus !== "unreviewed"}
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

                  {(c.reviewStatus === "approved" || c.reviewStatus === "rejected") && canApprove && (
                    <RevisionControls ecId={ecId} crosswalk={c} currentUser={currentUser} onDone={() => router.refresh()} />
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

/**
 * Phase 6B -- the first user-facing surface for Phase 6A's supersession lifecycle. An
 * approved mapping is immutable, so "editing" it here never PATCHes the row in place -- Revise
 * and Revoke both call the same reviseCrosswalk/revokeCrosswalk repository functions that
 * create a new row and mark this one superseded (see db/repositories/crosswalk.ts). A rejected
 * mapping's only forward path is "Reconsider," which is the same revision mechanism producing
 * a newly-approved replacement.
 */
function RevisionControls({
  ecId,
  crosswalk,
  currentUser,
  onDone,
}: {
  ecId: string;
  crosswalk: Crosswalk;
  currentUser: ReturnType<typeof useDemoUser>["currentUser"];
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "revise" | "revoke">("idle");
  const [erpPartId, setErpPartId] = useState(crosswalk.erpPartId);
  const [mappingType, setMappingType] = useState(crosswalk.mappingType);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSaveRevision() {
    if (!reason.trim()) {
      setFeedback({ type: "error", message: "A reason is required -- this becomes part of the permanent audit trail." });
      return;
    }
    startTransition(async () => {
      const result = await reviseMappingAction(ecId, crosswalk.id, { erpPartId, mappingType }, reason.trim(), currentUser);
      if (result.success) onDone();
      else setFeedback({ type: "error", message: result.message });
    });
  }

  function handleConfirmRevoke() {
    if (!reason.trim()) {
      setFeedback({ type: "error", message: "A reason is required -- this becomes part of the permanent audit trail." });
      return;
    }
    startTransition(async () => {
      const result = await revokeMappingAction(ecId, crosswalk.id, reason.trim(), currentUser);
      if (result.success) onDone();
      else setFeedback({ type: "error", message: result.message });
    });
  }

  if (mode === "idle") {
    return (
      <div className="mt-3 flex gap-2">
        {crosswalk.reviewStatus === "approved" ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setMode("revise")}>
              Revise
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode("revoke")}>
              Revoke
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setMode("revise")}>
            Reconsider
          </Button>
        )}
      </div>
    );
  }

  if (mode === "revise") {
    return (
      <div className="mt-3 rounded-md border border-line bg-paper p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          {crosswalk.reviewStatus === "approved" ? "Revise this mapping" : "Reconsider this rejected mapping"}
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          This creates a new, approved mapping and marks the current one superseded -- it is never edited in place.
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={`revise-erp-${crosswalk.id}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
              ERP part number
            </label>
            <input
              id={`revise-erp-${crosswalk.id}`}
              value={erpPartId}
              onChange={(e) => setErpPartId(e.target.value)}
              className="mt-1 rounded-sm border border-line px-2 py-1.5 font-mono text-xs"
            />
          </div>
          <div>
            <label htmlFor={`revise-type-${crosswalk.id}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
              Mapping type
            </label>
            <select
              id={`revise-type-${crosswalk.id}`}
              value={mappingType}
              onChange={(e) => setMappingType(e.target.value as Crosswalk["mappingType"])}
              className="mt-1 rounded-sm border border-line px-2 py-1.5 text-xs"
            >
              <option value="one_to_one">One-to-one</option>
              <option value="one_to_many">One-to-many</option>
              <option value="many_to_one">Many-to-one</option>
            </select>
          </div>
          <div className="min-w-[220px] flex-1">
            <label htmlFor={`revise-reason-${crosswalk.id}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
              Reason (required)
            </label>
            <input
              id={`revise-reason-${crosswalk.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Corrected after supplier confirmation"
              className="mt-1 w-full rounded-sm border border-line px-2 py-1.5 text-xs"
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={handleSaveRevision} disabled={isPending}>
            {isPending ? "Saving…" : "Save revision"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode("idle")} disabled={isPending}>
            Cancel
          </Button>
        </div>
        {feedback && <InlineFeedback type={feedback.type} message={feedback.message} />}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-status-critical/30 bg-status-criticalBg p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-status-critical">Revoke this mapping</p>
      <p className="mt-1 text-xs text-ink">
        Use this when the mapping is wrong and there&apos;s no confirmed replacement yet. This part will report as unmapped starting with
        the next exposure calculation; everything already calculated remains exactly as valid as it is today.
      </p>
      <div className="mt-2">
        <label htmlFor={`revoke-reason-${crosswalk.id}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
          Reason (required)
        </label>
        <input
          id={`revoke-reason-${crosswalk.id}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Discovered this mapping was incorrect"
          className="mt-1 w-full max-w-md rounded-sm border border-line px-2 py-1.5 text-xs"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={handleConfirmRevoke} disabled={isPending}>
          {isPending ? "Revoking…" : "Confirm revoke"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setMode("idle")} disabled={isPending}>
          Cancel
        </Button>
      </div>
      {feedback && <InlineFeedback type={feedback.type} message={feedback.message} />}
    </div>
  );
}
