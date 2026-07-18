"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importBomAction } from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";
import { EmptyState, FailureState, SuccessState } from "@/components/shared/States";

const CHANGE_TYPE_STYLES: Record<string, string> = {
  added: "bg-status-successBg text-status-success border-status-success/30",
  removed: "bg-status-criticalBg text-status-critical border-status-critical/30",
  replaced: "bg-accent-soft text-accent border-accent/30",
  qty_reduced: "bg-status-warningBg text-status-warning border-status-warning/30",
  qty_increased: "bg-paper text-ink-soft border-line",
};

interface BomImportSummary {
  bomImport: { sourceFile: string };
  lines: unknown[];
}

export function BomsClient({
  ecId,
  imports,
  diff,
}: {
  ecId: string;
  imports: Partial<Record<"current" | "proposed", BomImportSummary>>;
  diff: { id: string; partId: string; changeType: string; fromQuantity: number | null; toQuantity: number | null }[];
}) {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const currentInputRef = useRef<HTMLInputElement>(null);
  const proposedInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"current" | "proposed" | null>(null);

  async function handleFile(versionLabel: "current" | "proposed", file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(versionLabel);
    const result = await importBomAction(ecId, versionLabel, file, currentUser);
    setBusy(null);
    if (!result.success) setError(result.message);
    else router.refresh();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">BOM Import & Diff</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Import the current and proposed BOM (.xlsx, .xls, or .csv). The diff below is computed
        deterministically — added/removed/replaced parts are never auto-inferred; a
        removed+added pair only becomes &quot;replaced&quot; through an explicit pairing action.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-sm font-medium text-ink">Current BOM</p>
          {imports.current ? (
            <p className="mt-1 text-xs text-ink-soft">
              {imports.current.bomImport.sourceFile} — {imports.current.lines.length} lines
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-soft">Not imported yet.</p>
          )}
          <input
            ref={currentInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleFile("current", e.target.files?.[0])}
          />
          <button
            onClick={() => currentInputRef.current?.click()}
            disabled={busy === "current"}
            className="mt-3 rounded-sm border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {busy === "current" ? "Importing…" : imports.current ? "Re-import current BOM" : "Import current BOM"}
          </button>
        </div>

        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-sm font-medium text-ink">Proposed BOM</p>
          {imports.proposed ? (
            <p className="mt-1 text-xs text-ink-soft">
              {imports.proposed.bomImport.sourceFile} — {imports.proposed.lines.length} lines
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-soft">Not imported yet.</p>
          )}
          <input
            ref={proposedInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleFile("proposed", e.target.files?.[0])}
          />
          <button
            onClick={() => proposedInputRef.current?.click()}
            disabled={busy === "proposed"}
            className="mt-3 rounded-sm border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {busy === "proposed" ? "Importing…" : imports.proposed ? "Re-import proposed BOM" : "Import proposed BOM"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <FailureState title="Could not import file" body={error} />
        </div>
      )}
      {imports.current && imports.proposed && (
        <div className="mt-4">
          <SuccessState title="Diff computed" body={`${diff.length} change(s) detected between current and proposed BOM.`} />
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">BOM Diff</h2>
        {diff.length === 0 ? (
          <EmptyState title="No diff yet" body="Import both the current and proposed BOM to see the deterministic diff." />
        ) : (
          <div className="overflow-hidden rounded-md border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Part number</th>
                  <th className="px-4 py-2.5 font-medium">Change type</th>
                  <th className="px-4 py-2.5 font-medium">From qty</th>
                  <th className="px-4 py-2.5 font-medium">To qty</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-mono text-ink">{d.partId}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-sm border px-2 py-0.5 text-xs font-medium ${CHANGE_TYPE_STYLES[d.changeType]}`}>
                        {d.changeType.replace("_", " ")}
                      </span>
                    </td>
                    <td className="data-num px-4 py-2.5 text-ink-soft">{d.fromQuantity ?? "—"}</td>
                    <td className="data-num px-4 py-2.5 text-ink-soft">{d.toQuantity ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
