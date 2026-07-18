"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMitigationAction as createMitigationActionCall,
  recordSupplierResponseAction,
  createOutcomeAction,
  closeOutcomeAction,
} from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";
import { EmptyState } from "@/components/shared/States";
import { MitigationActionType, SupplierResponseType } from "@/domains/deltaledger/types";

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

interface ExposureRecordRow {
  id: string;
  partId: string;
  exposureSourceSnapshotId: string;
  netExposureValueReporting: number;
}
interface Snapshot {
  id: string;
  quantityOpen: number | null;
  unitPriceTransactionCurrency: number | null;
}
interface MitigationActionRow {
  id: string;
  exposureRecordId: string;
  actionType: string;
}
interface SupplierResponseRow {
  id: string;
  mitigationActionId: string;
  quantityCancelled: number;
  quantityRedirected: number;
  quantityReceivedBeforeAction: number;
}
interface OutcomeRow {
  id: string;
  exposureRecordId: string;
  actualCostAvoided: number;
  actualRealizedLoss: number;
  closedAt: string | null;
}

export function MitigationClient({
  ecId,
  records,
  snapshots,
  mitigationActions,
  responses,
  outcomes,
}: {
  ecId: string;
  records: ExposureRecordRow[];
  snapshots: Snapshot[];
  mitigationActions: MitigationActionRow[];
  responses: SupplierResponseRow[];
  outcomes: OutcomeRow[];
}) {
  if (records.length === 0) {
    return <EmptyState title="No exposure records yet" body="Calculate exposure first." />;
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Mitigation & Outcomes</h1>
      <p className="mt-1 text-sm text-ink-soft">
        One card per exposure record: create a mitigation action, record the supplier&apos;s response, then
        close the financial outcome.
      </p>

      <div className="mt-5 space-y-4">
        {records.map((record) => {
          const action = mitigationActions.find((a) => a.exposureRecordId === record.id);
          const response = action ? responses.find((r) => r.mitigationActionId === action.id) : undefined;
          const outcome = outcomes.find((o) => o.exposureRecordId === record.id);
          const matchedSnapshot = snapshots.find((s) => s.id === record.exposureSourceSnapshotId);

          return (
            <div key={record.id} className="rounded-md border border-line bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-medium text-ink">{record.partId}</span>
                <span className="data-num text-sm text-ink-soft">Net exposure: {money(record.netExposureValueReporting)}</span>
              </div>

              {!action && <CreateActionForm ecId={ecId} exposureRecordId={record.id} />}

              {action && !response && (
                <RecordResponseForm ecId={ecId} mitigationActionId={action.id} totalCommittedQuantity={matchedSnapshot?.quantityOpen ?? 0} />
              )}

              {action && response && !outcome && (
                <CreateOutcomeForm
                  ecId={ecId}
                  exposureRecordId={record.id}
                  frozenUnitPrice={matchedSnapshot?.unitPriceTransactionCurrency ?? 0}
                  response={response}
                  netExposure={record.netExposureValueReporting}
                />
              )}

              {outcome && (
                <div className="mt-3 border-t border-line pt-3 text-xs">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div>
                      <p className="text-ink-soft">Actual cost avoided</p>
                      <p className="data-num font-semibold text-status-success">{money(outcome.actualCostAvoided)}</p>
                    </div>
                    <div>
                      <p className="text-ink-soft">Actual realized loss</p>
                      <p className="data-num font-semibold text-status-critical">{money(outcome.actualRealizedLoss)}</p>
                    </div>
                    <div>
                      <p className="text-ink-soft">Net mitigation benefit</p>
                      <p className="data-num font-semibold text-ink">{money(outcome.actualCostAvoided - outcome.actualRealizedLoss)}</p>
                    </div>
                    <div>
                      <p className="text-ink-soft">Status</p>
                      <p className="font-medium">{outcome.closedAt ? "Closed" : "Draft"}</p>
                    </div>
                  </div>
                  {!outcome.closedAt && <CloseOutcomeButton ecId={ecId} outcomeId={outcome.id} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CreateActionForm({ ecId, exposureRecordId }: { ecId: string; exposureRecordId: string }) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const [actionType, setActionType] = useState<MitigationActionType>("cancel");
  const [owner, setOwner] = useState(currentUser.id);
  const [dueDate, setDueDate] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
      <select value={actionType} onChange={(e) => setActionType(e.target.value as MitigationActionType)} className="rounded-sm border border-line px-2 py-1.5">
        <option value="cancel">Cancel</option>
        <option value="redirect">Redirect</option>
        <option value="negotiate">Negotiate</option>
        <option value="accept_loss">Accept loss</option>
        <option value="other">Other</option>
      </select>
      <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner user id" className="rounded-sm border border-line px-2 py-1.5" />
      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-sm border border-line px-2 py-1.5" />
      <button
        onClick={() =>
          startTransition(async () => {
            await createMitigationActionCall(ecId, exposureRecordId, actionType, owner, dueDate || null, currentUser);
            router.refresh();
          })
        }
        disabled={isPending}
        className="rounded-sm bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-deep disabled:opacity-50"
      >
        {isPending ? "Working…" : "Create mitigation action"}
      </button>
    </div>
  );
}

function RecordResponseForm({
  ecId,
  mitigationActionId,
  totalCommittedQuantity,
}: {
  ecId: string;
  mitigationActionId: string;
  totalCommittedQuantity: number;
}) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const [responseType, setResponseType] = useState<SupplierResponseType>("accepted");
  const [cancelled, setCancelled] = useState(String(totalCommittedQuantity));
  const [redirected, setRedirected] = useState("0");
  const [received, setReceived] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-3 border-t border-line pt-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <select value={responseType} onChange={(e) => setResponseType(e.target.value as SupplierResponseType)} className="rounded-sm border border-line px-2 py-1.5">
          <option value="accepted">Accepted</option>
          <option value="partially_accepted">Partially accepted</option>
          <option value="rejected">Rejected</option>
          <option value="no_response">No response</option>
        </select>
        <label>
          Cancelled <input type="number" value={cancelled} onChange={(e) => setCancelled(e.target.value)} className="w-20 rounded-sm border border-line px-2 py-1" />
        </label>
        <label>
          Redirected <input type="number" value={redirected} onChange={(e) => setRedirected(e.target.value)} className="w-20 rounded-sm border border-line px-2 py-1" />
        </label>
        <label>
          Received before action{" "}
          <input type="number" value={received} onChange={(e) => setReceived(e.target.value)} className="w-20 rounded-sm border border-line px-2 py-1" />
        </label>
        <button
          onClick={() =>
            startTransition(async () => {
              const result = await recordSupplierResponseAction(
                ecId,
                mitigationActionId,
                responseType,
                Number(cancelled),
                Number(redirected),
                Number(received),
                totalCommittedQuantity,
                currentUser
              );
              if (!result.success) setError(result.message);
              else {
                setError(null);
                router.refresh();
              }
            })
          }
          disabled={isPending}
          className="rounded-sm bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-deep disabled:opacity-50"
        >
          {isPending ? "Working…" : "Record response"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-status-critical">{error}</p>}
    </div>
  );
}

function CreateOutcomeForm({
  ecId,
  exposureRecordId,
  frozenUnitPrice,
  response,
  netExposure,
}: {
  ecId: string;
  exposureRecordId: string;
  frozenUnitPrice: number;
  response: { quantityCancelled: number; quantityRedirected: number; quantityReceivedBeforeAction: number };
  netExposure: number;
}) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const [cancellationFee, setCancellationFee] = useState("0");
  const [supplierCreditValue, setSupplierCreditValue] = useState("0");
  const [writeOffValue, setWriteOffValue] = useState("0");
  const [recoverableUnitValue, setRecoverableUnitValue] = useState("");
  const [justificationNote, setJustificationNote] = useState("");
  const [reviewedBy, setReviewedBy] = useState("");
  const [isPending, startTransition] = useTransition();

  const recoverEqualsOriginal =
    response.quantityRedirected > 0 && Number(recoverableUnitValue) === frozenUnitPrice && recoverableUnitValue !== "";

  return (
    <div className="mt-3 border-t border-line pt-3 text-xs">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label>
          Cancellation fee{" "}
          <input type="number" value={cancellationFee} onChange={(e) => setCancellationFee(e.target.value)} className="w-full rounded-sm border border-line px-2 py-1" />
        </label>
        <label>
          Supplier credit{" "}
          <input type="number" value={supplierCreditValue} onChange={(e) => setSupplierCreditValue(e.target.value)} className="w-full rounded-sm border border-line px-2 py-1" />
        </label>
        <label>
          Write-off value{" "}
          <input type="number" value={writeOffValue} onChange={(e) => setWriteOffValue(e.target.value)} className="w-full rounded-sm border border-line px-2 py-1" />
        </label>
        {response.quantityRedirected > 0 && (
          <label>
            Recoverable unit value (frozen: {frozenUnitPrice})
            <input type="number" value={recoverableUnitValue} onChange={(e) => setRecoverableUnitValue(e.target.value)} className="w-full rounded-sm border border-line px-2 py-1" />
          </label>
        )}
      </div>
      {recoverEqualsOriginal && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            value={justificationNote}
            onChange={(e) => setJustificationNote(e.target.value)}
            placeholder="Justification note (required for full value)"
            className="rounded-sm border border-line px-2 py-1"
          />
          <input value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} placeholder="Reviewed by (required)" className="rounded-sm border border-line px-2 py-1" />
        </div>
      )}
      <button
        onClick={() =>
          startTransition(async () => {
            await createOutcomeAction(
              ecId,
              {
                exposureRecordId,
                frozenUnitPrice,
                quantityCancelled: response.quantityCancelled,
                quantityRedirected: response.quantityRedirected,
                quantityReceivedBeforeAction: response.quantityReceivedBeforeAction,
                recoverableUnitValue: recoverableUnitValue ? Number(recoverableUnitValue) : null,
                recoverableUnitValueBasis: recoverEqualsOriginal ? "same_as_original" : recoverableUnitValue ? "estimated_market" : null,
                recoverableUnitValueJustificationNote: justificationNote || null,
                recoverableUnitValueReviewedBy: reviewedBy || null,
                cancellationFee: Number(cancellationFee),
                supplierCreditValue: Number(supplierCreditValue),
                writeOffValue: Number(writeOffValue),
                reworkCost: null,
                disposalCost: null,
                estimatedCostAvoidedFrozen: netExposure,
                outcomeExchangeRateSnapshotId: null,
              },
              currentUser
            );
            router.refresh();
          })
        }
        disabled={isPending}
        className="mt-2 rounded-sm bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-deep disabled:opacity-50"
      >
        {isPending ? "Working…" : "Record financial outcome"}
      </button>
    </div>
  );
}

function CloseOutcomeButton({ ecId, outcomeId }: { ecId: string; outcomeId: string }) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-2">
      <button
        onClick={() =>
          startTransition(async () => {
            const result = await closeOutcomeAction(ecId, outcomeId, currentUser);
            if (!result.success) setError(result.message);
            else {
              setError(null);
              router.refresh();
            }
          })
        }
        disabled={isPending}
        className="rounded-sm border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {isPending ? "Working…" : "Close outcome"}
      </button>
      {error && <p className="mt-1.5 text-xs text-status-critical">{error}</p>}
    </div>
  );
}
