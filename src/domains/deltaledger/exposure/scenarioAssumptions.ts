import { CrosswalkAllocationMethod } from "../types";
import { ExposurePipelineDataset } from "./exposurePipeline";

/**
 * Milestone 4 -- Interactive Exposure Explorer.
 *
 * A `ScenarioAssumption` is one hypothetical change to a single input the exposure pipeline
 * consumes. It is data, never a calculation rule: the financial meaning of "what happens if
 * quantity changes" is entirely owned by calculateExposure.ts, exactly as it is for a real PO
 * import. This file only knows how to patch a dataset and how to describe that patch in plain
 * language; it contains no dollar math whatsoever.
 *
 * Composability is the reason this is a discriminated union plus one reducer, rather than a
 * flat options object: adding a new kind of simulate-able assumption (an exchange-rate
 * override, a lead-time assumption, a supplier-terms change, and whatever comes after those)
 * means adding one new union member, one new `case` in `applyScenarioAssumptions`, and one new
 * `case` in `describeScenarioAssumption`. Nothing about `runExposurePipeline`,
 * `calculateExposure`, `resolveCrosswalkAllocation`, or `resolvePartIdentity` ever needs to
 * change to support a new assumption kind -- the pipeline only ever sees an
 * `ExposurePipelineDataset`, however it was assembled.
 */

export type ScenarioAssumption =
  | { kind: "quantityOverride"; purchaseOrderLineId: string; quantityOpen: number }
  | {
      kind: "priceOverride";
      purchaseOrderLineId: string;
      unitPriceTransactionCurrency: number;
      transactionCurrency?: string;
    }
  | { kind: "supplierReassignment"; purchaseOrderLineId: string; supplierId: string; supplierName?: string }
  | {
      kind: "allocationOverride";
      crosswalkId: string;
      method: CrosswalkAllocationMethod;
      manualAllocationQuantity?: number;
    }
  | {
      kind: "alternateDemandOverride";
      purchaseOrderLineId: string;
      allocatedQuantity: number;
      explicitlyConfirmedZero?: boolean;
    };

/**
 * Applies every assumption to a copy of `dataset`, never mutating the input. Assumptions are
 * applied in array order; where two assumptions target the exact same field on the exact same
 * entity, the later one in the array wins -- the same "last write wins" rule a person would
 * expect from a list of edits applied in sequence.
 */
export function applyScenarioAssumptions(dataset: ExposurePipelineDataset, assumptions: ScenarioAssumption[]): ExposurePipelineDataset {
  let next: ExposurePipelineDataset = {
    ...dataset,
    poLines: dataset.poLines.map((line) => ({ ...line })),
    purchaseOrdersById: { ...dataset.purchaseOrdersById },
    allocationRulesByCrosswalkId: { ...dataset.allocationRulesByCrosswalkId },
    alternateDemandByPoLineId: { ...dataset.alternateDemandByPoLineId },
  };

  for (const assumption of assumptions) {
    next = applyOne(next, assumption);
  }

  return next;
}

