export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-line bg-white/60 px-6 py-14 text-center">
      <div className="mb-3 h-9 w-9 rounded-full border-2 border-line" />
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-soft">{body}</p>
    </div>
  );
}

export function FailureState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-status-critical/30 bg-status-criticalBg px-4 py-3 text-sm text-status-critical">
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5">{body}</p>
    </div>
  );
}

export function SuccessState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-status-success/30 bg-status-successBg px-4 py-3 text-sm text-status-success">
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5">{body}</p>
    </div>
  );
}

export function WarningState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-status-warning/30 bg-status-warningBg px-4 py-3 text-sm text-status-warning">
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5">{body}</p>
    </div>
  );
}

/**
 * Phase 6A -- the systemic feedback fix. Before this, roughly a third of the write actions in
 * the product discarded their Server Action's return value entirely and relied on
 * `router.refresh()` as the only signal something happened -- which meant a real failure (a
 * thrown error, a rejected constraint) produced total silence, and a real success looked
 * identical to nothing happening at all. That silence is what led a user to click "Generate
 * mapping suggestions" a second time, which is what created duplicate rows (see Phase 6A
 * triage). This is the one small, reusable primitive every write action in a compact form
 * should route through, instead of each form inventing its own ad hoc feedback (or none).
 */
export function InlineFeedback({ type, message }: { type: "success" | "error"; message: string }) {
  return <p className={`mt-1.5 text-xs ${type === "success" ? "text-status-success" : "text-status-critical"}`}>{message}</p>;
}
