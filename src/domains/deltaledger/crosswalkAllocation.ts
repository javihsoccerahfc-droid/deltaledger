import { CrosswalkAllocationRule, PartNumberCrosswalk } from "./types";

export interface AllocationContext {
  quantity: number;
  plantCode?: string;
  supplierId?: string;
  manualAllocationQuantity?: number;
}

export type AllocationResolution =
  | { resolved: true; allocatedQuantity: number; method: CrosswalkAllocationRule["method"] }
  | { resolved: false; reason: string };

const PERCENTAGE_SUM_TOLERANCE = 0.001;

/**
 * Resolves how much of `context.quantity` is attributable to one specific
 * crosswalk row, for a one_to_many or many_to_one PartNumberCrosswalk. A
 * one_to_one mapping needs no rule — the full quantity applies.
 *
 * If no rule resolves deterministically, the result is `resolved: false`
 * with a specific reason. Per spec §5, an ExposureRecord built on an
 * unresolved allocation MUST be classified Unresolved, never guessed at
 * (e.g. never an even split "for now").
 */
export function resolveCrosswalkAllocation(
  crosswalk: PartNumberCrosswalk,
  rule: CrosswalkAllocationRule | undefined,
  allRulesForCrosswalk: CrosswalkAllocationRule[],
  context: AllocationContext
): AllocationResolution {
  if (crosswalk.mappingType === "one_to_one") {
    return { resolved: true, allocatedQuantity: context.quantity, method: "fixed_quantity" };
  }

  if (!rule) {
    return { resolved: false, reason: `No allocation rule found for crosswalk ${crosswalk.id}.` };
  }

  switch (rule.method) {
    case "fixed_quantity": {
      if (rule.fixedQuantity === null || rule.fixedQuantity === undefined) {
        return { resolved: false, reason: "fixed_quantity rule has no fixedQuantity value." };
      }
      return { resolved: true, allocatedQuantity: Math.min(rule.fixedQuantity, context.quantity), method: "fixed_quantity" };
    }

    case "percentage": {
      if (rule.percentage === null || rule.percentage === undefined) {
        return { resolved: false, reason: "percentage rule has no percentage value." };
      }
      const percentageRules = allRulesForCrosswalk.filter((r) => r.method === "percentage");
      const sum = percentageRules.reduce((s, r) => s + (r.percentage ?? 0), 0);
      if (Math.abs(sum - 100) > PERCENTAGE_SUM_TOLERANCE) {
        return {
          resolved: false,
          reason: `Percentage allocation rules for this crosswalk sum to ${sum}%, not 100% — cannot allocate deterministically.`,
        };
      }
      return { resolved: true, allocatedQuantity: context.quantity * (rule.percentage / 100), method: "percentage" };
    }

    case "plant_specific": {
      if (!context.plantCode || rule.plantCode !== context.plantCode) {
        return { resolved: false, reason: `No plant-specific rule matches plant "${context.plantCode ?? "(none provided)"}".` };
      }
      return { resolved: true, allocatedQuantity: context.quantity, method: "plant_specific" };
    }

    case "supplier_specific": {
      if (!context.supplierId || rule.supplierId !== context.supplierId) {
        return {
          resolved: false,
          reason: `No supplier-specific rule matches supplier "${context.supplierId ?? "(none provided)"}".`,
        };
      }
      return { resolved: true, allocatedQuantity: context.quantity, method: "supplier_specific" };
    }

    case "manual": {
      if (context.manualAllocationQuantity === undefined) {
        return { resolved: false, reason: "manual allocation method requires an explicit manualAllocationQuantity." };
      }
      return { resolved: true, allocatedQuantity: context.manualAllocationQuantity, method: "manual" };
    }

    default:
      return { resolved: false, reason: `Unknown allocation method.` };
  }
}

/** Convenience check used before running exposure calculation across many rules for one crosswalk. */
export function percentageRulesAreValid(rules: CrosswalkAllocationRule[]): boolean {
  const percentageRules = rules.filter((r) => r.method === "percentage");
  if (percentageRules.length === 0) return true;
  const sum = percentageRules.reduce((s, r) => s + (r.percentage ?? 0), 0);
  return Math.abs(sum - 100) <= PERCENTAGE_SUM_TOLERANCE;
}
