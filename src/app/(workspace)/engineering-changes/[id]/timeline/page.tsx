import { getTimelineEntriesAction } from "@/app/actions";
import { DecisionTimeline } from "@/components/timeline/DecisionTimeline";

export default async function TimelinePage({ params }: { params: { id: string } }) {
  const entries = await getTimelineEntriesAction(params.id);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Timeline</h1>
      <p className="mt-1 text-sm text-ink-soft">The story of this engineering change, from creation to today.</p>
      <div className="mt-6">
        <DecisionTimeline entries={entries} />
      </div>
    </div>
  );
}