function applyOne(dataset: ExposurePipelineDataset, assumption: ScenarioAssumption): ExposurePipelineDataset {
  switch (assumption.kind) {
    case "quantityOverride": {
      const poLines = dataset.poLines.map((line) =>
        line.id === assumption.purchaseOrderLineId ? { ...line, quantityOpen: assumption.quantityOpen, quantityParseStatus: "ok" as const } : line
      );
      return { ...dataset, poLines };
    }

    case "priceOverride": {
      const poLines = dataset.poLines.map((line) =>
        line.id === assumption.purchaseOrderLineId
          ? {
              ...line,
              unitPriceTransactionCurrency: assumption.unitPriceTransactionCurrency,
              priceParseStatus: "ok" as const,
              transactionCurrency: assumption.transactionCurrency ?? line.transactionCurrency,
            }
          : line
      );
      return { ...dataset, poLines };
    }

    case "supplierReassignment": {
      const poLines = dataset.poLines.map((line) => (line.id === assumption.purchaseOrderLineId ? { ...line } : line));
      const line = poLines.find((l) => l.id === assumption.purchaseOrderLineId);
      if (!line) return { ...dataset, poLines };
      // Reassigning a PO line's supplier means reassigning the PO it belongs to for the
      // purposes of this scenario -- supplier terms and exchange-rate context both key off
      // the PO's supplierId. A synthetic PO id keeps the reassignment scoped to just this
      // line rather than silently reassigning every other line on the same real PO.
      const syntheticPoId = `scenario-po:${assumption.purchaseOrderLineId}`;
      const reassignedLines = poLines.map((l) => (l.id === assumption.purchaseOrderLineId ? { ...l, purchaseOrderId: syntheticPoId } : l));
      const purchaseOrdersById = {
        ...dataset.purchaseOrdersById,
        [syntheticPoId]: {
          id: syntheticPoId,
          supplierId: assumption.supplierId,
          sourceFile: dataset.fallbackSourceFile,
        },
      };
      return { ...dataset, poLines: reassignedLines, purchaseOrdersById };
    }

    case "allocationOverride": {
      const forcedRule = {
        id: `scenario-rule:${assumption.crosswalkId}`,
        crosswalkId: assumption.crosswalkId,
        method: assumption.method,
        plantCode: null,
        supplierId: null,
        fixedQuantity: assumption.method === "fixed_quantity" ? (assumption.manualAllocationQuantity ?? null) : null,
        percentage: assumption.method === "percentage" ? 100 : null,
        notes: "Scenario override",
        effectiveDate: dataset.asOfDate,
      };
      const manualAllocationQuantityByCrosswalkId =
        assumption.method === "manual" && assumption.manualAllocationQuantity !== undefined
          ? { ...dataset.manualAllocationQuantityByCrosswalkId, [assumption.crosswalkId]: assumption.manualAllocationQuantity }
          : dataset.manualAllocationQuantityByCrosswalkId;
      return {
        ...dataset,
        allocationRulesByCrosswalkId: { ...dataset.allocationRulesByCrosswalkId, [assumption.crosswalkId]: [forcedRule] },
        manualAllocationQuantityByCrosswalkId,
      };
    }

    case "alternateDemandOverride": {
      return {
        ...dataset,
        alternateDemandByPoLineId: {
          ...dataset.alternateDemandByPoLineId,
          [assumption.purchaseOrderLineId]: {
            allocatedQuantity: assumption.allocatedQuantity,
            allocationIds: [],
            explicitlyConfirmedZero: assumption.explicitlyConfirmedZero ?? assumption.allocatedQuantity === 0,
          },
        },
      };
    }
  }
}

/**
 * Optional lookups that turn an internal id into the business-meaningful reference a
 * finance/supply-chain reader actually recognizes -- a part number, a PO number, a supplier
 * name. A caller with no context (e.g. a unit test) still gets a correct, if less friendly,
 * label falling back to the raw id. Callers that DO have this data (the Server Action, the
 * Explorer UI) should always supply it -- an internal database id should never be the only
 * thing a person sees.
 */
export interface ScenarioAssumptionContext {
  poLineLabel?: (purchaseOrderLineId: string) => string;
  crosswalkLabel?: (crosswalkId: string) => string;
}

const ALLOCATION_METHOD_LABELS: Record<string, string> = {
  fixed_quantity: "fixed quantity",
  percentage: "percentage",
  plant_specific: "plant-specific",
  supplier_specific: "supplier-specific",
  manual: "manual",
};

/** Plain-language label for one assumption -- the "which assumptions caused this" narrative. */
export function describeScenarioAssumption(assumption: ScenarioAssumption, context: ScenarioAssumptionContext = {}): string {
  const poLineRef = (id: string) => context.poLineLabel?.(id) ?? `PO line ${id}`;
  const crosswalkRef = (id: string) => context.crosswalkLabel?.(id) ?? `crosswalk ${id}`;

  switch (assumption.kind) {
    case "quantityOverride":
      return `Quantity changed to ${assumption.quantityOpen.toLocaleString()} units for ${poLineRef(assumption.purchaseOrderLineId)}.`;
    case "priceOverride":
      return `Unit price changed to ${assumption.unitPriceTransactionCurrency.toLocaleString(undefined, { style: "currency", currency: assumption.transactionCurrency ?? "USD" })} for ${poLineRef(assumption.purchaseOrderLineId)}.`;
    case "supplierReassignment":
      return `Sourced from ${assumption.supplierName ?? assumption.supplierId} instead of the current supplier for ${poLineRef(assumption.purchaseOrderLineId)}.`;
    case "allocationOverride":
      return `Allocation method changed to "${ALLOCATION_METHOD_LABELS[assumption.method] ?? assumption.method}" for ${crosswalkRef(assumption.crosswalkId)}.`;
    case "alternateDemandOverride":
      return assumption.allocatedQuantity > 0
        ? `Alternate demand absorbs ${assumption.allocatedQuantity.toLocaleString()} units for ${poLineRef(assumption.purchaseOrderLineId)}.`
        : `Alternate demand explicitly confirmed at zero for ${poLineRef(assumption.purchaseOrderLineId)}.`;
  }
}
