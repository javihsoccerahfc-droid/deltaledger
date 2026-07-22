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
import { EmptyState, InlineFeedback } from "@/components/shared/States";
import { Button } from "@/components/design-system/Button";
import { Hero } from "@/components/design-system/Hero";
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
    return (
      <EmptyState
        title="Nothing to mitigate yet"
        body="Once exposure is calculated, this is where you track the work that reduces it — cancellation requests, supplier negotiations, and the outcomes that actually landed. Calculate exposure for this engineering change first."
      />
    );
  }

  const closedOutcomes = outcomes.filter((o) => o.closedAt !== null);
  const openOutcomes = outcomes.filter((o) => o.closedAt === null);
  const recordsWithNoAction = records.filter((r) => !mitigationActions.some((a) => a.exposureRecordId === r.id));
  const totalRecovered = closedOutcomes.reduce((s, o) => s + o.actualCostAvoided, 0);
  const hasOutcomeActivity = outcomes.length > 0;

  return (
    <div>
      <Hero
        eyebrow="MITIGATION"
        tone={recordsWithNoAction.length === records.length ? "critical" : openOutcomes.length > 0 ? "warning" : "success"}
        value={hasOutcomeActivity ? money(totalRecovered) : "No outcomes recorded yet"}
        supporting={
          <div className="space-y-1">
            {hasOutcomeActivity && <p>Recovered to date, across {closedOutcomes.length} closed outcome{closedOutcomes.length === 1 ? "" : "s"}.</p>}
            <p>
              {recordsWithNoAction.length > 0 && `${recordsWithNoAction.length} exposure record${recordsWithNoAction.length === 1 ? "" : "s"} not yet started. `}
              {openOutcomes.length > 0 && `${openOutcomes.length} outcome${openOutcomes.length === 1 ? "" : "s"} still open.`}
              {recordsWithNoAction.length === 0 && openOutcomes.length === 0 && hasOutcomeActivity && "Every mitigation case is closed."}
            </p>
          </div>
        }
      />
      <p className="mt-4 text-sm text-ink-soft">
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
    <div className="mt-3 border-t border-line pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">What are you doing about this exposure?</p>
      <div className="mt-2 flex flex-wrap items-end gap-4">
      <div>
        <label htmlFor={`action-type-${exposureRecordId}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
          Action
        </label>
        <select
          id={`action-type-${exposureRecordId}`}
          value={actionType}
          onChange={(e) => setActionType(e.target.value as MitigationActionType)}
          className="mt-1 rounded-sm border border-line px-2 py-1.5 text-xs"
        >
          <option value="cancel">Cancel</option>
          <option value="redirect">Redirect</option>
          <option value="negotiate">Negotiate</option>
          <option value="accept_loss">Accept loss</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label htmlFor={`action-owner-${exposureRecordId}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
          Assigned to
        </label>
        <input
          id={`action-owner-${exposureRecordId}`}
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="Name or email"
          className="mt-1 rounded-sm border border-line px-2 py-1.5 text-xs"
        />
      </div>
      <div>
        <label htmlFor={`action-due-${exposureRecordId}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
          Due date
        </label>
        <input
          id={`action-due-${exposureRecordId}`}
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="mt-1 rounded-sm border border-line px-2 py-1.5 text-xs"
        />
      </div>
      <Button
        size="sm"
        onClick={() =>
          startTransition(async () => {
            await createMitigationActionCall(ecId, exposureRecordId, actionType, owner, dueDate || null, currentUser);
            router.refresh();
          })
        }
        disabled={isPending}
      >
        {isPending ? "Creating…" : "Create mitigation action"}
      </Button>
      </div>
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
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`response-type-${mitigationActionId}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
            Supplier response
          </label>
          <select
            id={`response-type-${mitigationActionId}`}
            value={responseType}
            onChange={(e) => setResponseType(e.target.value as SupplierResponseType)}
            className="mt-1 rounded-sm border border-line px-2 py-1.5 text-xs"
          >
            <option value="accepted">Accepted</option>
            <option value="partially_accepted">Partially accepted</option>
            <option value="rejected">Rejected</option>
            <option value="no_response">No response</option>
          </select>
        </div>
        <div>
          <label htmlFor={`response-cancelled-${mitigationActionId}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
            Cancelled
          </label>
          <input
            id={`response-cancelled-${mitigationActionId}`}
            type="number"
            value={cancelled}
            onChange={(e) => setCancelled(e.target.value)}
            className="mt-1 w-20 rounded-sm border border-line px-2 py-1.5 text-xs"
          />
        </div>
        <div>
          <label htmlFor={`response-redirected-${mitigationActionId}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
            Redirected
          </label>
          <input
            id={`response-redirected-${mitigationActionId}`}
            type="number"
            value={redirected}
            onChange={(e) => setRedirected(e.target.value)}
            className="mt-1 w-20 rounded-sm border border-line px-2 py-1.5 text-xs"
          />
        </div>
        <div>
          <label htmlFor={`response-received-${mitigationActionId}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
            Received before action
          </label>
          <input
            id={`response-received-${mitigationActionId}`}
            type="number"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            className="mt-1 w-20 rounded-sm border border-line px-2 py-1.5 text-xs"
          />
        </div>
        <Button
          size="sm"
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
        >
          {isPending ? "Recording response…" : "Record response"}
        </Button>
      </div>
      {error && <p className="mt-1.5 text-xs text-status-critical">{error}</p>}
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
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const recoverEqualsOriginal =
    response.quantityRedirected > 0 && Number(recoverableUnitValue) === frozenUnitPrice && recoverableUnitValue !== "";

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor={`fee-${exposureRecordId}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
            Cancellation fee
          </label>
          <input
            id={`fee-${exposureRecordId}`}
            type="number"
            value={cancellationFee}
            onChange={(e) => setCancellationFee(e.target.value)}
            className="mt-1 w-full rounded-sm border border-line px-2 py-1.5 text-xs"
          />
        </div>
        <div>
          <label htmlFor={`credit-${exposureRecordId}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
            Supplier credit
          </label>
          <input
            id={`credit-${exposureRecordId}`}
            type="number"
            value={supplierCreditValue}
            onChange={(e) => setSupplierCreditValue(e.target.value)}
            className="mt-1 w-full rounded-sm border border-line px-2 py-1.5 text-xs"
          />
        </div>
        <div>
          <label htmlFor={`writeoff-${exposureRecordId}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
            Write-off value
          </label>
          <input
            id={`writeoff-${exposureRecordId}`}
            type="number"
            value={writeOffValue}
            onChange={(e) => setWriteOffValue(e.target.value)}
            className="mt-1 w-full rounded-sm border border-line px-2 py-1.5 text-xs"
          />
        </div>
        {response.quantityRedirected > 0 && (
          <div>
            <label htmlFor={`recoverable-${exposureRecordId}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
              Recoverable unit value
            </label>
            <input
              id={`recoverable-${exposureRecordId}`}
              type="number"
              value={recoverableUnitValue}
              onChange={(e) => setRecoverableUnitValue(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line px-2 py-1.5 text-xs"
            />
            <p className="mt-1 text-[11px] text-ink-soft">Frozen at calculation time: {frozenUnitPrice}</p>
          </div>
        )}
      </div>
      {recoverEqualsOriginal && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`justification-${exposureRecordId}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
              Justification (required for full value)
            </label>
            <input
              id={`justification-${exposureRecordId}`}
              value={justificationNote}
              onChange={(e) => setJustificationNote(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label htmlFor={`reviewed-by-${exposureRecordId}`} className="block text-[11px] uppercase tracking-wide text-ink-soft">
              Reviewed by (required)
            </label>
            <input
              id={`reviewed-by-${exposureRecordId}`}
              value={reviewedBy}
              onChange={(e) => setReviewedBy(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line px-2 py-1.5 text-xs"
            />
          </div>
        </div>
      )}
      <Button
        size="sm"
        className="mt-3"
        onClick={() => {
          if (recoverEqualsOriginal && (!justificationNote.trim() || !reviewedBy.trim())) {
            setFeedback({ type: "error", message: "Justification and reviewer are both required to recover full original value." });
            return;
          }
          startTransition(async () => {
            try {
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
              setFeedback({ type: "success", message: "Financial outcome recorded as a draft. Close it once everything is confirmed." });
              router.refresh();
            } catch (err) {
              setFeedback({ type: "error", message: err instanceof Error ? err.message : "Could not record this financial outcome." });
            }
          });
        }}
        disabled={isPending}
      >
        {isPending ? "Recording outcome…" : "Record financial outcome"}
      </Button>
      {feedback && <InlineFeedback type={feedback.type} message={feedback.message} />}
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
      <Button
        variant="secondary"
        size="sm"
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
      >
        {isPending ? "Closing…" : "Close outcome"}
      </Button>
      {error && <p className="mt-1.5 text-xs text-status-critical">{error}</p>}
    </div>
  );
}
