import { Card } from "@/components/design-system/Card";
import { getDecisionPhase } from "@/domains/deltaledger/timelinePhase";

export interface TimelineEntry {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  entityType: string | null;
}

const PHASE_DOT: Record<string, string> = {
  "Problem Identified": "bg-ink-soft",
  "Data Collected": "bg-accent",
  "Exposure Understood": "bg-status-warning",
  "Decision Made": "bg-status-success",
  "Mitigation Executed": "bg-status-success",
  Other: "bg-line",
};

/**
 * Tells the story of the engineering change -- not a database event log. Every entry's text
 * comes from the audit log's own action string (see src/app/actions.ts for where these are
 * written; several were rewritten as part of this milestone to explain relationships --
 * "X is now linked to Y" rather than "Mapping Approved" -- rather than reformatted here).
 * This component's own job is purely presentational: chronological ordering and a phase
 * indicator, deterministically derived from entity type, never inferred.
 */
export function DecisionTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <Card className="px-4 py-8 text-center">
        <p className="text-sm text-ink-soft">This engineering change&apos;s story starts as soon as the first action is taken.</p>
      </Card>
    );
  }

  // Oldest first -- a story is read start to finish, not most-recent-first like a log feed.
  const chronological = [...entries].reverse();

  return (
    <ol className="space-y-0">
      {chronological.map((entry, idx) => {
        const phase = getDecisionPhase(entry.entityType);
        return (
          <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
            {idx < chronological.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-line" aria-hidden="true" />}
            <span className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${PHASE_DOT[phase]}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-ink-soft">
                <span>{phase}</span>
                <span aria-hidden="true">·</span>
                <span>{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
              <p className="mt-0.5 text-sm text-ink">{entry.action}</p>
              <p className="text-xs text-ink-soft">{entry.actor}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
