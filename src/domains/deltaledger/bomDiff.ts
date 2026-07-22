import { defaultIdGenerator } from "./idGenerator";
import { BomDiffEntry, BomLine } from "./types";

function nextId() {
  return defaultIdGenerator.next("bom-diff");
}

/**
 * Compares a current-period and proposed-period BOM line set, keyed by
 * rawPartNumber. This assumes both BOM exports come from the same PLM and
 * therefore use consistent part-number formatting between the two files —
 * a reasonable assumption for a current-vs-proposed export pair from one
 * system, unlike the cross-system PLM<->ERP join, which is exactly why that
 * one needs a verified PartNumberCrosswalk and this one doesn't.
 *
 * Lines with an unparseable/missing quantity are still diffed for
 * added/removed detection (a part either is or isn't present), but a
 * quantity comparison that would require a null quantity is skipped rather
 * than treated as a 0-to-something or something-to-0 change — that would be
 * guessing at a quantity delta from data that doesn't support it.
 *
 * "replaced" is NOT auto-inferred here. Inferring that a removed part and an
 * added part are the "same position, different part" requires structural
 * information (reference designator, position) this synthetic pipeline
 * doesn't yet ingest — see markAsReplacement() below for the explicit,
 * human-driven alternative, consistent with "don't guess" throughout this
 * product.
 */
export function buildBomDiff(engineeringChangeId: string, currentLines: BomLine[], proposedLines: BomLine[]): BomDiffEntry[] {
  const currentByPart = new Map<string, BomLine>();
  for (const line of currentLines) {
    if (line.rawPartNumber) currentByPart.set(line.rawPartNumber, line);
  }
  const proposedByPart = new Map<string, BomLine>();
  for (const line of proposedLines) {
    if (line.rawPartNumber) proposedByPart.set(line.rawPartNumber, line);
  }

  const entries: BomDiffEntry[] = [];
  const allPartNumbers = new Set([...currentByPart.keys(), ...proposedByPart.keys()]);

  for (const partNumber of allPartNumbers) {
    const currentLine = currentByPart.get(partNumber);
    const proposedLine = proposedByPart.get(partNumber);

    if (currentLine && !proposedLine) {
      entries.push(makeEntry(engineeringChangeId, partNumber, "removed", currentLine.quantityPer, null));
      continue;
    }
    if (!currentLine && proposedLine) {
      entries.push(makeEntry(engineeringChangeId, partNumber, "added", null, proposedLine.quantityPer));
      continue;
    }
    if (currentLine && proposedLine) {
      // Both quantities must be known to assert a quantity change — a
      // missing quantity on either side means "we can't tell", not "no
      // change" and not "changed to/from zero".
      if (currentLine.quantityParseStatus === "ok" && proposedLine.quantityParseStatus === "ok") {
        const from = currentLine.quantityPer as number;
        const to = proposedLine.quantityPer as number;
        if (to < from) {
          entries.push(makeEntry(engineeringChangeId, partNumber, "qty_reduced", from, to));
        } else if (to > from) {
          entries.push(makeEntry(engineeringChangeId, partNumber, "qty_increased", from, to));
        }
        // to === from: no diff entry — genuinely unchanged.
      }
    }
  }

  return entries;
}

function makeEntry(
  engineeringChangeId: string,
  partNumberPlaceholder: string,
  changeType: BomDiffEntry["changeType"],
  fromQuantity: number | null,
  toQuantity: number | null
): BomDiffEntry {
  return {
    id: nextId(),
    engineeringChangeId,
    partId: partNumberPlaceholder, // raw part number until crosswalk resolves it to a Part.id
    changeType,
    fromQuantity,
    toQuantity,
    replacementPartId: null,
  };
}

/**
 * Explicit, human-driven pairing of a removed+added entry into one
 * "replaced" entry. Never invoked automatically.
 */
export function markAsReplacement(
  entries: BomDiffEntry[],
  removedEntryId: string,
  addedEntryId: string
): BomDiffEntry[] {
  const removed = entries.find((e) => e.id === removedEntryId && e.changeType === "removed");
  const added = entries.find((e) => e.id === addedEntryId && e.changeType === "added");
  if (!removed || !added) return entries;

  const replacedEntry: BomDiffEntry = {
    ...removed,
    changeType: "replaced",
    toQuantity: added.toQuantity,
    replacementPartId: added.partId,
  };

  return entries.filter((e) => e.id !== removedEntryId && e.id !== addedEntryId).concat(replacedEntry);
}
