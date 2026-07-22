import { describe, it, expect } from "vitest";
import { runExposurePipeline, ExposurePipelineDataset } from "@/domains/deltaledger/exposure/exposurePipeline";
import { BomDiffEntry, PartNumberCrosswalk, PurchaseOrderLine, CrosswalkAllocationRule } from "@/domains/deltaledger/types";

/**
 * These tests exercise `runExposurePipeline` directly -- the pure orchestration layer
 * extracted from db/repositories/exposure.ts in Milestone 4 -- with no database involved.
 * They are the fast, DB-free proof that Identity Resolution -> PO line matching -> Allocation
 * -> Calculation behaves correctly as a pure function of its dataset; db/__tests__/exposureFlow
 * and identityResolutionVerification cover the same behaviors end-to-end through real Server
 * Actions, and both suites must keep passing together (see MILESTONE_4_REGRESSION_NOTES.md).
 */

function makeDiffEntry(overrides: Partial<BomDiffEntry> = {}): BomDiffEntry {
  return {
    id: "diff-1",
    engineeringChangeId: "ec-1",
    partId: "PN-001",
    changeType: "removed",
    fromQuantity: 1000,
    toQuantity: 0,
    replacementPartId: null,
    ...overrides,
  };
}

function makeCrosswalk(overrides: Partial<PartNumberCrosswalk> = {}): PartNumberCrosswalk {
  return {
    id: "cw-1",
    plmPartId: "PN-001",
    erpPartId: "ERP-001",
    matchMethod: "exact",
    confidence: 1,
    reviewStatus: "approved",
    reviewedBy: "u1",
    reviewedAt: "2026-07-01T00:00:00Z",
    effectiveDate: "2026-07-01",
    notes: null,
    mappingType: "one_to_one",
    supersededById: null,
    ...overrides,
  };
}

function makePoLine(overrides: Partial<PurchaseOrderLine> = {}): PurchaseOrderLine {
  return {
    id: "poline-1",
    purchaseOrderId: "po-1",
    partId: null,
    rawPartNumber: "ERP-001",
    quantityOpen: 1000,
    quantityParseStatus: "ok",
    transactionCurrency: "USD",
    unitPriceTransactionCurrency: 10,
    priceParseStatus: "ok",
    promisedReceiptDate: "2026-09-01",
    lineStatus: "open",
    sourceRow: 1,
    ...overrides,
  };
}

function baseDataset(overrides: Partial<ExposurePipelineDataset> = {}): ExposurePipelineDataset {
  return {
    diffEntries: [makeDiffEntry()],
    poLines: [makePoLine()],
    purchaseOrdersById: { "po-1": { id: "po-1", supplierId: "sup-1", sourceFile: "po.xlsx" } },
    crosswalks: [makeCrosswalk()],
    allocationRulesByCrosswalkId: {},
    supplierTermsBySupplierId: {},
    exchangeRates: [],
    alternateDemandByPoLineId: {},
    reportingCurrency: "USD",
    formulaVersion: "v1",
    asOfDate: "2026-07-21",
    calculatedAt: "2026-07-21T00:00:00Z",
    fallbackSourceFile: "unknown-source.xlsx",
    ...overrides,
  };
}

describe("runExposurePipeline", () => {
  it("produces one created outcome for a simple one-to-one, fully-resolved pair", () => {
    const outcomes = runExposurePipeline(baseDataset());
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].kind).toBe("created");
    if (outcomes[0].kind === "created") {
      expect(outcomes[0].record.grossCommittedValueReporting).toBe(10000);
      expect(outcomes[0].purchaseOrderLineId).toBe("poline-1");
    }
  });

  it("reports a gap, not a record, when no crosswalk resolves the diff entry's part id", () => {
    const outcomes = runExposurePipeline(baseDataset({ crosswalks: [] }));
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].kind).toBe("gap");
    if (outcomes[0].kind === "gap") {
      expect(outcomes[0].reason).toContain("No approved crosswalk exists");
    }
  });

  it("reports a gap when identity resolves but no PO line matches the resolved ERP id", () => {
    const outcomes = runExposurePipeline(baseDataset({ poLines: [] }));
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].kind).toBe("gap");
    if (outcomes[0].kind === "gap") {
      expect(outcomes[0].reason).toContain("No purchase order line found");
    }
  });

  it("produces one created outcome per resolved identity for a genuine one-to-many crosswalk split", () => {
    const cwA = makeCrosswalk({ id: "cw-a", erpPartId: "ERP-A" });
    const cwB = makeCrosswalk({ id: "cw-b", erpPartId: "ERP-B" });
    const lineA = makePoLine({ id: "poline-a", purchaseOrderId: "po-1", rawPartNumber: "ERP-A", quantityOpen: 90, unitPriceTransactionCurrency: 10 });
    const lineB = makePoLine({ id: "poline-b", purchaseOrderId: "po-1", rawPartNumber: "ERP-B", quantityOpen: 60, unitPriceTransactionCurrency: 10 });

    const outcomes = runExposurePipeline(baseDataset({ crosswalks: [cwA, cwB], poLines: [lineA, lineB] }));
    expect(outcomes).toHaveLength(2);
    expect(outcomes.every((o) => o.kind === "created")).toBe(true);
    const totals = outcomes
      .filter((o) => o.kind === "created")
      .map((o) => (o as Extract<typeof o, { kind: "created" }>).record.grossCommittedValueReporting)
      .sort((a, b) => a - b);
    expect(totals).toEqual([600, 900]);
  });

  it("applies allocation rules from allocationRulesByCrosswalkId for a one_to_many mapping", () => {
    const crosswalk = makeCrosswalk({ mappingType: "one_to_many" });
    const rule: CrosswalkAllocationRule = {
      id: "rule-1",
      crosswalkId: "cw-1",
      method: "percentage",
      plantCode: null,
      supplierId: null,
      fixedQuantity: null,
      percentage: 100,
      notes: null,
      effectiveDate: "2026-07-01",
    };
    const outcomes = runExposurePipeline(
      baseDataset({ crosswalks: [crosswalk], allocationRulesByCrosswalkId: { "cw-1": [rule] } })
    );
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].kind).toBe("created");
    if (outcomes[0].kind === "created") {
      expect(outcomes[0].allocation).toEqual({ resolved: true, allocatedQuantity: 1000, method: "percentage" });
    }
  });

  it("nets alternate demand from alternateDemandByPoLineId, unaffected by which diff entry matched", () => {
    const outcomes = runExposurePipeline(
      baseDataset({
        alternateDemandByPoLineId: {
          "poline-1": { allocatedQuantity: 300, allocationIds: ["alloc-1"], explicitlyConfirmedZero: false },
        },
      })
    );
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].kind).toBe("created");
    if (outcomes[0].kind === "created") {
      expect(outcomes[0].record.netExposureValueReporting).toBe(7000);
      expect(outcomes[0].record.confidenceClassification).toBe("known");
    }
  });

  it("is a pure function: running twice on the same dataset produces the same financial outcome", () => {
    const dataset = baseDataset();
    const first = runExposurePipeline(dataset);
    const second = runExposurePipeline(dataset);
    expect(first[0].kind).toBe(second[0].kind);
    if (first[0].kind === "created" && second[0].kind === "created") {
      expect(first[0].record.netExposureValueReporting).toBe(second[0].record.netExposureValueReporting);
      expect(first[0].record.confidenceClassification).toBe(second[0].record.confidenceClassification);
    }
    // Confirms the input dataset itself was never mutated by the run.
    expect(dataset.diffEntries).toHaveLength(1);
  });
});
