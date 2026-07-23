import { db } from "../client";
import { engineeringChanges } from "../schema";
import { eq, desc } from "drizzle-orm";
import { getOrCreateDefaultOrganization } from "./organizations";

export async function createEngineeringChange(
  name: string,
  description: string,
  createdBy: string,
  options: { isReadOnly?: boolean } = {}
) {
  const org = await getOrCreateDefaultOrganization();
  const [ec] = await db
    .insert(engineeringChanges)
    .values({
      organizationId: org.id,
      name,
      description,
      status: "draft",
      createdBy,
      targetEffectiveDate: null,
      isReadOnly: options.isReadOnly ?? false,
    })
    .returning();
  return ec;
}

export async function listEngineeringChanges() {
  const org = await getOrCreateDefaultOrganization();
  return db
    .select()
    .from(engineeringChanges)
    .where(eq(engineeringChanges.organizationId, org.id))
    .orderBy(desc(engineeringChanges.createdAt));
}

export async function getEngineeringChangeById(id: string) {
  const [ec] = await db.select().from(engineeringChanges).where(eq(engineeringChanges.id, id)).limit(1);
  return ec ?? null;
}

export async function updateEngineeringChangeStatus(
  id: string,
  status: "draft" | "mapping_review" | "exposure_calculated" | "mitigating" | "closed"
) {
  await db.update(engineeringChanges).set({ status }).where(eq(engineeringChanges.id, id));
}
