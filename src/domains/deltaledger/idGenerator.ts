/**
 * ID generation is isolated behind this interface specifically so the
 * counter-based implementation used everywhere in this prototype can be
 * swapped for a ULID/UUID generator later WITHOUT touching any call site.
 *
 * Counter-based IDs are correct for this local, single-process, in-memory
 * prototype and wrong the moment any of the following becomes true:
 *   - records are persisted across process restarts (a counter resets to 0,
 *     colliding with previously-issued IDs);
 *   - more than one server instance or serverless invocation can generate
 *     IDs concurrently (each has its own counter starting at 0);
 *   - IDs need to be globally unique across environments (e.g. merging data
 *     from a dev and a staging instance).
 *
 * When persistence is introduced, replace `defaultIdGenerator` below with a
 * ULID-backed implementation (ULIDs are lexicographically sortable by
 * creation time, a natural fit for the audit/ledger-style entities this
 * product is full of -- ExposureRecord, AlternateDemandAllocation,
 * AuditLogEntry, FinancialOutcome) or a UUID v4 implementation for
 * lookup-only entities with no ordering value (Part, Supplier). No other
 * file in src/domains/deltaledger should need to change to make that swap.
 */
export interface IdGenerator {
  next(prefix: string): string;
}

class CounterIdGenerator implements IdGenerator {
  private counters = new Map<string, number>();

  next(prefix: string): string {
    const current = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, current);
    return `${prefix}-${current}`;
  }

  /** Test-only: resets all counters so test files remain independent of run order. */
  reset(): void {
    this.counters.clear();
  }
}

const counterIdGenerator = new CounterIdGenerator();

/**
 * The single shared ID generator instance used across this domain package.
 * Swap this binding (not the call sites) when persistence is introduced.
 */
export const defaultIdGenerator: IdGenerator = counterIdGenerator;

/** Test-only escape hatch -- resets the shared generator between test files. */
export function resetDefaultIdGenerator(): void {
  counterIdGenerator.reset();
}
