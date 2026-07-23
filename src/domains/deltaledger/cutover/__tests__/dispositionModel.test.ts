import { describe, it, expect } from "vitest";
import { computeCutoverDisposition, NOVA_ROBOTICS_DATASET, CutoverSimulationInputs } from "@/domains/deltaledger/cutover/dispositionModel";

/**
 * Every expected total in this file comes directly from the DeltaLedger V3 Master
 * Specification's canonical financial model (Section 5) -- these tests exist to prove the
 * disposition engine reproduces those exact, hand-reconciled figures, not just "a plausible
 * number."
 */

const baseInputs = (overrides: Partial<CutoverSimulationInputs> = {}): CutoverSimulationInputs => ({
  cutoverWeek: 0,
  wipReworkEnabled: true,
  sparesReserveQty: 50,
  harnessConvertEnabled: true,
  ...overrides,
});

describe("computeCutoverDisposition", () => {
  it("Immediate Cutover (Week 0) totals exactly $72,360", () => {
    const result = computeCutoverDisposition(baseInputs({ cutoverWeek: 0 }));
    expect(result.strategy.kind).toBe("immediate");
    expect(result.defectiveUnitsFielded).toBe(0);
    expect(result.netExposure).toBeCloseTo(72_360, 5);

    // Spot-check the individual figures from the spec, not just the total.
    const byId = Object.fromEntries(result.lineItems.map((l) => [l.id, l.amount]));
    expect(byId["pcba-scrap"]).toBeCloseTo(18_200, 5); // 130 * 140
    expect(byId["pcba-PO-3301-B1"]).toBeCloseTo(28_000, 5); // 200 * 140 * 100% (non-cancellable)
    expect(byId["pcba-PO-3301-B2"]).toBeCloseTo(8_400, 5); // 200 * 140 * 30%
    expect(byId["pcba-PO-3301-B3"]).toBeCloseTo(1_400, 5); // 100 * 140 * 10%
    expect(byId["harness-onhand-convert"]).toBeCloseTo(1_320, 5); // 220 * 6
    expect(byId["harness-po-convert"]).toBeCloseTo(2_900, 5); // 600*4 + 500
    expect(byId["wip-rework"]).toBeCloseTo(7_640, 5); // 40*140 + 40*6 + 40*45
    expect(byId["expedite-premium"]).toBeCloseTo(4_500, 5); // 150 * 30
    expect(byId["warranty-estimate"]).toBeUndefined(); // 0 defective units -> no line at all
  });

  it("Controlled Run-Out (full run-out week) totals exactly $24,640", () => {
    const dataset = NOVA_ROBOTICS_DATASET;
    const totalPcbaSupply = dataset.onHandPcbaUnits + dataset.pcbaBatches.reduce((s, b) => s + b.quantity, 0);
    const maxRunOutWeek = totalPcbaSupply / dataset.burnRatePerWeek;
    expect(maxRunOutWeek).toBeCloseTo(27.2, 5);

    const result = computeCutoverDisposition(baseInputs({ cutoverWeek: maxRunOutWeek }));
    expect(result.strategy.kind).toBe("controlled_run_out");
    expect(result.defectiveUnitsFielded).toBeCloseTo(680, 5);
    expect(result.netExposure).toBeCloseTo(24_640, 5);

    const byId = Object.fromEntries(result.lineItems.map((l) => [l.id, l.amount]));
    expect(byId["harness-onhand-convert"]).toBeCloseTo(840, 5); // 140 * 6
    expect(byId["warranty-estimate"]).toBeCloseTo(23_800, 5); // 680 * 35
    expect(byId["pcba-scrap"]).toBeUndefined(); // everything consumed, nothing scrapped
    expect(byId["wip-rework"]).toBeUndefined(); // WIP flows through, not actively dispositioned
    expect(byId["expedite-premium"]).toBeUndefined(); // no active-cutover supply gap

    const warrantyLine = result.lineItems.find((l) => l.id === "warranty-estimate");
    expect(warrantyLine?.confidence).toBe("estimated");
  });

  it("Optimized Phased Cutover (Week 8) totals exactly $45,660", () => {
    const result = computeCutoverDisposition(baseInputs({ cutoverWeek: 8 }));
    expect(result.strategy.kind).toBe("optimized_phased");
    expect(result.defectiveUnitsFielded).toBeCloseTo(200, 5);
    expect(result.netExposure).toBeCloseTo(45_660, 5);

    const byId = Object.fromEntries(result.lineItems.map((l) => [l.id, l.amount]));
    expect(byId["wip-rework"]).toBeCloseTo(7_640, 5);
    expect(byId["pcba-scrap"]).toBeCloseTo(18_200, 5); // 130 * 140 (batch-1 leftover, pooled with on-hand)
    expect(byId["pcba-PO-3301-B2"]).toBeCloseTo(8_400, 5);
    expect(byId["pcba-PO-3301-B3"]).toBeCloseTo(1_400, 5);
    expect(byId["pcba-PO-3301-B1"]).toBeUndefined(); // batch 1 was needed/kept, not cancelled
    expect(byId["harness-onhand-convert"]).toBeCloseTo(120, 5); // 20 * 6
    expect(byId["harness-po-convert"]).toBeCloseTo(2_900, 5);
    expect(byId["warranty-estimate"]).toBeCloseTo(7_000, 5); // 200 * 35
    expect(byId["expedite-premium"]).toBeUndefined(); // Rev C order arrives Week 6, before Week 8 cutover
  });

  it("reserves at most fieldServiceSparesReserveCap units as spares, regardless of a larger requested amount", () => {
    const result = computeCutoverDisposition(baseInputs({ cutoverWeek: 0, sparesReserveQty: 999 }));
    const reserveLine = result.lineItems.find((l) => l.id === "pcba-spares-reserve");
    expect(reserveLine).toBeDefined();
    // 180 on-hand, cap is 50 -> 50 reserved, 130 scrapped, matching the Immediate Cutover figures.
    const scrapLine = result.lineItems.find((l) => l.id === "pcba-scrap");
    expect(scrapLine?.amount).toBeCloseTo(18_200, 5);
  });

  it("disabling WIP rework falls back to naive scrap ($12,480), strictly more expensive than rework ($7,640)", () => {
    const reworked = computeCutoverDisposition(baseInputs({ cutoverWeek: 0, wipReworkEnabled: true }));
    const scrapped = computeCutoverDisposition(baseInputs({ cutoverWeek: 0, wipReworkEnabled: false }));
    const reworkedWip = reworked.lineItems.find((l) => l.id === "wip-rework")!.amount;
    const scrappedWip = scrapped.lineItems.find((l) => l.id === "wip-scrap")!.amount;
    expect(reworkedWip).toBeCloseTo(7_640, 5);
    expect(scrappedWip).toBeCloseTo(12_480, 5); // 40 * 312
    expect(scrappedWip).toBeGreaterThan(reworkedWip);
  });

  it("disabling harness conversion scraps on-hand harness at full value instead of converting it", () => {
    const converted = computeCutoverDisposition(baseInputs({ cutoverWeek: 0, harnessConvertEnabled: true }));
    const scrapped = computeCutoverDisposition(baseInputs({ cutoverWeek: 0, harnessConvertEnabled: false }));
    const convertedAmount = converted.lineItems.find((l) => l.id === "harness-onhand-convert")!.amount;
    const scrappedAmount = scrapped.lineItems.find((l) => l.id === "harness-onhand-scrap")!.amount;
    expect(convertedAmount).toBeCloseTo(1_320, 5);
    expect(scrappedAmount).toBeCloseTo(4_840, 5); // 220 * 22
    expect(scrappedAmount).toBeGreaterThan(convertedAmount);
  });

  it("is deterministic: identical inputs always produce identical output", () => {
    const a = computeCutoverDisposition(baseInputs({ cutoverWeek: 8 }));
    const b = computeCutoverDisposition(baseInputs({ cutoverWeek: 8 }));
    expect(a.netExposure).toBe(b.netExposure);
    expect(a.lineItems).toEqual(b.lineItems);
  });

  it("tags every line item with the correct source-honesty provenance", () => {
    const result = computeCutoverDisposition(baseInputs({ cutoverWeek: 8 }));
    const byId = Object.fromEntries(result.lineItems.map((l) => [l.id, l.provenance]));
    expect(byId["pcba-scrap"]).toBe("scenario_seeded_inventory");
    expect(byId["pcba-spares-reserve"]).toBe("scenario_seeded_inventory");
    expect(byId["wip-rework"]).toBe("scenario_seeded_wip");
    expect(byId["harness-onhand-convert"]).toBe("scenario_seeded_inventory");
    expect(byId["harness-po-convert"]).toBe("scenario_seeded_po_terms");
    expect(byId["pcba-PO-3301-B2"]).toBe("scenario_seeded_po_terms");
    expect(byId["warranty-estimate"]).toBe("calculated_disposition_outcome");
    // No line item may ever claim to be persisted database evidence -- this engine has no
    // database access at all, and the Server Action layer is responsible for keeping the real
    // persisted ExposureRecord total separate and clearly labeled.
    expect(result.lineItems.every((l) => l.provenance !== ("persisted_evidence" as never))).toBe(true);
  });

  describe("Sunrise Electronics cancellation-tier boundaries", () => {
    // Batch due dates translate to notice days (dueWeek * 7) when a batch is cancelled at
    // Week 0. These tests confirm the tier thresholds land exactly where the supplier terms
    // (data, not hardcoded branches) say they should: 45 and 15 days.
    it("44 days' notice (just under 45) gets the 30% tier, not the 10% tier", () => {
      // dueWeek * 7 = 44 is not an integer week, so use a synthetic dataset with an exact boundary.
      const dataset = {
        ...NOVA_ROBOTICS_DATASET,
        pcbaBatches: [{ id: "TEST-44D", quantity: 100, dueWeek: 44 / 7 }],
      };
      const result = computeCutoverDisposition(baseInputs({ cutoverWeek: 0 }), dataset);
      const line = result.pcbaBatchDispositions.find((b) => b.batchId === "TEST-44D");
      expect(line?.cancellationFeePercent).toBeCloseTo(0.3, 5);
    });

    it("45 days' notice gets the 10% tier", () => {
      const dataset = {
        ...NOVA_ROBOTICS_DATASET,
        pcbaBatches: [{ id: "TEST-45D", quantity: 100, dueWeek: 45 / 7 }],
      };
      const result = computeCutoverDisposition(baseInputs({ cutoverWeek: 0 }), dataset);
      const line = result.pcbaBatchDispositions.find((b) => b.batchId === "TEST-45D");
      expect(line?.cancellationFeePercent).toBeCloseTo(0.1, 5);
    });

    it("14 days' notice (just under 15) is non-cancellable (100%)", () => {
      const dataset = {
        ...NOVA_ROBOTICS_DATASET,
        pcbaBatches: [{ id: "TEST-14D", quantity: 100, dueWeek: 14 / 7 }],
      };
      const result = computeCutoverDisposition(baseInputs({ cutoverWeek: 0 }), dataset);
      const line = result.pcbaBatchDispositions.find((b) => b.batchId === "TEST-14D");
      expect(line?.cancellationFeePercent).toBeCloseTo(1.0, 5);
    });

    it("15 days' notice gets the 30% tier", () => {
      const dataset = {
        ...NOVA_ROBOTICS_DATASET,
        pcbaBatches: [{ id: "TEST-15D", quantity: 100, dueWeek: 15 / 7 }],
      };
      const result = computeCutoverDisposition(baseInputs({ cutoverWeek: 0 }), dataset);
      const line = result.pcbaBatchDispositions.find((b) => b.batchId === "TEST-15D");
      expect(line?.cancellationFeePercent).toBeCloseTo(0.3, 5);
    });
  });
});
