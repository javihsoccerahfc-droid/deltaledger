import { describe, it, expect } from "vitest";
import { buildEvidenceExplanation, EvidenceExplanationInput } from "../evidenceExplanation";

function baseInput(overrides: Partial<EvidenceExplanationInput> = {}): EvidenceExplanationInput {
  return {
    record: {
      partId: "PN-1",
      grossCommittedValueReporting: 18400,
      alternateDemandAdjustmentReporting: 0,
      netExposureValueReporting: 18400,
      confidenceClassification: "known",
      classificationReason: null,
    },
    snapshot: {
      quantityOpen: 200,
      unitPriceTransactionCurrency: 92,
      transactionCurrency: "USD",
      reportingCurrency: "USD",
      exchangeRate: 1,
      promisedReceiptDate: "2026-09-01",
    },
    supplierName: "Bosch",
    poNumber: "PO-88213",
    crosswalkEvidence: {
      status: "recorded",
      erpPartId: "771-4471",
      reviewStatus: "approved",
      reviewedBy: "priya",
      reviewedAt: "2026-06-01T00:00:00.000Z",
      matchMethod: "exact",
    },
    allocationMethod: null,
    provenance: "current",
    hasOpenMitigationAction: true,
    hasAlternateDemandAllocation: true,
    ...overrides,
  };
}

describe("buildEvidenceExplanation -- facts vs applied rules", () => {
  it("classifies PO/supplier/quantity/price/crosswalk-approval as facts", () => {
    const explanation = buildEvidenceExplanation(baseInput());
    const factLabels = explanation.facts.map((f) => f.label);
    expect(factLabels).toContain("Purchase Order");
    expect(factLabels).toContain("Supplier");
    expect(factLabels).toContain("Quantity open");
    expect(factLabels).toContain("Unit cost");
    expect(factLabels).toContain("Crosswalk approval");
  });

  it("classifies allocation rule, match method, exchange rate, and alt-demand as applied rules, never as facts", () => {
    const explanation = buildEvidenceExplanation(
      baseInput({
        allocationMethod: "fixed_quantity",
        snapshot: { ...baseInput().snapshot, transactionCurrency: "EUR", reportingCurrency: "USD", exchangeRate: 1.08 },
        record: { ...baseInput().record, alternateDemandAdjustmentReporting: 3850, netExposureValueReporting: 14550 },
      })
    );
    const appliedLabels = explanation.appliedRules.map((r) => r.label);
    const factLabels = explanation.facts.map((f) => f.label);
    expect(appliedLabels).toEqual(
      expect.arrayContaining(["Allocation rule", "Match method", "Exchange rate", "Alternate demand applied"])
    );
    // never blurred -- none of these ever appear in facts
    for (const label of appliedLabels) {
      expect(factLabels).not.toContain(label);
    }
  });

  it("omits exchange rate as an applied rule when transaction and reporting currency are the same (nothing was actually applied)", () => {
    const explanation = buildEvidenceExplanation(baseInput()); // both USD
    expect(explanation.appliedRules.map((r) => r.label)).not.toContain("Exchange rate");
  });
});

describe("buildEvidenceExplanation -- calculation narrative", () => {
  it("shows cause (quantity x price) before consequence (gross, then net), using persisted values directly", () => {
    const explanation = buildEvidenceExplanation(
      baseInput({
        record: { ...baseInput().record, alternateDemandAdjustmentReporting: 3850, netExposureValueReporting: 14550 },
      })
    );
    const labels = explanation.calculationSteps.map((s) => s.label);
    expect(labels[0]).toContain("200 units");
    expect(labels[0]).toContain("$92.00");
    expect(labels).toContain("Gross committed value");
    expect(labels).toContain("Alternate demand adjustment");
    expect(labels[labels.length - 1]).toBe("Net financial exposure");
    expect(explanation.calculationSteps.at(-1)?.value).toBe("$14,550.00");
  });

  it("omits the alternate-demand step entirely when no adjustment was applied -- never shows a redundant zero", () => {
    const explanation = buildEvidenceExplanation(baseInput());
    expect(explanation.calculationSteps.map((s) => s.label)).not.toContain("Alternate demand adjustment");
  });
});

describe("buildEvidenceExplanation -- conclusion explains, doesn't just restate", () => {
  it("gives a distinct, substantive explanation for known, estimated, and unresolved confidence", () => {
    const known = buildEvidenceExplanation(baseInput()).conclusion.explanation;
    const estimated = buildEvidenceExplanation(
      baseInput({ record: { ...baseInput().record, confidenceClassification: "estimated" } })
    ).conclusion.explanation;
    const unresolved = buildEvidenceExplanation(
      baseInput({
        record: { ...baseInput().record, confidenceClassification: "unresolved", classificationReason: "Missing unit price." },
      })
    ).conclusion.explanation;

    expect(known).not.toBe(estimated);
    expect(estimated).not.toBe(unresolved);
    expect(unresolved).toBe("Missing unit price."); // real, specific reason surfaced, not a generic message
  });
});

