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
