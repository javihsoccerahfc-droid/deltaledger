/**
 * DeltaLedger's read-only enforcement. `EngineeringChange.isReadOnly` is a genuine, permanent
 * capability (an archived/shared/audited EC can be locked; the Nova Robotics demonstration
 * scenario is simply the first thing that sets it) -- this file is the one place that capability
 * is actually enforced.
 *
 * This is deliberately checked at the Server Action layer, never only in the UI. A disabled
 * button is a courtesy that improves the experience; it is not what actually prevents a write.
 * Every mutating Server Action in src/app/actions.ts calls assertEditable() as its first line
 * against the engineering change it's about to modify.
 */

export class ReadOnlyEngineeringChangeError extends Error {
  constructor() {
    super("This engineering change is read-only and cannot be modified.");
    this.name = "ReadOnlyEngineeringChangeError";
  }
}

export interface EditableCheckSubject {
  isReadOnly: boolean;
}

/**
 * Throws if the given engineering change is read-only. Callers that already return a
 * success/failure result shape (ApprovalResult, RevisionResult, etc.) should catch this and
 * fold it into that shape rather than let it propagate as an unhandled rejection -- see
 * assertEditableOrReason() below for that case.
 */
export function assertEditable(ec: EditableCheckSubject | null | undefined): void {
  if (ec?.isReadOnly) {
    throw new ReadOnlyEngineeringChangeError();
  }
}

/**
 * Same check, returned as a plain message instead of thrown -- for the many mutating actions
 * whose existing return type is already a `{ success: false; message: string }`-shaped result
 * (approveMappingAction, revokeMappingAction, etc.). Returns null when editable.
 */
export function editableCheckReason(ec: EditableCheckSubject | null | undefined): string | null {
  return ec?.isReadOnly ? "This engineering change is read-only and cannot be modified." : null;
}
