import { RuleContext, RuleDefinition, RuleResult } from "./ruleTypes";

export interface RuleRunOutcome {
  ruleId: string;
  name: string;
  category: string;
  results: RuleResult[];
  error?: string;
}

/**
 * Executes every registered rule against the record set. Each rule is
 * isolated in a try/catch so a single failing rule cannot blank the whole
 * exception list — its failure is surfaced on the outcome instead.
 */
export function runRules<TRecord>(
  records: TRecord[],
  rules: RuleDefinition<TRecord>[],
  context: RuleContext
): RuleRunOutcome[] {
  return rules.map((rule) => {
    try {
      const results = rule.evaluate(records, context);
      return { ruleId: rule.id, name: rule.name, category: rule.category, results };
    } catch (err) {
      return {
        ruleId: rule.id,
        name: rule.name,
        category: rule.category,
        results: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
