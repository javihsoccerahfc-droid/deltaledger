import { Card, CardHeader, CardBody } from "@/components/design-system/Card";

export interface RecentActivityEntry {
  description: string;
  ecId: string | null;
}

export function RecentActivity({ entries }: { entries: RecentActivityEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-ink">Recent Activity</h2>
      </CardHeader>
      <CardBody>
        {entries.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing has happened yet.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry, idx) => (
              <li key={idx} className="text-sm text-ink-soft">
                {entry.description}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
