import { describe, it, expect } from "vitest";
import { computeStalenessStatus, refreshStaleness, StalenessConfig } from "@/domains/deltaledger/supplierTerms/staleness";
import { SupplierCommitmentTerms } from "@/domains/deltaledger/types";

const config: StalenessConfig = { defaultReviewIntervalDays: 180, reviewWarningDays: 30 };

function terms(overrides: Partial<SupplierCommitmentTerms> = {}): SupplierCommitmentTerms {
  return {
    id: "terms-1",
    supplierId: "sup-1",
    partId: null,
    ncnr: false,
    standardLeadTimeDays: 45,
    cancellationWindowDays: 30,
    source: "verified_contract",
    effectiveDate: "2026-01-01",
    notes: null,
    verifiedAt: "2026-01-01T00:00:00Z",
    verifiedBy: "u1",
    validUntil: null,
    stalenessStatus: "unverified",
    ...overrides,
  };
}

describe("computeStalenessStatus", () => {
  it("is 'unverified' whenever verifiedAt is null, regardless of validUntil", () => {
    const status = computeStalenessStatus({ verifiedAt: null, validUntil: "2027-01-01" }, "2026-07-16", config);
    expect(status).toBe("unverified");
  });

  it("is 'current' well before an explicit validUntil date", () => {
    const status = computeStalenessStatus(
      { verifiedAt: "2026-01-01T00:00:00Z", validUntil: "2027-01-01" },
      "2026-07-16",
      config
    );
    expect(status).toBe("current");
  });

  it("is 'review_due' within the warning window before an explicit validUntil", () => {
    const status = computeStalenessStatus(
      { verifiedAt: "2026-01-01T00:00:00Z", validUntil: "2026-08-01" },
      "2026-07-16", // 16 days before validUntil, within the 30-day warning window
      config
    );
    expect(status).toBe("review_due");
  });

  it("is 'expired' the day after an explicit validUntil", () => {
    const status = computeStalenessStatus(
      { verifiedAt: "2026-01-01T00:00:00Z", validUntil: "2026-07-15" },
      "2026-07-16",
      config
    );
    expect(status).toBe("expired");
  });

  it("treats the exact validUntil day as still valid (review_due), not yet expired", () => {
    const status = computeStalenessStatus(
      { verifiedAt: "2026-01-01T00:00:00Z", validUntil: "2026-07-16" },
      "2026-07-16",
      config
    );
    expect(status).toBe("review_due");
  });

  it("falls back to the configurable default review interval when validUntil is absent", () => {
    // verifiedAt + 180 days = 2026-06-30; as-of 2026-07-16 is 16 days past that.
    const status = computeStalenessStatus(
      { verifiedAt: "2026-01-01T00:00:00Z", validUntil: null },
      "2026-07-16",
      config
    );
    expect(status).toBe("expired");
  });

  it("is 'current' under the default interval when well within it", () => {
    const status = computeStalenessStatus(
      { verifiedAt: "2026-07-01T00:00:00Z", validUntil: null },
      "2026-07-16",
      config
    );
    expect(status).toBe("current");
  });

  it("respects a different configured interval/warning without a code change", () => {
    const tightConfig: StalenessConfig = { defaultReviewIntervalDays: 10, reviewWarningDays: 2 };
    const status = computeStalenessStatus(
      { verifiedAt: "2026-07-01T00:00:00Z", validUntil: null },
      "2026-07-09", // 8 days in, 2 days from the 10-day interval boundary
      tightConfig
    );
    expect(status).toBe("review_due");
  });
});

describe("refreshStaleness", () => {
  it("returns a new object with stalenessStatus recomputed, other fields untouched", () => {
    const original = terms({ verifiedAt: "2025-01-01T00:00:00Z", validUntil: "2025-06-01", stalenessStatus: "current" });
    const refreshed = refreshStaleness(original, "2026-07-16", config);
    expect(refreshed.stalenessStatus).toBe("expired");
    expect(refreshed.supplierId).toBe(original.supplierId);
    expect(original.stalenessStatus).toBe("current"); // pure function, original untouched
  });
});
