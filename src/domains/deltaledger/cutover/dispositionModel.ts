/**
 * DeltaLedger V3 -- the Cutover Simulator, a permanent product capability.
 *
 * Nova Robotics is the first dataset this capability runs against, not what it's built for.
 * `CutoverScenarioDataset` below is deliberately dataset-agnostic: it describes what ANY
 * cutover calculation needs -- burn rate, on-hand stock, WIP, affected-part purchase order
 * batches, and supplier disposition terms -- for whichever engineering change it's evaluating.
 * `NOVA_ROBOTICS_DATASET` further down is one named instance of that shape, not a type of its
 * own. When a real customer's inventory/WIP data has a real persistence layer to read from
 * (a genuinely larger, separately-scoped feature -- see the V3 design review's decision not to
 * add that persistence for this demo), `loadCutoverScenarioDataset()` at the bottom of this
 * file is the one seam that changes; the calculation engine itself does not.
 *
 * Pure, DB-free calculation of what a candidate cutover week costs against a fixed operational
 * dataset (see the Master Specification, Section 4, for the Nova Robotics figures specifically).
 * This is deliberately separate from calculateExposure.ts: that function computes exposure for
 * REAL, persisted PO lines that have passed through crosswalk approval and allocation
 * resolution; this function computes a disposition (scrap, spares reservation, rework, PO
 * cancellation-fee tiers, conversion costs) against operational facts that don't have a
 * crosswalk or allocation concept at all.
 *
 * Nothing here is persisted by this calculation itself -- the same "exploratory, never saved to
 * history" rule the existing Scenario Explorer (scenarioAssumptions.ts / scenarioComparison.ts)
 * already follows for its own what-if runs.
 *
 * Supplier fee tiers and every other operational fact are DATA passed into this module, never
 * hardcoded as branching logic inside the calculation -- the same separation cancellationStatus.ts
 * already keeps between a contractual term and the calculation that consumes it.
 *
 * This file also owns the plain-language strategy narrative (what a separate cutoverNarrative.ts
 * would otherwise contain) -- it has exactly one caller, the Cutover Simulator screen, so it
 * lives here rather than in a sibling file that exists only to have a name.
 */

// ---------------------------------------------------------------------------
// Canonical dataset shape and the one fixed Nova Robotics instance of it.
// ---------------------------------------------------------------------------

export interface PcbaBatch {
  id: string;
  quantity: number;
  dueWeek: number;
}

export interface SupplierCancellationTier {
  /** Notice (in days, from the Week-0 decision point to the batch's due date) required to
   *  qualify for this tier's fee percentage. Tiers are evaluated highest-threshold-first. */
  minNoticeDays: number;
  feePercent: number; // 0.10 = 10% of batch value
}

export interface CutoverScenarioDataset {
  burnRatePerWeek: number;

  onHandPcbaUnits: number;
  onHandPcbaUnitCost: number;
  onHandHarnessUnits: number;
  onHandHarnessUnitCost: number;

  wipUnits: number;
  wipSunkCostPerUnit: number;
  wipReworkLaborPerUnit: number;

  pcbaBatches: PcbaBatch[]; // PO-3301, in due-week order
  pcbaSupplierName: string;
  pcbaSupplierCancellationTiers: SupplierCancellationTier[]; // sorted descending by minNoticeDays
  /** Notice below every tier's threshold -- the batch cannot be cancelled at all. */
  pcbaNonCancellableFeePercent: number;

  harnessPoQuantity: number; // PO-3302
  harnessPoDueWeek: number;
  harnessSupplierName: string;
  harnessConversionFlatFee: number; // one-time re-spec fee to convert an open harness PO
  harnessConversionPerUnitDelta: number; // Rev 2 unit cost - Rev 1 unit cost

  /** All-in cost to convert already-received Rev 1 harness stock (on-hand or delivered-but-
   *  unused PO stock) to Rev 2 spec -- distinct from harnessConversionFlatFee, which is a
   *  supplier PO re-spec fee, not a physical-rework cost. */
  harnessOnHandConversionPerUnit: number;

  fieldServiceSparesReserveCap: number;

  expeditePremiumPerUnit: number;
  newPcbaLeadTimeWeeks: number;

  /** Estimated (not known) future service cost per unit fielded with the thermal-throttling
   *  defect. Always surfaced with "estimated" confidence -- never claimed as a known figure. */
  warrantyEstimatePerUnit: number;
}

