import { Card, CardHeader, CardBody } from "@/components/design-system/Card";
import { formatMoney } from "@/lib/format";

export interface SupplierConcentrationEntry {
  supplierId: string;
  supplierName: string;
  totalExposure: number;
  engineeringChangeCount: number;
}

export function SupplierConcentrationList({ entries }: { entries: SupplierConcentrationEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-ink">Supplier Risk Concentration</h2>
      </CardHeader>
      <CardBody className="px-0 py-0">
        {entries.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-soft">No supplier exposure calculated yet.</p>
        ) : (
          <ol>
            {entries.map((entry, idx) => (
              <li
                key={entry.supplierId}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 ${idx < entries.length - 1 ? "border-b border-line" : ""}`}
              >
                <span className="min-w-0 truncate text-sm text-ink">{entry.supplierName}</span>
                <span className="shrink-0 text-right">
                  <span className="data-num block text-sm font-semibold text-ink">{formatMoney(entry.totalExposure)}</span>
                  <span className="block text-[11px] text-ink-soft">
                    {entry.engineeringChangeCount} engineering change{entry.engineeringChangeCount === 1 ? "" : "s"}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