describe("buildEvidenceExplanation -- deterministic next step", () => {
  it("prioritizes reviewing the crosswalk above everything else when it isn't approved", () => {
    const explanation = buildEvidenceExplanation(
      baseInput({
        crosswalkEvidence: { ...baseInput().crosswalkEvidence, status: "recorded", reviewStatus: "unreviewed" } as never,
        provenance: "stale",
      })
    );
    expect(explanation.nextStep.label).toBe("Review Crosswalk");
  });

  it("recommends recalculating when provenance is stale (and crosswalk is fine)", () => {
    const explanation = buildEvidenceExplanation(baseInput({ provenance: "stale" }));
    expect(explanation.nextStep.label).toBe("Recalculate Exposure");
  });

  it("recommends reviewing the PO when confidence is unresolved (and everything upstream is fine)", () => {
    const explanation = buildEvidenceExplanation(baseInput({ record: { ...baseInput().record, confidenceClassification: "unresolved" } }));
    expect(explanation.nextStep.label).toBe("Review Purchase Order");
  });

  it("recommends opening mitigation when nothing else is blocking and none exists yet", () => {
    const explanation = buildEvidenceExplanation(baseInput({ hasOpenMitigationAction: false }));
    expect(explanation.nextStep.label).toBe("Open Mitigation");
  });

  it("recommends evaluating alternate demand when only that's missing", () => {
    const explanation = buildEvidenceExplanation(baseInput({ hasAlternateDemandAllocation: false }));
    expect(explanation.nextStep.label).toBe("Evaluate Alternate Demand");
  });

  it("says no further action is needed only when every check passes", () => {
    const explanation = buildEvidenceExplanation(baseInput());
    expect(explanation.nextStep.label).toBe("No further action needed");
  });

  it("a legacy record with unavailable crosswalk evidence does NOT recommend 'Review Crosswalk' (we genuinely don't know, so we don't accuse)", () => {
    const explanation = buildEvidenceExplanation(baseInput({ crosswalkEvidence: { status: "legacy_unavailable" } }));
    expect(explanation.nextStep.label).not.toBe("Review Crosswalk");
  });
});

describe("buildEvidenceExplanation -- provenance note", () => {
  it("is null when provenance is current", () => {
    expect(buildEvidenceExplanation(baseInput()).provenanceNote).toBeNull();
  });

  it("surfaces a specific, distinct note for stale vs legacy_unknown provenance", () => {
    const stale = buildEvidenceExplanation(baseInput({ provenance: "stale" })).provenanceNote;
    const legacy = buildEvidenceExplanation(baseInput({ provenance: "legacy_unknown" })).provenanceNote;
    expect(stale).not.toBeNull();
    expect(legacy).not.toBeNull();
    expect(stale).not.toBe(legacy);
  });
});

describe("buildEvidenceExplanation -- Milestone 3.75: frozen crosswalk evidence, never a live lookup", () => {
  it("shows the frozen erpPartId/reviewer/date when crosswalk evidence was recorded at calculation time", () => {
    const explanation = buildEvidenceExplanation(baseInput());
    const crosswalkFact = explanation.facts.find((f) => f.label === "Crosswalk approval");
    expect(crosswalkFact?.value).toContain("771-4471");
    expect(crosswalkFact?.value).toContain("priya");
    expect(crosswalkFact?.value).toContain("recorded at calculation time");
  });

  it("shows an honest 'legacy_unavailable' message instead of guessing, for snapshots that predate evidence freezing", () => {
    const explanation = buildEvidenceExplanation(baseInput({ crosswalkEvidence: { status: "legacy_unavailable" } }));
    const crosswalkFact = explanation.facts.find((f) => f.label === "Crosswalk approval");
    expect(crosswalkFact?.value).toContain("Historical evidence unavailable");
    expect(crosswalkFact?.value).not.toContain("approved"); // never implies a status we don't actually know
    expect(crosswalkFact?.value).not.toContain("rejected");
  });

  it("omits 'Match method' entirely (not a guessed value) when crosswalk evidence is legacy-unavailable", () => {
    const explanation = buildEvidenceExplanation(baseInput({ crosswalkEvidence: { status: "legacy_unavailable" } }));
    expect(explanation.appliedRules.map((r) => r.label)).not.toContain("Match method");
  });
});
