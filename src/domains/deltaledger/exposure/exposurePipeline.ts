import {
  BomDiffEntry,
  PurchaseOrderLine,
  PartNumberCrosswalk,
  CrosswalkAllocationRule,
  SupplierCommitmentTerms,
  ExchangeRateSnapshot,
  ExposureRecord,
  ExposureSourceSnapshot,
} from "../types";
import { resolvePartIdentity } from "../identityResolution";
import { resolveCrosswalkAllocation, AllocationResolution } from "../crosswalkAllocation";
import { calculateExposure, ExposureCalculationInput, AlternateDemandNetting } from "./calculateExposure";
import { cleanString } from "@/core/normalization/parsers";

/**
 * Milestone 4 -- Interactive Exposure Explorer.
 *
 * This is the orchestration middle layer between "raw data about an engineering change" and
 * "a per-(diff entry, PO line) exposure outcome": Identity Resolution -> PO line matching ->
 * Crosswalk Allocation -> the pure `calculateExposure` calculation itself. Before this
 * extraction, this exact sequence lived inline inside
 * db/repositories/exposure.ts#calculateAndPersistExposure, interleaved with `await db.select`
 * calls -- which meant it could only ever run against live database state, and could not be
 * reused for hypothetical (scenario) inputs without either duplicating the loop or building a
 * second calculation path.
 *
 * This function is that loop, unchanged in behavior, with every database read replaced by a
 * lookup into a pre-assembled `ExposurePipelineDataset`. It performs no I/O of any kind --
 * given the same dataset, it always produces the same outcomes. This is what makes historical
 * calculation and scenario exploration the same engine: the ONLY thing that differs between
 * "calculate real exposure for this EC" and "explore what exposure would look like if X" is
 * how the dataset passed in here was assembled -- one path assembles it from straight database
 * reads (see db/repositories/exposure.ts), the other assembles it from database reads plus
 * scenario overrides applied on top (see scenarioOverrides.ts). Neither path, nor any future
 * one, may reimplement or fork this loop.
 */

export interface ExposurePipelineDataset {
  /** BOM diff entries already filtered to exposure-eligible change types by the caller. */
  diffEntries: BomDiffEntry[];
  /** Every PO line potentially in scope -- across every PO in `purchaseOrdersById`. */
  poLines: PurchaseOrderLine[];
  purchaseOrdersById: Record<string, { id: string; supplierId: string; sourceFile: string }>;
  /** Every crosswalk row potentially relevant -- resolvePartIdentity does its own filtering. */
  crosswalks: PartNumberCrosswalk[];
  /** All allocation rules for a crosswalk, keyed by crosswalkId. */
  allocationRulesByCrosswalkId: Record<string, CrosswalkAllocationRule[]>;
  /** Active supplier terms, keyed by supplierId. Absence means "no terms on file." */
  supplierTermsBySupplierId: Record<string, SupplierCommitmentTerms | undefined>;
  exchangeRates: ExchangeRateSnapshot[];
  /**
   * Alternate demand netting already resolved per purchase order line -- an ExposureRecord is
   * keyed by purchaseOrderLineId (not by diff entry), so alternate demand carries forward
   * against that same PO line across recalculations regardless of which diff entry currently
   * matches it. Assembling this (which, for the historical path, means looking up the PRIOR
   * active exposure record for this PO line and summing its active allocations) is a
   * live-state question, not a pure-calculation one, so it happens in the caller, not here.
   */
  alternateDemandByPoLineId: Record<string, AlternateDemandNetting>;
  reportingCurrency: string;
  formulaVersion: string;
  asOfDate: string;
  calculatedAt: string;
  /**
   * Per-crosswalk manual allocation quantity -- `resolveCrosswalkAllocation`'s "manual" method
   * reads its quantity from the AllocationContext parameter, not from a stored
   * CrosswalkAllocationRule row (see crosswalkAllocation.ts's `manual` case), because a manual
   * allocation is inherently a value supplied at calculation time, not something durably
   * stored on the crosswalk. Historical calculation has never had a caller that populates
   * this (undefined here behaves exactly as it always has -- "manual" stays unresolved,
   * unchanged from before this milestone); the Scenario Engine is the first caller that
   * actually supplies one, via a `allocationOverride` assumption (see scenarioAssumptions.ts).
   */
  manualAllocationQuantityByCrosswalkId?: Record<string, number>;
  /** Threaded into ExposureCalculationInput.sourceFile as a fallback -- see calculateExposure.ts. */
  fallbackSourceFile: string;
}

