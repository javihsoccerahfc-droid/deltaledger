import { defaultIdGenerator } from "../idGenerator";
import { SupplierResponse, SupplierResponseType } from "../types";

function nextId() {
  return defaultIdGenerator.next("resp");
}

export type RecordResponseOutcome = { success: true; response: SupplierResponse } | { success: false; reason: string };

/**
 * Records a supplier's response to a mitigation action. Quantities are
 * validated against the total committed quantity they're drawn from — the
 * three quantities (cancelled, redirected, received-before-action) must not
 * together exceed what was actually on order, since that would describe
 * more material than existed.
 */
export function recordSupplierResponse(
  mitigationActionId: string,
  responseType: SupplierResponseType,
  quantityCancelled: number,
  quantityRedirected: number,
  quantityReceivedBeforeAction: number,
  totalCommittedQuantity: number,
  respondedAt: string,
  recordedBy: string
): RecordResponseOutcome {
  if (quantityCancelled < 0 || quantityRedirected < 0 || quantityReceivedBeforeAction < 0) {
    return { success: false, reason: "Quantities cannot be negative." };
  }
  const total = quantityCancelled + quantityRedirected + quantityReceivedBeforeAction;
  if (total > totalCommittedQuantity) {
    return {
      success: false,
      reason: `Cancelled + redirected + received (${total}) exceeds the committed quantity (${totalCommittedQuantity}).`,
    };
  }

  return {
    success: true,
    response: {
      id: nextId(),
      mitigationActionId,
      responseType,
      quantityCancelled,
      quantityRedirected,
      quantityReceivedBeforeAction,
      respondedAt,
      recordedBy,
    },
  };
}
