import { createId } from "@paralleldrive/cuid2";

/**
 * ID generation is isolated behind this interface specifically so the
 * implementation can be swapped without touching any call site.
 *
 * P0 remediation (implemented): the prior counter-based implementation kept an
 * in-memory Map per process, resetting to 0 on every new process/invocation.
 * Tracing every call site confirmed the only column where that counter value
 * was ever actually persisted as a live primary key was `purchase_order_lines.id`
 * (every other call site's value was generated and then discarded before the
 * DB write, since Drizzle's own `$defaultFn(() => createId())` schema default
 * silently took over instead) -- but a Vercel serverless cold start, or two
 * concurrent invocations, each got a fresh counter starting at 1, so two
 * invocations importing PO data around the same time could and did produce
 * colliding IDs written as a real primary key. This is now fixed by using the
 * same `@paralleldrive/cuid2` library every other table's own schema default
 * already relies on -- collision-resistant across concurrent, uncoordinated
 * processes by design, and a zero-new-dependency change.
 *
 * Per approved Decision A, the returned ID is a bare cuid2 with no prefix, for
 * consistency with every other table's default primary key shape. Nothing in
 * this codebase parses, sorts by, or otherwise depends on an id's shape or
 * prefix (verified during the P0 remediation review) -- old, pre-existing
 * `poline-N`-style ids and new bare-cuid2 ids coexist permanently and
 * harmlessly; no backfill of existing rows is needed or was performed.
 */
export interface IdGenerator {
  next(prefix: string): string;
}

class Cuid2IdGenerator implements IdGenerator {
  next(): string {
    return createId();
  }
}

const cuid2IdGenerator = new Cuid2IdGenerator();

/**
 * The single shared ID generator instance used across this domain package.
 */
export const defaultIdGenerator: IdGenerator = cuid2IdGenerator;

/**
 * Test-only escape hatch, kept for API compatibility with any test relying on
 * this existing between test files. A no-op for the cuid2 generator (there is
 * no per-process counter state to reset) -- confirmed unused by any current
 * test via a repository-wide search before this change.
 */
export function resetDefaultIdGenerator(): void {
  // no-op: cuid2 generation has no mutable state to reset
}
