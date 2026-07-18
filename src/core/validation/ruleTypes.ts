export type ExceptionSeverity = "critical" | "warning" | "informational";

export interface RuleContext {
  config: Record<string, number | string>;
  priorRecords?: unknown[];
}

export interface RuleResult {
  ruleId: string;
  severity: ExceptionSeverity;
  recordIndexes: number[]; // indexes into the records array passed to evaluate()
  groupKey?: string;
  description: string;
  deterministic: boolean;
  syntheticAddition?: boolean;
}

export interface RuleDefinition<TRecord> {
  id: string;
  name: string;
  category: string;
  severity: ExceptionSeverity;
  evaluate(records: TRecord[], context: RuleContext): RuleResult[];
}
