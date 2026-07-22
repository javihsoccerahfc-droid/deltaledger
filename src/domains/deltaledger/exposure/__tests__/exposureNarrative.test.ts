import { describe, it, expect } from "vitest";
import { summarizeExposureNarrative, ExposureNarrativeRecord } from "../exposureNarrative";

function record(overrides: Partial<ExposureNarrativeRecord> = {}): ExposureNarrativeRecord {
  return {
    partId: "PN-1",
    supplierName: "Bosch",
    netExposureValueReporting: 100,
    confidenceClassification: "known",
    ...overrides,
  };
}

describe("summarizeExposureNarrative", () => {
  it("returns null for no records -- there is nothing to narrate", () => {
    expect(summarizeExposureNarrative([])).toBeNull();
  });

  it("uses a plain current-state headline (no confidence breakdown) when everything is one confidence bucket", () => {
    const narrative = summarizeExposureNarrative([
      record({ partId: "PN-1", supplierName: "Bosch", netExposureValueReporting: 200000, confidenceClassification: "known" }),
      record({ partId: "PN-2", supplierName: "Continental", netExposureValueReporting: 140000, confidenceClassification: "known" }),
    ]);
    expect(narrative).not.toBeNull();
    expect(narrative!.headline).toBe("$340,000.00 of known exposure across 2 suppliers.");
    expect(narrative!.headline).not.toContain("known,"); // no breakdown punctuation when unmixed
  });

  it("makes the confidence composition explicit when exposure is mixed across confidence levels", () => {
    const narrative = summarizeExposureNarrative([
      record({ partId: "PN-1", supplierName: "Bosch", netExposureValueReporting: 220000, confidenceClassification: "known" }),
      record({ partId: "PN-2", supplierName: "Continental", netExposureValueReporting: 90000, confidenceClassification: "estimated" }),
    ]);
    expect(narrative!.headline).toBe(
      "$310,000.00 of total exposure across 2 suppliers: $220,000.00 known and $90,000.00 estimated."
    );
  });

  it("describes unresolved records by COUNT, never a dollar figure -- a real unresolved record carries $0 net exposure by construction", () => {
    const narrative = summarizeExposureNarrative([
      record({ partId: "PN-1", supplierName: "Bosch", netExposureValueReporting: 220000, confidenceClassification: "known" }),
      record({ partId: "PN-2", supplierName: "Continental", netExposureValueReporting: 0, confidenceClassification: "unresolved" }),
      record({ partId: "PN-3", supplierName: "Continental", netExposureValueReporting: 0, confidenceClassification: "unresolved" }),
    ]);
    expect(narrative!.headline).toBe(
      "$220,000.00 of total exposure across 2 suppliers: $220,000.00 known and 2 records not yet determinable."
    );
    expect(narrative!.headline).not.toContain("$0"); // never a misleading $0 dollar claim
  });

  it("handles the all-unresolved case honestly -- no dollar total to lead with", () => {
    const narrative = summarizeExposureNarrative([
      record({ partId: "PN-1", supplierName: "Bosch", netExposureValueReporting: 0, confidenceClassification: "unresolved" }),
    ]);
    expect(narrative!.headline).toBe("1 exposure record across supplier Bosch, none yet determinable.");
  });

  it("never claims a trend -- the headline never mentions 'up', 'down', 'since', 'increase', or 'decrease'", () => {
    const narrative = summarizeExposureNarrative([
      record({ netExposureValueReporting: 500000 }),
      record({ partId: "PN-2", netExposureValueReporting: 100000 }),
    ]);
    for (const word of ["up ", "down ", "since", "increase", "decrease", "trend"]) {
      expect(narrative!.headline.toLowerCase()).not.toContain(word);
    }
  });

  it("names the single supplier directly when there's only one, rather than saying '1 supplier'", () => {
    const narrative = summarizeExposureNarrative([record({ supplierName: "Bosch", netExposureValueReporting: 50000 })]);
    expect(narrative!.headline).toContain("supplier Bosch");
    expect(narrative!.headline).not.toContain("1 supplier");
  });

  it("counts unique parts and suppliers correctly, not just record count", () => {
    const narrative = summarizeExposureNarrative([
      record({ partId: "PN-1", supplierName: "Bosch" }),
      record({ partId: "PN-1", supplierName: "Bosch" }), // same part+supplier, e.g. two PO lines
      record({ partId: "PN-2", supplierName: "Continental" }),
    ]);
    expect(narrative!.partCount).toBe(2);
    expect(narrative!.supplierCount).toBe(2);
    expect(narrative!.scopeLine).toBe("Affects 2 parts across 2 suppliers.");
  });

  it("ranks topSuppliers by net exposure, descending, capped at 3", () => {
    const narrative = summarizeExposureNarrative([
      record({ partId: "PN-1", supplierName: "Small Supplier", netExposureValueReporting: 1000 }),
      record({ partId: "PN-2", supplierName: "Big Supplier", netExposureValueReporting: 900000 }),
      record({ partId: "PN-3", supplierName: "Medium Supplier", netExposureValueReporting: 50000 }),
      record({ partId: "PN-4", supplierName: "Fourth Supplier", netExposureValueReporting: 10000 }),
    ]);
    expect(narrative!.topSuppliers).toHaveLength(3);
    expect(narrative!.topSuppliers[0].name).toBe("Big Supplier");
    expect(narrative!.topSuppliers[1].name).toBe("Medium Supplier");
    expect(narrative!.topSuppliers[2].name).toBe("Fourth Supplier");
  });

  it("aggregates a supplier's total across multiple parts/lines rather than double-listing them", () => {
    const narrative = summarizeExposureNarrative([
      record({ partId: "PN-1", supplierName: "Bosch", netExposureValueReporting: 100000 }),
      record({ partId: "PN-2", supplierName: "Bosch", netExposureValueReporting: 50000 }),
    ]);
    expect(narrative!.topSuppliers).toHaveLength(1);
    expect(narrative!.topSuppliers[0]).toEqual({ name: "Bosch", total: 150000 });
  });

  it("every number in the output is a direct sum of the input records -- no computed/derived financial values", () => {
    const records = [
      record({ partId: "PN-1", netExposureValueReporting: 220000, confidenceClassification: "known" }),
      record({ partId: "PN-2", netExposureValueReporting: 90000, confidenceClassification: "estimated" }),
      record({ partId: "PN-3", netExposureValueReporting: 0, confidenceClassification: "unresolved" }),
    ];
    const narrative = summarizeExposureNarrative(records);
    expect(narrative!.totalNet).toBe(310000);
    expect(narrative!.knownTotal).toBe(220000);
    expect(narrative!.estimatedTotal).toBe(90000);
    expect(narrative!.unresolvedTotal).toBe(0);
    expect(narrative!.unresolvedCount).toBe(1);
  });
});