export const NOVA_ROBOTICS_DATASET: CutoverScenarioDataset = {
  burnRatePerWeek: 25,

  onHandPcbaUnits: 180,
  onHandPcbaUnitCost: 140,
  onHandHarnessUnits: 220,
  onHandHarnessUnitCost: 22,

  wipUnits: 40,
  wipSunkCostPerUnit: 312,
  wipReworkLaborPerUnit: 45,

  pcbaBatches: [
    { id: "PO-3301-B1", quantity: 200, dueWeek: 2 },
    { id: "PO-3301-B2", quantity: 200, dueWeek: 6 },
    { id: "PO-3301-B3", quantity: 100, dueWeek: 10 },
  ],
  pcbaSupplierName: "Sunrise Electronics",
  pcbaSupplierCancellationTiers: [
    { minNoticeDays: 45, feePercent: 0.1 },
    { minNoticeDays: 15, feePercent: 0.3 },
  ],
  pcbaNonCancellableFeePercent: 1.0,

  harnessPoQuantity: 600,
  harnessPoDueWeek: 3,
  harnessSupplierName: "Harness Works",
  harnessConversionFlatFee: 500,
  harnessConversionPerUnitDelta: 4,
  harnessOnHandConversionPerUnit: 6,

  fieldServiceSparesReserveCap: 50,

  expeditePremiumPerUnit: 30,
  newPcbaLeadTimeWeeks: 6,

  warrantyEstimatePerUnit: 35,
};

// ---------------------------------------------------------------------------
// Visitor-adjustable inputs (Master Specification Section 8 -- exactly four controls).
// ---------------------------------------------------------------------------

export interface CutoverSimulationInputs {
  /** 0 = Immediate Cutover ... up to the full run-out week (supply-exhaustion point). */
  cutoverWeek: number;
  wipReworkEnabled: boolean;
  /** 0..dataset.fieldServiceSparesReserveCap */
  sparesReserveQty: number;
  harnessConvertEnabled: boolean;
}

export const DEFAULT_SIMULATION_INPUTS = (dataset: CutoverScenarioDataset = NOVA_ROBOTICS_DATASET): CutoverSimulationInputs => ({
  cutoverWeek: 8,
  wipReworkEnabled: true,
  sparesReserveQty: dataset.fieldServiceSparesReserveCap,
  harnessConvertEnabled: true,
});

// ---------------------------------------------------------------------------
// Output shape.
// ---------------------------------------------------------------------------

export type LineItemCategory =
  | "realized_loss"
  | "cancellation_penalty"
  | "mitigated_cost"
  | "reclassification"
  | "new_cost"
  | "estimated_risk";

/**
 * Source-honesty tag (Master Specification Section 10 / source-honesty rules). Every figure
 * this engine produces derives from the fixed NOVA_ROBOTICS_DATASET, not a live database
 * join -- even the PO-batch cancellation lines, which describe the same PO-3301/PO-3302 that
 * really do exist as persisted PurchaseOrderLine rows, are calculated against the scenario's
 * own batch/term description, not a live read of those rows. Only the real, persisted
 * ExposureRecord baseline (surfaced separately by the Server Action, never by this engine) is
 * "persisted_evidence" -- everything this function returns is one of the categories below, and
 * the UI must never blend the two without saying which is which.
 */
export type LineItemProvenance =
  | "scenario_seeded_inventory"
  | "scenario_seeded_wip"
  | "scenario_seeded_po_terms"
  | "calculated_disposition_outcome";

export interface DispositionLineItem {
  id: string;
  label: string;
  formula: string;
  amount: number; // 0 for pure reclassifications (spares reserve), which are not a cost
  category: LineItemCategory;
  confidence: "known" | "estimated";
  provenance: LineItemProvenance;
}

export interface PcbaBatchDisposition {
  batchId: string;
  dueWeek: number;
  quantity: number;
  /** Units consumed in production before cutover (this batch was needed and delivered). */
  consumedQuantity: number;
  /** Units received but not consumed -- becomes excess at cutover, same disposition as on-hand. */
  leftoverQuantity: number;
  /** Units never delivered because the batch was cancelled before its due date. */
  cancelledQuantity: number;
  noticeDays: number | null; // null when the batch was fully needed/kept, not cancelled
  cancellationFeePercent: number | null;
}

export interface CutoverStrategyName {
  kind: "immediate" | "controlled_run_out" | "optimized_phased" | "custom";
}

