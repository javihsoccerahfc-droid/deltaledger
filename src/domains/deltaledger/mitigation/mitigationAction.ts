import { defaultIdGenerator } from "../idGenerator";
import { MitigationAction, MitigationActionStatus, MitigationActionType } from "../types";

function nextId() {
  return defaultIdGenerator.next("mit");
}

export function createMitigationAction(
  exposureRecordId: string,
  actionType: MitigationActionType,
  ownerUserId: string,
  dueDate: string | null,
  createdAt: string
): MitigationAction {
  return {
    id: nextId(),
    exposureRecordId,
    actionType,
    ownerUserId,
    dueDate,
    status: "open",
    createdAt,
  };
}

const VALID_TRANSITIONS: Record<MitigationActionStatus, MitigationActionStatus[]> = {
  open: ["in_progress", "abandoned"],
  in_progress: ["done", "abandoned", "open"],
  done: [],
  abandoned: ["open"], // reopening an abandoned action is allowed; done is terminal
};

export function transitionMitigationStatus(action: MitigationAction, next: MitigationActionStatus): MitigationAction {
  if (!VALID_TRANSITIONS[action.status].includes(next)) {
    throw new Error(`Cannot transition mitigation action from "${action.status}" to "${next}".`);
  }
  return { ...action, status: next };
}
