import { ExposureConfidence } from "../types";
import { ExposurePipelineOutcome } from "./exposurePipeline";

/**
 * Milestone 4 -- Interactive Exposure Explorer.
 *
 * Pure comparison between the real, persisted, immutable baseline (the EC's currently active
 * ExposureRecords -- exactly what the Evidence Explorer and Report already treat as historical
 * truth) and one scenario run's in-memory pipeline outcomes. Performs no calculation of its
 * own -- every dollar figure here is read directly from either a persisted ExposureRecord or a
 * pipeline outcome that already went through the one shared calculation engine. This function
 * only aligns and diffs numbers that already exist.
 */

export interface BaselineExposureLine {
  purchaseOrderLineId: string;
  partId: string;
  netExposureValueReporting: number;
  confidenceClassification: ExposureConfidence;
}

export interface ScenarioComparisonLine {
  purchaseOrderLineId: string;
  partId: string;
  baseline: { netExposureValueReporting: number; confidenceClassification: ExposureConfidence } | null;
  scenario: { kind: "created"; netExposureValueReporting: number; confidenceClassification: ExposureConfidence } | { kind: "gap"; reason: string };
  /** Present only when both baseline and a created scenario outcome exist for this line. */
  deltaAbsolute: number | null;
  /** True whenever the scenario figure differs from baseline in any way -- new gap, resolved gap, or a changed dollar amount. */
  changed: boolean;
}

export interface ScenarioComparisonSummary {
  baselineTotal: number;
  scenarioTotal: number;
  deltaAbsolute: number;
  /** null when baselineTotal is exactly 0 -- a percentage variance against zero isn't meaningful. */
  deltaPercent: number | null;
  lines: ScenarioComparisonLine[];
  /** Pairs the scenario could not produce a trustworthy figure for -- a limitation of THIS scenario, not a claim about the baseline's own history. */
  gaps: { purchaseOrderLineId: string; rawPartNumber: string; reason: string }[];
  changedLineCount: number;
}

export function compareScenarioToBaseline(
  baselineLines: BaselineExposureLine[],
  scenarioOutcomes: ExposurePipelineOutcome[]
): ScenarioComparisonSummary {
  const baselineByPoLineId = new Map(baselineLines.map((l) => [l.purchaseOrderLineId, l]));
  const scenarioByPoLineId = new Map<string, ExposurePipelineOutcome>();
  for (const outcome of scenarioOutcomes) {
    if (outcome.purchaseOrderLineId) scenarioByPoLineId.set(outcome.purchaseOrderLineId, outcome);
  }

  const allPoLineIds = new Set<string>([...baselineByPoLineId.keys(), ...scenarioByPoLineId.keys()]);

  const lines: ScenarioComparisonLine[] = [];
  const gaps: ScenarioComparisonSummary["gaps"] = [];
  let baselineTotal = 0;
  let scenarioTotal = 0;
  let changedLineCount = 0;

  for (const poLineId of allPoLineIds) {
    const baseline = baselineByPoLineId.get(poLineId) ?? null;
    const scenarioOutcome = scenarioByPoLineId.get(poLineId);

    if (baseline) baselineTotal += baseline.netExposureValueReporting;

    if (!scenarioOutcome) {
      // No pipeline outcome touched this PO line under this scenario at all (e.g. the diff
      // entry it belonged to isn't affected by the assumptions applied). Nothing changed.
      if (baseline) {
        lines.push({
          purchaseOrderLineId: poLineId,
          partId: baseline.partId,
          baseline,
          scenario: { kind: "created", netExposureValueReporting: baseline.netExposureValueReporting, confidenceClassification: baseline.confidenceClassification },
          deltaAbsolute: 0,
          changed: false,
        });
        scenarioTotal += baseline.netExposureValueReporting;
      }
      continue;
    }

    if (scenarioOutcome.kind === "gap") {
      gaps.push({
        purchaseOrderLineId: poLineId,
        rawPartNumber: scenarioOutcome.rawPartNumber,
        reason: scenarioOutcome.reason,
      });
      const changed = baseline !== null; // had a real figure before, now unresolved under this scenario
      if (changed) changedLineCount += 1;
      lines.push({
        purchaseOrderLineId: poLineId,
        partId: baseline?.partId ?? scenarioOutcome.rawPartNumber,
        baseline,
        scenario: { kind: "gap", reason: scenarioOutcome.reason },
        deltaAbsolute: null,
        changed,
      });
      continue;
    }

    const scenarioNet = scenarioOutcome.record.netExposureValueReporting;
    scenarioTotal += scenarioNet;
    const deltaAbsolute = baseline ? scenarioNet - baseline.netExposureValueReporting : scenarioNet;
    const changed = !baseline || deltaAbsolute !== 0 || baseline.confidenceClassification !== scenarioOutcome.record.confidenceClassification;
    if (changed) changedLineCount += 1;
    lines.push({
      purchaseOrderLineId: poLineId,
      partId: baseline?.partId ?? scenarioOutcome.record.partId,
      baseline,
      scenario: { kind: "created", netExposureValueReporting: scenarioNet, confidenceClassification: scenarioOutcome.record.confidenceClassification },
      deltaAbsolute,
      changed,
    });
  }

  const deltaAbsolute = scenarioTotal - baselineTotal;
  const deltaPercent = baselineTotal !== 0 ? (deltaAbsolute / baselineTotal) * 100 : null;

  return { baselineTotal, scenarioTotal, deltaAbsolute, deltaPercent, lines, gaps, changedLineCount };
}
