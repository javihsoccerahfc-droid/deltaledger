import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExposureExplorerClient } from "../ExposureExplorerClient";
import type { ScenarioRunResult } from "@/app/actions";

const runExposureScenarioAction = vi.fn();
vi.mock("@/app/actions", () => ({
  runExposureScenarioAction: (...args: unknown[]) => runExposureScenarioAction(...args),
}));

const poLines = [
  {
    id: "poline-1",
    purchaseOrderId: "po-1",
    rawPartNumber: "771-4471",
    quantityOpen: 1000,
    unitPriceTransactionCurrency: 15,
    transactionCurrency: "USD",
  },
];
const purchaseOrders = [{ id: "po-1", poNumber: "PO-88213", supplierId: "sup-1" }];
const suppliers = [
  { id: "sup-1", name: "Bosch" },
  { id: "sup-2", name: "Acme Supply" },
];
const baselineRecords = [
  { id: "exp-1", purchaseOrderLineId: "poline-1", netExposureValueReporting: 15000, confidenceClassification: "known" as const },
];

function makeScenarioResult(overrides: Partial<ScenarioRunResult> = {}): ScenarioRunResult {
  return {
    assumptions: [
      {
        assumption: { kind: "quantityOverride", purchaseOrderLineId: "poline-1", quantityOpen: 400 },
        label: "Quantity changed to 400 units (PO line poline-1).",
      },
    ],
    baselineTotal: 15000,
    scenarioTotal: 6000,
    deltaAbsolute: -9000,
    deltaPercent: -60,
    changedLineCount: 1,
    lines: [
      {
        purchaseOrderLineId: "poline-1",
        partId: "771-4471",
        baseline: { netExposureValueReporting: 15000, confidenceClassification: "known" },
        scenario: {
          kind: "created",
          netExposureValueReporting: 6000,
          confidenceClassification: "known",
          explanation: {
            facts: [{ label: "Supplier", value: "Bosch" }],
            appliedRules: [{ label: "Allocation rule", value: "fixed_quantity" }],
            calculationSteps: [{ label: "Gross committed value", value: "$6,000.00" }],
            conclusion: { netExposure: 6000, confidence: "known", explanation: "This figure is fully defensible." },
            nextStep: { label: "No further action needed", tab: null, reason: "n/a" },
            provenanceNote: null,
          },
        },
        deltaAbsolute: -9000,
        changed: true,
      },
    ],
    gaps: [],
    ranAt: "2026-07-21T00:00:00.000Z",
    persisted: false,
    ...overrides,
  };
}

function renderExplorer(canExplore = true) {
  return render(
    <ExposureExplorerClient
      ecId="ec-1"
      baselineRecords={baselineRecords}
      poLines={poLines}
      purchaseOrders={purchaseOrders}
      suppliers={suppliers}
      crosswalks={[]}
      canExplore={canExplore}
    />
  );
}

