export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  recordId?: string;
  before?: string;
  after?: string;
}

let seq = 0;

export function createAuditEntry(entry: Omit<AuditEntry, "id" | "timestamp">): AuditEntry {
  seq += 1;
  return { ...entry, id: `audit-${seq}-${Date.now()}`, timestamp: new Date().toISOString() };
}
