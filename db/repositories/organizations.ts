import { db } from "../client";
import { organizations } from "../schema";
import { eq } from "drizzle-orm";

const DEFAULT_ORG_NAME = "Default Organization";

/**
 * Until Phase 5 (real auth) exists, every record belongs to one bootstrap
 * organization. Every table already has organizationId columns so real
 * multi-tenancy is a matter of resolving the *real* org from a session
 * instead of this function -- not a schema change later.
 */
export async function getOrCreateDefaultOrganization() {
  const existing = await db.select().from(organizations).where(eq(organizations.name, DEFAULT_ORG_NAME)).limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db.insert(organizations).values({ name: DEFAULT_ORG_NAME }).returning();
  return created;
}