describe("ExposureExplorerClient", () => {
  it("shows an empty state instead of the builder when there's nothing to explore yet", () => {
    renderExplorer(false);
    expect(screen.getByText("Nothing to explore yet")).toBeInTheDocument();
    expect(screen.queryByText("Build a scenario")).not.toBeInTheDocument();
  });

  it("shows the current baseline total prominently and always, before any scenario is run", () => {
    renderExplorer();
    expect(screen.getByText(/SCENARIO — BASELINE/)).toBeInTheDocument();
    expect(screen.getByText("$15,000.00")).toBeInTheDocument();
  });

  it("disables Run scenario until at least one assumption has been added", async () => {
    renderExplorer();
    const runButton = screen.getByRole("button", { name: /run scenario/i });
    expect(runButton).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new quantity/i), "400");
    await user.click(screen.getByRole("button", { name: /add assumption/i }));

    expect(screen.getByRole("button", { name: /run scenario/i })).not.toBeDisabled();
  });

  it("adding an assumption shows it as a removable chip with a plain-language label", async () => {
    renderExplorer();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new quantity/i), "400");
    await user.click(screen.getByRole("button", { name: /add assumption/i }));

    expect(screen.getByText(/Quantity changed to 400 units/)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/remove assumption/i));
    expect(screen.queryByText(/Quantity changed to 400 units/)).not.toBeInTheDocument();
  });

  it("running a scenario shows baseline vs scenario totals, variance, and marks the result as not persisted", async () => {
    runExposureScenarioAction.mockResolvedValueOnce({ ok: true, result: makeScenarioResult() });
    renderExplorer();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new quantity/i), "400");
    await user.click(screen.getByRole("button", { name: /add assumption/i }));
    await user.click(screen.getByRole("button", { name: /run scenario/i }));

    await waitFor(() => expect(screen.getByText(/SCENARIO RESULT/)).toBeInTheDocument());
    expect(screen.getAllByText("$6,000.00").length).toBeGreaterThan(0); // Hero + table row show the same figure
    expect(screen.getAllByText("-$9,000.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/-60\.0%/)).toBeInTheDocument();
    expect(runExposureScenarioAction).toHaveBeenCalledWith("ec-1", [{ kind: "quantityOverride", purchaseOrderLineId: "poline-1", quantityOpen: 400 }]);
  });

  it("shows an honest error instead of a crash when the scenario can't run", async () => {
    runExposureScenarioAction.mockResolvedValueOnce({ ok: false, reason: "No purchase order data has been imported yet." });
    renderExplorer();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new quantity/i), "400");
    await user.click(screen.getByRole("button", { name: /add assumption/i }));
    await user.click(screen.getByRole("button", { name: /run scenario/i }));

    await waitFor(() => expect(screen.getByText("Couldn't run this scenario")).toBeInTheDocument());
    expect(screen.getByText(/No purchase order data has been imported yet/)).toBeInTheDocument();
  });

  it("surfaces scenario gaps distinctly when the scenario result includes them", async () => {
    runExposureScenarioAction.mockResolvedValueOnce({
      ok: true,
      result: makeScenarioResult({ gaps: [{ purchaseOrderLineId: "poline-2", rawPartNumber: "771-9999", reason: "No purchase order line found." }] }),
    });
    renderExplorer();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new quantity/i), "400");
    await user.click(screen.getByRole("button", { name: /add assumption/i }));
    await user.click(screen.getByRole("button", { name: /run scenario/i }));

    await waitFor(() => expect(screen.getByText(/can't be resolved under this scenario/)).toBeInTheDocument());
    expect(screen.getByText(/771-9999/)).toBeInTheDocument();
  });

  it("clicking Why? opens a scenario detail panel showing it is hypothetical, not persisted", async () => {
    runExposureScenarioAction.mockResolvedValueOnce({ ok: true, result: makeScenarioResult() });
    renderExplorer();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new quantity/i), "400");
    await user.click(screen.getByRole("button", { name: /add assumption/i }));
    await user.click(screen.getByRole("button", { name: /run scenario/i }));
    await waitFor(() => screen.getByRole("button", { name: /why\?/i }));

    await user.click(screen.getByRole("button", { name: /why\?/i }));
    expect(screen.getByText("Hypothetical — not persisted")).toBeInTheDocument();
    expect(screen.getByText("This figure is fully defensible.")).toBeInTheDocument();
  });

  it("Reset clears assumptions and results back to the initial state", async () => {
    runExposureScenarioAction.mockResolvedValueOnce({ ok: true, result: makeScenarioResult() });
    renderExplorer();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new quantity/i), "400");
    await user.click(screen.getByRole("button", { name: /add assumption/i }));
    await user.click(screen.getByRole("button", { name: /run scenario/i }));
    await waitFor(() => expect(screen.getByText(/SCENARIO RESULT/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^reset$/i }));
    expect(screen.queryByText(/SCENARIO RESULT/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Quantity changed to 400 units/)).not.toBeInTheDocument();
  });

  it("shows first-run guidance with an example scenario, and lets the user dismiss it", async () => {
    renderExplorer();
    expect(screen.getByText("What this is for")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try an example scenario/i })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /dismiss guidance/i }));
    expect(screen.queryByText("What this is for")).not.toBeInTheDocument();
  });

  it("the example scenario button adds a real, runnable assumption without requiring manual input", async () => {
    renderExplorer();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /try an example scenario/i }));

    expect(screen.getByRole("button", { name: /run scenario/i })).not.toBeDisabled();
    expect(screen.queryByText("What this is for")).not.toBeInTheDocument(); // dismissed automatically once used
  });

  it("shows a helpful empty state (with an example link) instead of a blank area when no assumptions exist", () => {
    renderExplorer();
    expect(screen.getByText(/No assumptions added yet/)).toBeInTheDocument();
  });

  it("assumption chips show human-readable business context, never a raw PO line id", async () => {
    renderExplorer();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new quantity/i), "400");
    await user.click(screen.getByRole("button", { name: /add assumption/i }));

    expect(screen.getAllByText(/771-4471/).length).toBeGreaterThan(0); // real part number
    expect(screen.getAllByText(/Bosch/).length).toBeGreaterThan(0); // real supplier name
    expect(screen.queryByText(/poline-1/)).not.toBeInTheDocument(); // never the raw id
  });
});
