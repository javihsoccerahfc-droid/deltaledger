/**
 * Deterministic mapping from an audit entry's entityType to the phase of the decision story
 * it belongs to. This is presentation-adjacent categorization, not a financial calculation --
 * pure and tested here so the Timeline component doesn't hardcode this logic inline, and so
 * it stays consistent if a second Timeline-like view is ever needed elsewhere.
 *
 * Deliberately a fixed lookup, not inferred/AI-guessed: every phase label is fully explainable
 * by "this kind of event always means this part of the story," never a guess.
 */
export type DecisionPhase =
  | "Problem Identified"
  | "Data Collected"
  | "Exposure Understood"
  | "Decision Made"
  | "Mitigation Executed"
  | "Other";

const ENTITY_TYPE_TO_PHASE: Record<string, DecisionPhase> = {
  EngineeringChange: "Problem Identified",
  BomImport: "Data Collected",
  PurchaseOrder: "Data Collected",
  SupplierCommitmentTerms: "Data Collected",
  ExchangeRateSnapshot: "Data Collected",
  PartNumberCrosswalk: "Data Collected",
  ExposureRecord: "Exposure Understood",
  AlternateDemandRecord: "Decision Made",
  AlternateDemandAllocation: "Decision Made",
  MitigationAction: "Mitigation Executed",
  SupplierResponse: "Mitigation Executed",
  FinancialOutcome: "Mitigation Executed",
};

export function getDecisionPhase(entityType: string | null): DecisionPhase {
  if (!entityType) return "Other";
  return ENTITY_TYPE_TO_PHASE[entityType] ?? "Other";
}