export interface DispositionResult {
  cutoverWeek: number;
  strategy: CutoverStrategyName;
  maxRunOutWeek: number;

  defectiveUnitsFielded: number;

  pcbaBatchDispositions: PcbaBatchDisposition[];
  harnessLeftoverAfterCutover: number;
  harnessPoConsumedQuantity: number;
  harnessPoLeftoverQuantity: number;

  lineItems: DispositionLineItem[];
  netExposure: number;
  knownExposure: number;
  estimatedExposure: number;

  narrative: string;
}

// ---------------------------------------------------------------------------
// Calculation.
// ---------------------------------------------------------------------------

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function resolvePcbaCancellationFeePercent(noticeDays: number, dataset: CutoverScenarioDataset): number {
  const tiersDescending = [...dataset.pcbaSupplierCancellationTiers].sort((a, b) => b.minNoticeDays - a.minNoticeDays);
  for (const tier of tiersDescending) {
    if (noticeDays >= tier.minNoticeDays) return tier.feePercent;
  }
  return dataset.pcbaNonCancellableFeePercent;
}

function classifyStrategy(cutoverWeek: number, maxRunOutWeek: number): CutoverStrategyName {
  if (cutoverWeek <= 0) return { kind: "immediate" };
  if (cutoverWeek >= maxRunOutWeek - 1e-9) return { kind: "controlled_run_out" };
  if (Math.abs(cutoverWeek - 8) < 1e-9) return { kind: "optimized_phased" };
  return { kind: "custom" };
}

/**
 * The full disposition calculation for one candidate cutover week, deterministic over the fixed
 * Nova Robotics dataset and the four visitor-adjustable inputs. Same inputs always produce the
 * same output -- no randomness, no hidden state.
 */
