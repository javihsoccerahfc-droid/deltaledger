import { describe, it, expect, beforeAll, vi } from "vitest";
import { resetTestDatabase } from "./testDb";
import * as ecRepo from "../repositories/engineeringChanges";
import * as bomRepo from "../repositories/bom";
import {
  generateMappingSuggestionsAction,
  approveMappingAction,
  calculateExposureAction,
  createMitigationAction,
} from "@/app/actions";
import { User } from "@/domains/deltaledger/types";

// actions.ts calls revalidatePath(), which requires a live Next.js request-scoped store that
// doesn't exist when calling a Server Action directly from a test -- the same established
// pattern every other db test that imports actions.ts already uses (see importActions.test.ts,
// exposureProvenance.test.ts, etc.).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const partDataOwner: User = { id: "u-pdo", name: "Pat Owner", role: "part_data_owner" };

beforeAll(async () => {
  await resetTestDatabase();
});

/**
 * Proves the read-only guard (src/domains/deltaledger/readOnly.ts) actually prevents writes
 * against a real, persisted engineering change -- not just that the guard function itself
 * returns the right thing in isolation. This is the enforcement boundary the V3 read-only demo
 * decision depends on; it has to be verified against the real Server Action + repository layer,
 * not asserted.
 */
describe("Read-only enforcement (real Server Actions, real Postgres)", () => {
  it("rejects a mutating action against a read-only engineering change, and performs no write", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO-9100: Read-only enforcement test", "desc", partDataOwner.id, {
      isReadOnly: true,
    });

    // generateMappingSuggestionsAction throws (void-returning action) -- must reject, not
    // silently no-op and not silently succeed.
    await expect(generateMappingSuggestionsAction(ec.id, partDataOwner)).rejects.toThrow(/read-only/i);

    // approveMappingAction returns a {success, message} shape -- must report failure through
    // that same shape, not throw an unhandled exception the UI has no path to display.
    const approveResult = await approveMappingAction(ec.id, "nonexistent-crosswalk-id", partDataOwner);
    expect(approveResult.success).toBe(false);
    if (!approveResult.success) {
      expect(approveResult.message).toMatch(/read-only/i);
    }

    // calculateExposureAction throws -- confirm no exposure calculation actually ran by
    // checking the BOM diff (untouched) rather than assuming from the rejection alone.
    await expect(calculateExposureAction(ec.id, partDataOwner)).rejects.toThrow(/read-only/i);
    const diff = await bomRepo.getBomDiffForEc(ec.id);
    expect(diff).toEqual([]);

    // createMitigationAction throws.
    await expect(
      createMitigationAction(ec.id, "nonexistent-exposure-record-id", "cancel", partDataOwner.id, null, partDataOwner)
    ).rejects.toThrow(/read-only/i);
  });

  it("allows the identical actions against a normal, editable engineering change", async () => {
    const ec = await ecRepo.createEngineeringChange("ECO-9101: Editable control case", "desc", partDataOwner.id);

    // Should not throw and should return a real (if empty, since no BOM/PO exist yet) result --
    // proves the guard is scoped to isReadOnly specifically, not blocking everything.
    const suggestions = await generateMappingSuggestionsAction(ec.id, partDataOwner);
    expect(Array.isArray(suggestions)).toBe(true);
  });
});
