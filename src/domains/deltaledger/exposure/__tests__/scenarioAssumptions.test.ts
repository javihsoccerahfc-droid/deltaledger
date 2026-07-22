import { describe, it, expect } from "vitest";
import { runExposurePipeline, ExposurePipelineDataset } from "@/domains/deltaledger/exposure/exposurePipeline";
import { applyScenarioAssumptions, describeScenarioAssumption, ScenarioAssumption } from "@/domains/deltaledger/exposure/scenarioAssumptions";
import { BomDiffEntry, PartNumberCrosswalk, PurchaseOrderLine } from "@/domains/deltaledger/types";

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

describe("applyScenarioAssumptions", () => {
  it("never mutates the input dataset", () => {
    const dataset = baseDataset();
    const frozenPoLines = [...dataset.poLines];
    applyScenarioAssumptions(dataset, [{ kind: "quantityOverride", purchaseOrderLineId: "poline-1", quantityOpen: 500 }]);
    expect(dataset.poLines).toEqual(frozenPoLines);
  });

  it("quantityOverride changes only the quantity of the targeted PO line and flows through to the calculation", () => {
    const dataset = baseDataset();
    const scenario = applyScenarioAssumptions(dataset, [{ kind: "quantityOverride", purchaseOrderLineId: "poline-1", quantityOpen: 400 }]);
    const outcomes = runExposurePipeline(scenario);
    expect(outcomes[0].kind).toBe("created");
    if (outcomes[0].kind === "created") {
      expect(outcomes[0].record.grossCommittedValueReporting).toBe(4000); // 400 * 10
    }
  });

  it("priceOverride changes only the price of the targeted PO line", () => {
    const dataset = baseDataset();
    const scenario = applyScenarioAssumptions(dataset, [
      { kind: "priceOverride", purchaseOrderLineId: "poline-1", unitPriceTransactionCurrency: 25 },
    ]);
    const outcomes = runExposurePipeline(scenario);
    expect(outcomes[0].kind).toBe("created");
    if (outcomes[0].kind === "created") {
      expect(outcomes[0].record.grossCommittedValueReporting).toBe(25000); // 1000 * 25
    }
  });

  it("supplierReassignment changes which supplier's terms apply without touching other lines on the same real PO", () => {
    const dataset = baseDataset({
      poLines: [makePoLine({ id: "poline-1" }), makePoLine({ id: "poline-2", rawPartNumber: "ERP-002" })],
      supplierTermsBySupplierId: {
        "sup-1": undefined,
        "sup-2": {
          id: "terms-2",
          supplierId: "sup-2",
          partId: null,
          ncnr: true,
          standardLeadTimeDays: 30,
          cancellationWindowDays: 10,
          source: "verified_contract",
          effectiveDate: "2026-01-01",
          notes: null,
          verifiedAt: "2026-01-01T00:00:00Z",
          verifiedBy: "u1",
          validUntil: null,
          stalenessStatus: "current",
        },
      },
    });
    const scenario = applyScenarioAssumptions(dataset, [
      { kind: "supplierReassignment", purchaseOrderLineId: "poline-1", supplierId: "sup-2" },
    ]);
    // Line 2 keeps its original PO / supplier assignment.
    const line2 = scenario.poLines.find((l) => l.id === "poline-2")!;
    expect(scenario.purchaseOrdersById[line2.purchaseOrderId].supplierId).toBe("sup-1");
    // Line 1 is now attributed to a synthetic PO under supplier 2.
    const line1 = scenario.poLines.find((l) => l.id === "poline-1")!;
    expect(scenario.purchaseOrdersById[line1.purchaseOrderId].supplierId).toBe("sup-2");
  });

  it("allocationOverride forces a specific allocation method for a crosswalk", () => {
    const dataset = baseDataset({ crosswalks: [makeCrosswalk({ mappingType: "one_to_many" })] });
    const scenario = applyScenarioAssumptions(dataset, [
      { kind: "allocationOverride", crosswalkId: "cw-1", method: "manual", manualAllocationQuantity: 250 },
    ]);
    const outcomes = runExposurePipeline(scenario);
    expect(outcomes[0].kind).toBe("created");
    if (outcomes[0].kind === "created") {
      expect(outcomes[0].allocation).toEqual({ resolved: true, allocatedQuantity: 250, method: "manual" });
      expect(outcomes[0].record.grossCommittedValueReporting).toBe(2500); // 250 * 10
    }
  });

  it("alternateDemandOverride nets against gross committed value and raises confidence to known", () => {
    const dataset = baseDataset();
    const scenario = applyScenarioAssumptions(dataset, [
      { kind: "alternateDemandOverride", purchaseOrderLineId: "poline-1", allocatedQuantity: 400 },
    ]);
    const outcomes = runExposurePipeline(scenario);
    expect(outcomes[0].kind).toBe("created");
    if (outcomes[0].kind === "created") {
      expect(outcomes[0].record.netExposureValueReporting).toBe(6000); // (1000-400) * 10
      expect(outcomes[0].record.confidenceClassification).toBe("known");
    }
  });

  it("applies multiple assumptions together, composing cleanly", () => {
    const dataset = baseDataset();
    const scenario = applyScenarioAssumptions(dataset, [
      { kind: "quantityOverride", purchaseOrderLineId: "poline-1", quantityOpen: 800 },
      { kind: "priceOverride", purchaseOrderLineId: "poline-1", unitPriceTransactionCurrency: 12 },
      { kind: "alternateDemandOverride", purchaseOrderLineId: "poline-1", allocatedQuantity: 200 },
    ]);
    const outcomes = runExposurePipeline(scenario);
    expect(outcomes[0].kind).toBe("created");
    if (outcomes[0].kind === "created") {
      // gross = 800 * 12 = 9600; netted qty = 600; net = 600 * 12 = 7200
      expect(outcomes[0].record.grossCommittedValueReporting).toBe(9600);
      expect(outcomes[0].record.netExposureValueReporting).toBe(7200);
    }
  });

  it("later assumptions targeting the same field win over earlier ones (last write wins)", () => {
    const dataset = baseDataset();
    const scenario = applyScenarioAssumptions(dataset, [
      { kind: "quantityOverride", purchaseOrderLineId: "poline-1", quantityOpen: 100 },
      { kind: "quantityOverride", purchaseOrderLineId: "poline-1", quantityOpen: 900 },
    ]);
    const outcomes = runExposurePipeline(scenario);
    expect(outcomes[0].kind).toBe("created");
    if (outcomes[0].kind === "created") {
      expect(outcomes[0].record.grossCommittedValueReporting).toBe(9000); // 900 * 10, not 100 * 10
    }
  });
});

