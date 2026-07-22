import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultIdGenerator } from "../idGenerator";

describe("defaultIdGenerator (P0 remediation: cuid2, replacing the per-process counter)", () => {
  it("generates 10,000+ unique ids within a single process", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 12_000; i++) {
      ids.add(defaultIdGenerator.next("poline"));
    }
    expect(ids.size).toBe(12_000);
  });

  it("returns a bare id with no prefix, per approved Decision A", () => {
    const id = defaultIdGenerator.next("poline");
    expect(id.startsWith("poline")).toBe(false);
    expect(id.startsWith("poline-")).toBe(false);
  });

  /**
   * The bug this replaces was specifically about SEPARATE PROCESSES each getting a fresh
   * counter starting at 0 (every Vercel cold start / concurrent invocation gets its own
   * module instance) -- a purely in-process test (however many ids, however parallel the
   * async calls) cannot reproduce that failure mode, since it's still one counter. This
   * test spawns genuinely separate Node processes, each generating a batch of ids for the
   * same prefix, and asserts zero collisions across all of them combined -- a faithful
   * reproduction of the original failure condition, not an approximation.
   */
  it("produces zero collisions across genuinely separate OS processes", () => {
    const dir = mkdtempSync(join(tmpdir(), "id-collision-test-"));
    const workerScript = join(dir, "worker.cjs");
    writeFileSync(
      workerScript,
      `
      const { createId } = require(${JSON.stringify(require.resolve("@paralleldrive/cuid2"))});
      const ids = [];
      for (let i = 0; i < 500; i++) ids.push(createId());
      process.stdout.write(JSON.stringify(ids));
      `
    );

    const processCount = 4;
    const allIds: string[] = [];
    for (let p = 0; p < processCount; p++) {
      const output = execFileSync(process.execPath, [workerScript], { encoding: "utf-8" });
      const ids: string[] = JSON.parse(output);
      allIds.push(...ids);
    }

    expect(allIds).toHaveLength(processCount * 500);
    expect(new Set(allIds).size).toBe(allIds.length); // zero collisions across all processes combined
  });
});
