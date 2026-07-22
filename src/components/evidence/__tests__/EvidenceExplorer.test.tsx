import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceExplorer } from "../EvidenceExplorer";
import { buildEvidenceExplanation, EvidenceExplanationInput } from "@/domains/deltaledger/evidenceExplanation";

function input(overrides: Partial<EvidenceExplanationInput> = {}): EvidenceExplanationInput {
  return {
    record: {
      partId: "PN-4471",
      grossCommittedValueReporting: 18400,
      alternateDemandAdjustmentReporting: 3850,
      netExposureValueReporting: 14550,
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
    allocationMethod: "fixed_quantity",
    provenance: "current",
    hasOpenMitigationAction: true,
    hasAlternateDemandAllocation: true,
    ...overrides,
  };
}

describe("EvidenceExplorer", () => {
  it("Phase 6D -- leads with the Hero (conclusion + next step), before Facts, Applied Rules, and Calculation", () => {
    const explanation = buildEvidenceExplanation(input());
    const { container } = render(<EvidenceExplorer partId="PN-4471" ecId="ec-1" explanation={explanation} onClose={vi.fn()} />);
    const headings = Array.from(container.querySelectorAll("h3")).map((h) => h.textContent);
    const factsIdx = headings.indexOf("Facts");
    const rulesIdx = headings.indexOf("Applied Rules");
    const calcIdx = headings.indexOf("Calculation");
    expect(factsIdx).toBeGreaterThanOrEqual(0);
    expect(rulesIdx).toBeGreaterThan(factsIdx - 1);
    expect(calcIdx).toBeGreaterThan(rulesIdx);

    // The Hero (conclusion + next step) isn't a <Section> -- verify its position relative to
    // Facts textually: it should read before "Facts" in the panel.
    const fullText = container.textContent ?? "";
    expect(fullText.indexOf("CONCLUSION")).toBeLessThan(fullText.indexOf("Facts"));
    expect(fullText.indexOf(explanation.nextStep.reason)).toBeLessThan(fullText.indexOf("Facts"));
  });

  it("renders Facts and Applied Rules as visually distinct sections", () => {
    const explanation = buildEvidenceExplanation(input());
    render(<EvidenceExplorer partId="PN-4471" ecId="ec-1" explanation={explanation} onClose={vi.fn()} />);
    expect(screen.getByText("Facts")).toBeInTheDocument();
    expect(screen.getByText("Applied Rules")).toBeInTheDocument();
    expect(screen.getByText("Bosch")).toBeInTheDocument(); // a fact
    expect(screen.getByText("fixed_quantity")).toBeInTheDocument(); // an applied rule
  });

  it("shows the calculation narrative ending in the net exposure figure", () => {
    const explanation = buildEvidenceExplanation(input());
    render(<EvidenceExplorer partId="PN-4471" ecId="ec-1" explanation={explanation} onClose={vi.fn()} />);
    expect(screen.getByText("Net financial exposure")).toBeInTheDocument();
    expect(screen.getAllByText("$14,550.00").length).toBeGreaterThan(0);
  });

  it("always shows the next step's reason and a working link when one applies", () => {
    const explanation = buildEvidenceExplanation(input({ hasOpenMitigationAction: false }));
    render(<EvidenceExplorer partId="PN-4471" ecId="ec-1" explanation={explanation} onClose={vi.fn()} />);
    expect(screen.getByText(explanation.nextStep.reason)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Open Mitigation/ });
    expect(link).toHaveAttribute("href", "/engineering-changes/ec-1/mitigation");
  });

  it("surfaces the provenance note prominently when the calculation is stale", () => {
    const explanation = buildEvidenceExplanation(input({ provenance: "stale" }));
    render(<EvidenceExplorer partId="PN-4471" ecId="ec-1" explanation={explanation} onClose={vi.fn()} />);
    expect(screen.getByText(/has since been replaced by a corrected import/)).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    const explanation = buildEvidenceExplanation(input());
    render(<EvidenceExplorer partId="PN-4471" ecId="ec-1" explanation={explanation} onClose={onClose} />);
    screen.getByRole("button", { name: "Close" }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape, not just the explicit close button (standard slide-over convention)", () => {
    const onClose = vi.fn();
    const explanation = buildEvidenceExplanation(input());
    render(<EvidenceExplorer partId="PN-4471" ecId="ec-1" explanation={explanation} onClose={onClose} />);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