describe("describeScenarioAssumption", () => {
  it("produces a plain-language label for every assumption kind", () => {
    const cases: ScenarioAssumption[] = [
      { kind: "quantityOverride", purchaseOrderLineId: "poline-1", quantityOpen: 400 },
      { kind: "priceOverride", purchaseOrderLineId: "poline-1", unitPriceTransactionCurrency: 12 },
      { kind: "supplierReassignment", purchaseOrderLineId: "poline-1", supplierId: "sup-2", supplierName: "Acme" },
      { kind: "allocationOverride", crosswalkId: "cw-1", method: "manual", manualAllocationQuantity: 250 },
      { kind: "alternateDemandOverride", purchaseOrderLineId: "poline-1", allocatedQuantity: 200 },
    ];
    for (const c of cases) {
      const label = describeScenarioAssumption(c);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("falls back to a raw PO line reference when no context is supplied", () => {
    const label = describeScenarioAssumption({ kind: "quantityOverride", purchaseOrderLineId: "poline-1", quantityOpen: 400 });
    expect(label).toContain("PO line poline-1");
  });

  it("uses human-readable business context instead of raw ids when context is supplied", () => {
    const label = describeScenarioAssumption(
      { kind: "quantityOverride", purchaseOrderLineId: "poline-1", quantityOpen: 400 },
      { poLineLabel: () => "Widget Assembly — PO-4471 (Bosch)" }
    );
    expect(label).toContain("Widget Assembly — PO-4471 (Bosch)");
    expect(label).not.toContain("poline-1");
  });

  it("uses human-readable crosswalk context for allocation overrides when supplied", () => {
    const label = describeScenarioAssumption(
      { kind: "allocationOverride", crosswalkId: "cw-1", method: "manual", manualAllocationQuantity: 250 },
      { crosswalkLabel: () => "PN-4471 → 771-4471" }
    );
    expect(label).toContain("PN-4471 → 771-4471");
    expect(label).not.toContain("cw-1");
  });
});
