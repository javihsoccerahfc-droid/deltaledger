import { getAuditLogAction } from "@/app/actions";
import { EmptyState } from "@/components/shared/States";

export default async function AuditPage({ params }: { params: { id: string } }) {
  const log = await getAuditLogAction(params.id);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Audit Trail</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Every action recorded against this engineering change, most recent first. Nothing here is ever
        deleted or edited — it is an append-only log, read directly from the database.
      </p>

      <div className="mt-5">
        {log.length === 0 ? (
          <EmptyState title="No activity yet" body="Actions taken across this workflow will appear here." />
        ) : (
          <div className="overflow-hidden rounded-md border border-line bg-white">
            <ul className="divide-y divide-line">
              {log.map((entry) => (
                <li key={entry.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">{entry.actor}</span>
                    <span className="font-mono text-xs text-ink-soft">{new Date(entry.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="mt-0.5 text-ink-soft">{entry.action}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
