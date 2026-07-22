# DeltaLedger Design Principles

*Established across Milestone 6 (Phases 6A–6D). This document is the reference for every future feature — it exists to prevent drift away from the product identity built here.*

---

## 1. Trust-First Architecture (Phase 6A)
Every number on screen must be traceable to a persisted, immutable fact. Corrections create new records and supersede old ones — they never mutate history in place. If a UI change makes something *feel* more certain than the underlying data actually is, the UI is wrong, not the data.

## 2. Decision-First UX (Phase 6B–6C)
Every screen answers, in order: **what happened, why it matters, what to do next, how confident to be.** Data is never presented for its own sake — it exists to support a specific decision. If a page can't name the decision it supports, it's probably restating something another page already owns.

## 3. The Persistent Workspace Shell
Engineering Change identity, current financial position, workflow progress, and navigation are **owned by the shell, never duplicated by a page.** The shell doesn't disappear or go quiet when there's nothing to show — an honest "not calculated yet" is always better than an anchor that vanishes. This is what makes DeltaLedger feel like one workspace instead of a set of pages connected by tabs.

## 4. Decision Hero Philosophy
A Decision Hero (dark, high-contrast surface) exists for pages where a real decision is made or communicated: Overview, Mapping, Mitigation, Exposure, Evidence, Report. It answers **"what's the most important thing to understand on THIS page"** — never the overall financial picture, which the shell already owns. At most one per page. Importance determines emphasis, not the size of the number involved.

## 5. Information Hero Philosophy
An Information Hero (light, bordered surface) exists for pages centered on facts, not decisions: BOM Diff, Open PO, Alternate Demand, Scenario (pre-run). Enough hierarchy to establish the page's purpose — not enough to compete with the shell or a true Decision Hero elsewhere in the workspace.

## 6. Why Timeline and Audit Intentionally Differ
Not every page needs a Hero. Timeline and Audit are historical records, not decisions — their identity comes from chronology and forensic traceability, and giving them a Hero to "match" the rest of the product would be decoration, not signal. Deliberate inconsistency, applied for a real reason, is not the same failure as accidental inconsistency.

## 7. Typography Philosophy
A fixed six-tier scale — page title, narrative conclusion, section header, metric value, body, caption — each with one size/weight/color combination, enforced as real components (`Typography.tsx`), not documentation anyone could drift from. Important conclusions must look important before they're read.

## 8. Color Philosophy
Depth, not more color. The palette's richness comes from *how* existing colors are used — a dark `ink` surface as a background (not just text) for the Hero, shadow for card depth — not from adding new hues. Semantic colors (success/warning/critical) stay restrained and consistent; a colored figure on a dark surface reads as alarming or muddy, so status lives in a small indicator dot, never the headline number's color.

## 9. Spacing Philosophy
A small, fixed rhythm (section gap, group gap, tight gap) used consistently, not chosen per page. Whitespace is deployed around the one thing that should be understood first — not spread evenly to "look airy."

## 10. Visual Hierarchy
Every page should let a user identify, within three seconds and without conscious effort: what matters most, what changed, what to do next, where the supporting detail lives. If two elements compete for the same attention, one of them is wrong.

## 11. Navigation Philosophy
Navigation should be invisible in the sense that it never interrupts continuity — same shell, same transition treatment, same next-action mechanism everywhere. Loading states are calm and static (no flashy animation), signaling "the same page, still arriving," never "the page disappeared."

## 12. Workflow Philosophy
Guide, don't force. The shell surfaces the single highest-priority next action, but every tab remains freely navigable at all times — nothing is gated behind a wizard. Stale and blocked states are surfaced as information, never as a barrier.

## 13. Storytelling Philosophy
Every narrative sentence must be directly supported by persisted data. Never imply a trend without a genuine, scope-matched prior comparison. Never state a dollar figure for something the system doesn't actually know the value of — unresolved/unknown quantities are described by count, not by a technically-true-but-misleading `$0`. Uncertainty is part of the conclusion, not a disclaimer beside it.

## 14. Redundancy Elimination Philosophy
Before adding anything, ask what it replaces. Whenever a Hero or a shell element makes an older card, label, or paragraph say the same thing a second time, remove the older one — don't leave both "to be safe." A duplicate label, even a small one, is a real defect, not a cosmetic nitpick. Premium products are defined as much by what they choose not to show as by what they show.

---

## The standing test for every future addition
Before shipping any new screen or component, ask:
1. Does this belong to the shell, a Decision Hero, an Information Hero, or supporting content — and does it stay in its lane?
2. Does it duplicate a number, label, or explanation that already exists elsewhere on this page or in the shell?
3. Does its narrative language claim anything the persisted data doesn't actually support?
4. Would removing it lose real information, or just visual noise?

If an honest answer breaks one of the fourteen principles above, the addition needs to change — not the principle.