export type ExposurePipelineOutcome =
  | {
      kind: "created";
      diffEntryId: string;
      purchaseOrderLineId: string;
      snapshot: ExposureSourceSnapshot;
      record: ExposureRecord;
      /** Frozen evidence the persistence layer needs but which isn't part of the pure snapshot/record shape. */
      crosswalk: PartNumberCrosswalk;
      allocation: AllocationResolution;
    }
  | {
      kind: "gap";
      diffEntryId: string;
      purchaseOrderLineId: string;
      rawPartNumber: string;
      reason: string;
    };

const NO_ALTERNATE_DEMAND: AlternateDemandNetting = {
  allocatedQuantity: 0,
  allocationIds: [],
  explicitlyConfirmedZero: false,
};

/**
 * Runs Identity Resolution -> PO line matching -> Allocation -> Calculation for every diff
 * entry in the dataset. Pure: no I/O, no mutation of its input, fully deterministic given the
 * same dataset. See file-level comment for why this must remain the one and only place this
 * sequence is implemented.
 */
export function runExposurePipeline(dataset: ExposurePipelineDataset): ExposurePipelineOutcome[] {
  const outcomes: ExposurePipelineOutcome[] = [];

  for (const diffEntry of dataset.diffEntries) {
    // --- Identity Resolution stage (Milestone 3.5) -- runs BEFORE any PO matching. See
    // identityResolution.ts for the full rationale; unchanged here. ---
    const resolution = resolvePartIdentity(diffEntry.partId, dataset.crosswalks);

    if (resolution.status === "unresolved") {
      outcomes.push({
        kind: "gap",
        diffEntryId: diffEntry.id,
        purchaseOrderLineId: "",
        rawPartNumber: diffEntry.partId,
        reason: resolution.reason,
      });
      continue;
    }

    // Iterate every resolved identity, not just the first -- a genuine one-PLM-to-many-ERP
    // mapping is multiple approved crosswalk rows sharing one plmPartId, each resolved above.
    for (const identity of resolution.identities) {
      const matchingLines = dataset.poLines.filter(
        (line) => cleanString(line.rawPartNumber).toUpperCase() === cleanString(identity.erpPartId).toUpperCase()
      );

      if (matchingLines.length === 0) {
        outcomes.push({
          kind: "gap",
          diffEntryId: diffEntry.id,
          purchaseOrderLineId: "",
          rawPartNumber: identity.erpPartId,
          reason: `No purchase order line found for ${identity.erpPartId} (resolved from ${diffEntry.partId}).`,
        });
        continue;
      }

      for (const poLine of matchingLines) {
        const po = dataset.purchaseOrdersById[poLine.purchaseOrderId];
        const crosswalk = identity.crosswalk; // always defined -- guaranteed by identity resolution above

        const rulesForCrosswalk = dataset.allocationRulesByCrosswalkId[crosswalk.id] ?? [];
        const allocation: AllocationResolution = resolveCrosswalkAllocation(crosswalk, rulesForCrosswalk[0], rulesForCrosswalk, {
          quantity: poLine.quantityOpen ?? 0,
          manualAllocationQuantity: dataset.manualAllocationQuantityByCrosswalkId?.[crosswalk.id],
        });

        const supplierId = po?.supplierId ?? "";
        const supplierTerms = dataset.supplierTermsBySupplierId[supplierId];

        const alternateDemand = dataset.alternateDemandByPoLineId[poLine.id] ?? NO_ALTERNATE_DEMAND;

        const input: ExposureCalculationInput = {
          formulaVersion: dataset.formulaVersion,
          engineeringChangeId: diffEntry.engineeringChangeId,
          bomDiffEntry: diffEntry,
          purchaseOrderId: po?.id ?? poLine.purchaseOrderId,
          purchaseOrderLine: poLine,
          supplierId,
          crosswalk,
          allocation,
          supplierTerms,
          exchangeRates: dataset.exchangeRates,
          reportingCurrency: dataset.reportingCurrency,
          alternateDemand,
          asOfDate: dataset.asOfDate,
          calculatedAt: dataset.calculatedAt,
          sourceFile: po?.sourceFile ?? dataset.fallbackSourceFile,
          sourceRow: poLine.sourceRow,
        };

        const result = calculateExposure(input);

        if (!result.created) {
          outcomes.push({
            kind: "gap",
            diffEntryId: diffEntry.id,
            purchaseOrderLineId: poLine.id,
            rawPartNumber: poLine.rawPartNumber,
            reason: result.gapReason,
          });
          continue;
        }

        outcomes.push({
          kind: "created",
          diffEntryId: diffEntry.id,
          purchaseOrderLineId: poLine.id,
          snapshot: result.snapshot,
          record: result.record,
          crosswalk,
          allocation,
        });
      }
    }
  }

  return outcomes;
}
