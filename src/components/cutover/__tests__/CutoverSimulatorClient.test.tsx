import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CutoverSimulatorClient } from "../CutoverSimulatorClient";
import type { CutoverSimulationResponse } from "@/app/actions";
import type { DispositionResult } from "@/domains/deltaledger/cutover/dispositionModel";

const runCutoverSimulationAction = vi.fn();
vi.mock("@/app/actions", () => ({
  runCutoverSimulationAction: (...args: unknown[]) => runCutoverSimulationAction(...args),
}));

function makeDisposition(overrides: Partial<DispositionResult> = {}): DispositionResult {
  return {
    cutoverWeek: 8,
    strategy: { kind: "optimized_phased" },
    maxRunOutWeek: 27.2,
    defectiveUnitsFielded: 200,
    pcbaBatchDispositions: [],
    harnessLeftoverAfterCutover: 20,
    harnessPoConsumedQuantity: 0,
    harnessPoLeftoverQuantity: 0,
    lineItems: [
      { id: "wip-rework", label: "Rework 40 WIP unit(s)", formula: "40 x $190", amount: 7640, category: "mitigated_cost", confidence: "known", provenance: "scenario_seeded_wip" },
    ],
    netExposure: 45_660,
    knownExposure: 38_660,
    estimatedExposure: 7_000,
    narrative: "Optimized Phased Cutover — Week 8: $45,660 net exposure, 200 unit(s) fielded with the thermal-throttling defect.",
    ...overrides,
  };
}

function makeResponse(overrides: Partial<CutoverSimulationResponse> = {}): CutoverSimulationResponse {
  return {
    disposition: makeDisposition(),
    persistedExposureTotal: 83_200,
    persistedExposureRecordCount: 4,
    grossAffectedCommitment: 125_720,
    ...overrides,
  };
}

describe("CutoverSimulatorClient", () => {
  it("renders the verdict, controls, and source-honesty summary from the initial response", () => {
    render(<CutoverSimulatorClient ecId="ec-1" ecName="ECO-1042" initialResponse={makeResponse()} />);
    expect(screen.getByText("$45,660")).toBeInTheDocument();
    expect(screen.getByText("$83,200")).toBeInTheDocument();
    expect(screen.getByText("$125,720")).toBeInTheDocument();
  });

  it("shows a visible error, not a silent no-op, when a recalculation fails", async () => {
    runCutoverSimulationAction.mockResolvedValueOnce({ ok: false, reason: "No cutover scenario dataset is available for this engineering change yet." });
    const user = userEvent.setup();
    render(<CutoverSimulatorClient ecId="ec-1" ecName="ECO-1042" initialResponse={makeResponse()} />);

    await user.click(screen.getByRole("button", { name: /Immediate Cutover/ }));

    await waitFor(() => {
      expect(screen.getByText(/Couldn't recalculate/)).toBeInTheDocument();
    });
    expect(screen.getByText(/No cutover scenario dataset is available/)).toBeInTheDocument();
    // The last successful figures must still be visible, not cleared.
    expect(screen.getByText("$45,660")).toBeInTheDocument();
  });

  it("clears a prior error once a subsequent recalculation succeeds", async () => {
    runCutoverSimulationAction
      .mockResolvedValueOnce({ ok: false, reason: "Temporary failure." })
      .mockResolvedValueOnce({ ok: true, response: makeResponse({ disposition: makeDisposition({ netExposure: 72_360 }) }) });
    const user = userEvent.setup();
    render(<CutoverSimulatorClient ecId="ec-1" ecName="ECO-1042" initialResponse={makeResponse()} />);

    await user.click(screen.getByRole("button", { name: /Immediate Cutover/ }));
    await waitFor(() => expect(screen.getByText(/Couldn't recalculate/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Optimized Phased Cutover/ }));
    await waitFor(() => expect(screen.queryByText(/Couldn't recalculate/)).not.toBeInTheDocument());
    expect(screen.getByText("$72,360")).toBeInTheDocument();
  });

  it("gives the cutover-week and spares-reserve sliders an aria-valuetext with real units, not a bare number", () => {
    render(<CutoverSimulatorClient ecId="ec-1" ecName="ECO-1042" initialResponse={makeResponse()} />);
    const weekSlider = document.getElementById("cutover-week");
    const sparesSlider = document.getElementById("spares-reserve");
    expect(weekSlider).toHaveAttribute("aria-valuetext", "Week 8");
    expect(sparesSlider).toHaveAttribute("aria-valuetext", "50 units");
  });
});