export function computeCutoverDisposition(
  inputs: CutoverSimulationInputs,
  dataset: CutoverScenarioDataset = NOVA_ROBOTICS_DATASET
): DispositionResult {
  const { burnRatePerWeek } = dataset;
  const cutoverWeek = Math.max(0, inputs.cutoverWeek);
  const totalPcbaSupply = dataset.onHandPcbaUnits + dataset.pcbaBatches.reduce((sum, b) => sum + b.quantity, 0);
  const maxRunOutWeek = totalPcbaSupply / burnRatePerWeek;
  const strategy = classifyStrategy(cutoverWeek, maxRunOutWeek);

  const need = burnRatePerWeek * cutoverWeek;

  // --- PCBA: on-hand consumption, then batches in due-week order (FIFO). ---
  const onHandUsed = Math.min(dataset.onHandPcbaUnits, need);
  let remainingNeed = need - onHandUsed;
  const onHandLeftover = dataset.onHandPcbaUnits - onHandUsed;

  const isActiveCutover = cutoverWeek < maxRunOutWeek - 1e-9;

  const pcbaBatchDispositions: PcbaBatchDisposition[] = [];
  const lineItems: DispositionLineItem[] = [];
  let defectiveUnitsFielded = onHandUsed;

  for (const batch of [...dataset.pcbaBatches].sort((a, b) => a.dueWeek - b.dueWeek)) {
    if (remainingNeed > 1e-9) {
      // Needed -- kept. Consumed only if it will have been delivered by cutover.
      const delivered = batch.dueWeek <= cutoverWeek + 1e-9;
      const consumedQuantity = delivered ? Math.min(batch.quantity, remainingNeed) : 0;
      remainingNeed -= consumedQuantity;
      const leftoverQuantity = delivered ? batch.quantity - consumedQuantity : 0;
      defectiveUnitsFielded += consumedQuantity;
      pcbaBatchDispositions.push({
        batchId: batch.id,
        dueWeek: batch.dueWeek,
        quantity: batch.quantity,
        consumedQuantity,
        leftoverQuantity,
        cancelledQuantity: 0,
        noticeDays: null,
        cancellationFeePercent: null,
      });
    } else if (isActiveCutover) {
      // Not needed for this cutover window, and we are proactively cutting over before natural
      // supply exhaustion -- this batch is a real cancellation decision made at Week 0.
      const noticeDays = batch.dueWeek * 7;
      const feePercent = resolvePcbaCancellationFeePercent(noticeDays, dataset);
      const penalty = batch.quantity * dataset.onHandPcbaUnitCost * feePercent;
      const nonCancellable = feePercent >= dataset.pcbaNonCancellableFeePercent;
      pcbaBatchDispositions.push({
        batchId: batch.id,
        dueWeek: batch.dueWeek,
        quantity: batch.quantity,
        consumedQuantity: 0,
        leftoverQuantity: 0,
        cancelledQuantity: batch.quantity,
        noticeDays,
        cancellationFeePercent: feePercent,
      });
      lineItems.push({
        id: `pcba-${batch.id}`,
        label: nonCancellable
          ? `${dataset.pcbaSupplierName} — ${batch.id} (${batch.quantity} units, non-cancellable at ${noticeDays} days' notice)`
          : `${dataset.pcbaSupplierName} — ${batch.id} (${batch.quantity} units, ${Math.round(feePercent * 100)}% cancellation tier at ${noticeDays} days' notice)`,
        formula: `${batch.quantity} × ${money(dataset.onHandPcbaUnitCost)} × ${Math.round(feePercent * 100)}%`,
        amount: penalty,
        category: nonCancellable ? "realized_loss" : "cancellation_penalty",
        confidence: "known",
        provenance: "scenario_seeded_po_terms",
      });
    } else {
      // Full run-out: every batch is genuinely needed eventually and this branch is
      // unreachable in practice (remainingNeed only stays 0 once total supply is exhausted,
      // which is exactly the run-out boundary) -- kept for completeness/defensiveness.
      pcbaBatchDispositions.push({
        batchId: batch.id,
        dueWeek: batch.dueWeek,
        quantity: batch.quantity,
        consumedQuantity: batch.quantity,
        leftoverQuantity: 0,
        cancelledQuantity: 0,
        noticeDays: null,
        cancellationFeePercent: null,
      });
      defectiveUnitsFielded += batch.quantity;
    }
  }

  // --- PCBA excess disposition: on-hand leftover + any kept-batch leftover, pooled. ---
  const totalExcessPcba = onHandLeftover + pcbaBatchDispositions.reduce((sum, b) => sum + b.leftoverQuantity, 0);
  const sparesReserveQty = Math.min(Math.max(0, inputs.sparesReserveQty), dataset.fieldServiceSparesReserveCap, totalExcessPcba);
  const scrapQty = totalExcessPcba - sparesReserveQty;

  if (sparesReserveQty > 0) {
    lineItems.push({
      id: "pcba-spares-reserve",
      label: `Reserve ${sparesReserveQty} unit(s) of on-hand PCBA Rev B as field-service spares`,
      formula: `${sparesReserveQty} × ${money(dataset.onHandPcbaUnitCost)} reclassified as asset, not scrapped`,
      amount: 0,
      category: "reclassification",
      confidence: "known",
      provenance: "scenario_seeded_inventory",
    });
  }
  if (scrapQty > 0) {
    lineItems.push({
      id: "pcba-scrap",
      label: `Scrap ${scrapQty} unit(s) of excess PCBA Rev B`,
      formula: `${scrapQty} × ${money(dataset.onHandPcbaUnitCost)}`,
      amount: scrapQty * dataset.onHandPcbaUnitCost,
      category: "realized_loss",
      confidence: "known",
      provenance: "scenario_seeded_inventory",
    });
  }

  // --- WIP: rework vs. naive scrap, only when actively cutting over before natural run-out. ---
  if (isActiveCutover) {
    if (inputs.wipReworkEnabled) {
      const scrappedPcba = dataset.wipUnits * dataset.onHandPcbaUnitCost;
      const harnessConv = dataset.wipUnits * dataset.harnessOnHandConversionPerUnit;
      const labor = dataset.wipUnits * dataset.wipReworkLaborPerUnit;
      lineItems.push({
        id: "wip-rework",
        label: `Rework ${dataset.wipUnits} WIP unit(s): scrap installed Rev B PCBA, convert harness, install Rev C parts`,
        formula: `${dataset.wipUnits} × ${money(dataset.onHandPcbaUnitCost)} (scrapped PCBA) + ${dataset.wipUnits} × ${money(dataset.harnessOnHandConversionPerUnit)} (harness) + ${dataset.wipUnits} × ${money(dataset.wipReworkLaborPerUnit)} (labor)`,
        amount: scrappedPcba + harnessConv + labor,
        category: "mitigated_cost",
        confidence: "known",
        provenance: "scenario_seeded_wip",
      });
    } else {
      lineItems.push({
        id: "wip-scrap",
        label: `Scrap ${dataset.wipUnits} WIP unit(s) outright`,
        formula: `${dataset.wipUnits} × ${money(dataset.wipSunkCostPerUnit)}`,
        amount: dataset.wipUnits * dataset.wipSunkCostPerUnit,
        category: "realized_loss",
        confidence: "known",
        provenance: "scenario_seeded_wip",
      });
    }
  } else {
    // Full run-out: WIP is not actively dispositioned and simply flows through as finished
    // Rev-B-config goods. Its material was already drawn from the same on-hand/PO pool being
    // counted via onHandUsed/batch consumption above, so it is deliberately NOT added again
    // here -- doing so would double-count these 40 units against the canonical Controlled
    // Run-Out figure of 680 defective units fielded (see Master Specification Section 5).
  }

  // --- Harness: needed-or-cancelled is decided at Week 0, exactly like the PCBA batches above
  //     -- NOT by whether PO-3302's due date happens to fall before or after the cutover week.
  //     If on-hand alone covers the need, PO-3302 is never placed into service at all and is
  //     cancelled/converted at Week 0 regardless of its natural due date. ---
  const harnessOnHandUsed = Math.min(dataset.onHandHarnessUnits, need);
  const harnessOnHandLeftover = dataset.onHandHarnessUnits - harnessOnHandUsed;
  const harnessRemainingNeed = need - harnessOnHandUsed;
  const harnessPoNeeded = harnessRemainingNeed > 1e-9;
  const harnessPoDelivered = dataset.harnessPoDueWeek <= cutoverWeek + 1e-9;

  const harnessPoConsumedQuantity = harnessPoNeeded && harnessPoDelivered ? Math.min(dataset.harnessPoQuantity, harnessRemainingNeed) : 0;
  // Leftover PO stock only exists once the PO was actually kept (needed) and delivered --
  // physically received, now sitting in the warehouse alongside any on-hand surplus.
  const harnessPoLeftoverQuantity = harnessPoNeeded && harnessPoDelivered ? dataset.harnessPoQuantity - harnessPoConsumedQuantity : 0;

  const harnessLeftoverAfterCutover = harnessOnHandLeftover + harnessPoLeftoverQuantity;

  if (harnessLeftoverAfterCutover > 0) {
    if (inputs.harnessConvertEnabled) {
      lineItems.push({
        id: "harness-onhand-convert",
        label: `Convert ${harnessLeftoverAfterCutover} unit(s) of Rev 1 harness stock to Rev 2 spec`,
        formula: `${harnessLeftoverAfterCutover} × ${money(dataset.harnessOnHandConversionPerUnit)}`,
        amount: harnessLeftoverAfterCutover * dataset.harnessOnHandConversionPerUnit,
        category: "mitigated_cost",
        confidence: "known",
        provenance: "scenario_seeded_inventory",
      });
    } else {
      lineItems.push({
        id: "harness-onhand-scrap",
        label: `Scrap ${harnessLeftoverAfterCutover} unit(s) of Rev 1 harness stock`,
        formula: `${harnessLeftoverAfterCutover} × ${money(dataset.onHandHarnessUnitCost)}`,
        amount: harnessLeftoverAfterCutover * dataset.onHandHarnessUnitCost,
        category: "realized_loss",
        confidence: "known",
        provenance: "scenario_seeded_inventory",
      });
    }
  }

  // PO-3302 itself, if not needed at all -- cancelled/converted at the Week 0 decision point,
  // regardless of whether its due date would otherwise have fallen before or after cutover.
  if (!harnessPoNeeded) {
    if (inputs.harnessConvertEnabled) {
      lineItems.push({
        id: "harness-po-convert",
        label: `Convert PO-3302 (${dataset.harnessPoQuantity} units) from Rev 1 to Rev 2 spec with ${dataset.harnessSupplierName}`,
        formula: `${dataset.harnessPoQuantity} × ${money(dataset.harnessConversionPerUnitDelta)} + ${money(dataset.harnessConversionFlatFee)} re-spec fee`,
        amount: dataset.harnessPoQuantity * dataset.harnessConversionPerUnitDelta + dataset.harnessConversionFlatFee,
        category: "mitigated_cost",
        confidence: "known",
        provenance: "scenario_seeded_po_terms",
      });
    } else {
      lineItems.push({
        id: "harness-po-cancel",
        label: `Cancel PO-3302 (${dataset.harnessPoQuantity} units) with ${dataset.harnessSupplierName}`,
        formula: `${money(dataset.harnessConversionFlatFee)} flat cancellation fee`,
        amount: dataset.harnessConversionFlatFee,
        category: "cancellation_penalty",
        confidence: "known",
        provenance: "scenario_seeded_po_terms",
      });
    }
  }

  // --- Expedite premium: only when an active cutover creates a supply gap before the new
  //     Rev C PCBA order's normal lead time would otherwise deliver. ---
  if (isActiveCutover) {
    const gapWeeks = Math.max(0, dataset.newPcbaLeadTimeWeeks - cutoverWeek);
    if (gapWeeks > 1e-9) {
      const gapUnits = gapWeeks * burnRatePerWeek;
      lineItems.push({
        id: "expedite-premium",
        label: `Expedite ${Math.round(gapUnits)} unit(s) of Rev C PCBA to cover the supply gap before normal lead time`,
        formula: `${Math.round(gapUnits)} × ${money(dataset.expeditePremiumPerUnit)} premium`,
        amount: gapUnits * dataset.expeditePremiumPerUnit,
        category: "new_cost",
        confidence: "known",
        provenance: "calculated_disposition_outcome",
      });
    }
  }

  // --- Estimated warranty exposure from units fielded with the known throttling defect. ---
  if (defectiveUnitsFielded > 0) {
    lineItems.push({
      id: "warranty-estimate",
      label: `Estimated future service cost for ${Math.round(defectiveUnitsFielded)} unit(s) fielded with the thermal-throttling defect`,
      formula: `${Math.round(defectiveUnitsFielded)} × ${money(dataset.warrantyEstimatePerUnit)} (estimated, not known)`,
      amount: defectiveUnitsFielded * dataset.warrantyEstimatePerUnit,
      category: "estimated_risk",
      confidence: "estimated",
      provenance: "calculated_disposition_outcome",
    });
  }

  const netExposure = lineItems.reduce((sum, l) => sum + l.amount, 0);
  const knownExposure = lineItems.filter((l) => l.confidence === "known").reduce((sum, l) => sum + l.amount, 0);
  const estimatedExposure = lineItems.filter((l) => l.confidence === "estimated").reduce((sum, l) => sum + l.amount, 0);

  const narrative = buildNarrative(strategy, cutoverWeek, netExposure, defectiveUnitsFielded);

  return {
    cutoverWeek,
    strategy,
    maxRunOutWeek,
    defectiveUnitsFielded,
    pcbaBatchDispositions,
    harnessLeftoverAfterCutover,
    harnessPoConsumedQuantity,
    harnessPoLeftoverQuantity,
    lineItems,
    netExposure,
    knownExposure,
    estimatedExposure,
    narrative,
  };
}

