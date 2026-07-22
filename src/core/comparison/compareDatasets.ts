export interface ComparisonConfig<T> {
  idOf(record: T): string | null; // e.g. an invoice number — null means "unmatchable by id"
  groupOf(record: T): string; // e.g. a debtor name
  amountOf(record: T): number; // e.g. an outstanding balance
  bucketOf?(record: T): string; // optional categorical bucket, e.g. an aging bucket
  materialChangeThreshold: number;
}

export interface IdMigration<T> {
  id: string;
  group: string;
  priorBucket?: string;
  currentBucket?: string;
  amount: number;
  currentRecord: T;
}

export interface GroupComparisonRow {
  group: string;
  priorAmount: number;
  currentAmount: number;
  changePct: number | null;
  isNew: boolean;
  isAbsent: boolean;
}

export interface DatasetComparisonResult<T> {
  migrations: IdMigration<T>[];
  disappearedIds: { id: string; group: string; priorAmount: number; priorRecord: T }[];
  newIds: { id: string; group: string; currentAmount: number }[];
  groupRows: GroupComparisonRow[];
  totalPrior: number;
  totalCurrent: number;
  totalChangePct: number | null;
}

export function compareDatasets<T>(
  prior: T[],
  current: T[],
  config: ComparisonConfig<T>
): DatasetComparisonResult<T> {
  const priorById = new Map<string, T>();
  for (const r of prior) {
    const id = config.idOf(r);
    if (id) priorById.set(id, r);
  }
  const currentById = new Map<string, T>();
  for (const r of current) {
    const id = config.idOf(r);
    if (id) currentById.set(id, r);
  }

  const disappearedIds: DatasetComparisonResult<T>["disappearedIds"] = [];
  for (const [id, priorRec] of priorById) {
    if (!currentById.has(id)) {
      disappearedIds.push({ id, group: config.groupOf(priorRec), priorAmount: config.amountOf(priorRec), priorRecord: priorRec });
    }
  }

  const migrations: IdMigration<T>[] = [];
  for (const [id, currentRec] of currentById) {
    const priorRec = priorById.get(id);
    if (priorRec && config.bucketOf) {
      const priorBucket = config.bucketOf(priorRec);
      const currentBucket = config.bucketOf(currentRec);
      if (priorBucket !== currentBucket) {
        migrations.push({
          id,
          group: config.groupOf(currentRec),
          priorBucket,
          currentBucket,
          amount: config.amountOf(currentRec),
          currentRecord: currentRec,
        });
      }
    }
  }

  const priorGroups = new Map<string, number>();
  for (const r of prior) priorGroups.set(config.groupOf(r), (priorGroups.get(config.groupOf(r)) ?? 0) + config.amountOf(r));
  const currentGroups = new Map<string, number>();
  for (const r of current)
    currentGroups.set(config.groupOf(r), (currentGroups.get(config.groupOf(r)) ?? 0) + config.amountOf(r));

  const allGroups = new Set([...priorGroups.keys(), ...currentGroups.keys()]);
  const groupRows: GroupComparisonRow[] = [];
  const newIds: DatasetComparisonResult<T>["newIds"] = [];

  for (const group of allGroups) {
    const priorAmount = priorGroups.get(group) ?? 0;
    const currentAmount = currentGroups.get(group) ?? 0;
    const isNew = !priorGroups.has(group) && currentGroups.has(group);
    const isAbsent = priorGroups.has(group) && !currentGroups.has(group);
    const changePct = priorAmount > 0 ? (currentAmount - priorAmount) / priorAmount : null;
    groupRows.push({ group, priorAmount, currentAmount, changePct, isNew, isAbsent });
    if (isNew) newIds.push({ id: group, group, currentAmount });
  }

  const totalPrior = prior.reduce((s, r) => s + config.amountOf(r), 0);
  const totalCurrent = current.reduce((s, r) => s + config.amountOf(r), 0);
  const totalChangePct = totalPrior > 0 ? (totalCurrent - totalPrior) / totalPrior : null;

  return {
    migrations,
    disappearedIds,
    newIds,
    groupRows: groupRows.sort((a, b) => b.currentAmount - a.currentAmount),
    totalPrior,
    totalCurrent,
    totalChangePct,
  };
}
