import { db } from "../client";
import { auditLogEntries } from "../schema";
import { eq, desc } from "drizzle-orm";
import { getOrCreateDefaultOrganization } from "./organizations";

export async function recordAuditEvent(entry: {
  engineeringChangeId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actor: string;
  action: string;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
}) {
  const org = await getOrCreateDefaultOrganization();
  await db.insert(auditLogEntries).values({
    organizationId: org.id,
    engineeringChangeId: entry.engineeringChangeId ?? null,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    actor: entry.actor,
    action: entry.action,
    beforeSnapshot: entry.beforeSnapshot !== undefined ? JSON.stringify(entry.beforeSnapshot) : null,
    afterSnapshot: entry.afterSnapshot !== undefined ? JSON.stringify(entry.afterSnapshot) : null,
    timestamp: new Date().toISOString(),
  });
}

export async function getAuditLogForEc(ecId: string) {
  return db
    .select()
    .from(auditLogEntries)
    .where(eq(auditLogEntries.engineeringChangeId, ecId))
    .orderBy(desc(auditLogEntries.timestamp));
}