const STRATEGY_LABELS: Record<CutoverStrategyName["kind"], string> = {
  immediate: "Immediate Cutover",
  controlled_run_out: "Controlled Run-Out",
  optimized_phased: "Optimized Phased Cutover",
  custom: "Custom Cutover",
};

function buildNarrative(strategy: CutoverStrategyName, cutoverWeek: number, netExposure: number, defectiveUnitsFielded: number): string {
  const label = STRATEGY_LABELS[strategy.kind];
  const weekPhrase = cutoverWeek <= 0 ? "Week 0" : `Week ${Math.round(cutoverWeek * 10) / 10}`;
  return `${label} — ${weekPhrase}: ${money(netExposure)} net exposure, ${Math.round(defectiveUnitsFielded)} unit(s) fielded with the thermal-throttling defect.`;
}

// ---------------------------------------------------------------------------
// Dataset resolution -- the one seam a future real customer dataset plugs into.
// ---------------------------------------------------------------------------

/**
 * Resolves the CutoverScenarioDataset for a given engineering change. Today there is exactly
 * one real dataset (Nova Robotics), matched by name rather than a general lookup table, because
 * building a lookup abstraction for a set of one is exactly the premature abstraction the V3
 * design review warns against.
 *
 * This function -- not the calculation engine above -- is where a real customer's inventory/WIP
 * data would be assembled from real repositories once that persistence exists (a genuinely
 * larger feature, deliberately not built for this release). Nothing about computeCutoverDisposition
 * or the CutoverScenarioDataset shape needs to change when that day comes; only this function's
 * body does, and its callers (the Cutover Simulator's Server Action) never need to know the
 * difference.
 */
export function resolveCutoverScenarioDataset(engineeringChangeName: string): CutoverScenarioDataset | null {
  if (engineeringChangeName.startsWith("ECO-1042")) return NOVA_ROBOTICS_DATASET;
  return null;
}
