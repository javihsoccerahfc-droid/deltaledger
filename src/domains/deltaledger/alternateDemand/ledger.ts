import { defaultIdGenerator } from "../idGenerator";
import { AlternateDemandAllocation, AlternateDemandAllocationStatus, AlternateDemandRecord } from "../types";

export type AllocationOutcome =
  | { success: true; allocation: AlternateDemandAllocation }
  | { success: false; reason: string };

/** Sum of currently-active allocations against one alternate-demand record. */
export function activeAllocatedQuantity(
  alternateDemandRecordId: string,
  allocations: AlternateDemandAllocation[]
): number {
  return allocations
    .filter((a) => a.alternateDemandRecordId === alternateDemandRecordId && a.status === "active")
    .reduce((sum, a) => sum + a.quantityAllocated, 0);
}

export function availableQuantity(record: AlternateDemandRecord, allocations: AlternateDemandAllocation[]): number {
  return record.quantityAvailableForOffset - activeAllocatedQuantity(record.id, allocations);
}

export function deriveAllocationStatus(
  record: AlternateDemandRecord,
  allocations: AlternateDemandAllocation[]
): AlternateDemandAllocationStatus {
  const allocated = activeAllocatedQuantity(record.id, allocations);
  if (allocated <= 0) return "unallocated";
  if (allocated >= record.quantityAvailableForOffset) return "fully_allocated";
  return "partially_allocated";
}

function nextId() {
  return defaultIdGenerator.next("alloc");
}

/**
 * Allocates a quantity from an approved alternate-demand record to a
 * specific exposure record. This is the single choke point that prevents
 * the same offsetting quantity from being claimed twice — whether the
 * second claim comes from a different PO line, a different engineering
 * change, or a different exposure record entirely. It doesn't matter which
 * of those the caller is; the guard is purely against the shared record's
 * remaining available quantity, checked here, every time.
 */
export function allocateAlternateDemand(
  record: AlternateDemandRecord,
  exposureRecordId: string,
  quantity: number,
  allocatedBy: string,
  allocatedAt: string,
  existingAllocations: AlternateDemandAllocation[]
): AllocationOutcome {
  if (record.reviewStatus !== "approved") {
    return {
      success: false,
      reason: "Alternate-demand record is not approved — system suggestions cannot reduce exposure until reviewed.",
    };
  }
  if (quantity <= 0) {
    return { success: false, reason: "Allocation quantity must be positive." };
  }

  const remaining = availableQuantity(record, existingAllocations);
  if (quantity > remaining) {
    return {
      success: false,
      reason: `Requested allocation of ${quantity} exceeds the ${remaining} still available on this alternate-demand record (of ${record.quantityAvailableForOffset} total).`,
    };
  }

  const allocation: AlternateDemandAllocation = {
    id: nextId(),
    alternateDemandRecordId: record.id,
    exposureRecordId,
    quantityAllocated: quantity,
    allocatedAt,
    allocatedBy,
    status: "active",
    reversedAt: null,
    reversedBy: null,
    reversalReason: null,
  };

  return { success: true, allocation };
}

export function reverseAllocation(
  allocation: AlternateDemandAllocation,
  reversedBy: string,
  reversedAt: string,
  reason: string
): AlternateDemandAllocation {
  return { ...allocation, status: "reversed", reversedBy, reversedAt, reversalReason: reason };
}
