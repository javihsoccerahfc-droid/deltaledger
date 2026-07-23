# DeltaLedger — Version 3 Retrospective

Written the way I'd actually want to read it later: specific, sometimes uncomfortable, no rounding up.

---

## What architectural decisions were the best?

**Refusing to add `inventory_on_hand`/`wip_records` tables.** This is the single decision I'd defend hardest. The pressure to add them was real and reasonable — the Cutover Simulator's whole story depends on on-hand PCBA and WIP numbers, and "just add a table" would have taken twenty minutes. Instead, that data lives in one hardcoded, fully-tested constant (`NOVA_ROBOTICS_DATASET`), and the seam where a real customer's version of that data would eventually plug in (`resolveCutoverScenarioDataset()`) is a single, named, three-line function. If I'd added the tables, they'd have been built to a demo's standard of rigor, not the standard every other table in this schema holds (supersession, audit, staleness tracking) — and a future engineer would have inherited two tables that look load-bearing but aren't trustworthy. Saying no here, twice, under real pressure, is the decision I'm most confident holds up at Version 10.

**The provenance tag on every disposition line item.** Tagging each figure as `scenario_seeded_inventory` / `scenario_seeded_wip` / `scenario_seeded_po_terms` / `calculated_disposition_outcome` felt like overhead when I built it. It turned out to be the thing that made the source-honesty requirement actually *true* instead of merely *described*. Without it, "the demo distinguishes persisted evidence from scenario facts" would have been a claim in a document, not a property of the code.

**Route groups over a URL restructure for the public/workspace split.** `(marketing)` and `(workspace)` cost nothing at the URL level and meant zero existing links, tests, or bookmarks broke when the public site got built on top of an app that already existed. The alternative — prefixing everything under `/app/*` — would have been marginally cleaner in the abstract and genuinely disruptive in practice.

**Enforcing read-only at the Server Action layer, not the UI.** A disabled button is a suggestion. The guard living in the one place mutations actually happen is what makes "the demo is read-only" a fact about the system rather than a fact about how polite the current UI is being.

## Which decisions would I make differently today?

**I would have caught the test-count gap before you did.** Running `--project unit --project components` and calling it "the test suite" for several verification passes wasn't a methodology choice, it was a shortcut I stopped noticing I was taking. I'd build a one-line habit earlier: name which projects ran, every time, even when it's not the full set.

**I'd design the mutating-action return shapes more consistently from the start.** Retrofitting the read-only guard surfaced that this codebase has three different failure conventions across ~20 actions — some `{success, message}`, some throwing, a couple I'd bet still return bare `void` with no failure path at all. None of this was my decision (it predates V3), but I didn't flag it as debt until I was forced to touch every one of those functions. I'd have called it out the first time I noticed it, not the fifth.

**The homepage went through three real direction changes** (feature-explainer → single cascade visual → full scrollytelling with minimized copy) because each of your refinements was a genuine improvement I hadn't pushed back on hard enough myself. I don't regret building each version — they were each correct for what was known at the time — but the first version spent effort that the final direction didn't need. I'd ask "is this trying to explain or trying to make someone want to keep scrolling" before the first line of code next time, not the third.

## What assumptions remain completely unvalidated?

Everything about whether this is worth building, honestly. Specifically:
- That "engineering change financial exposure" is a problem someone actively feels, not one that's merely real
- That the buyer (who I'd guess is supply chain or finance, not engineering) and the user (probably a buyer or part data owner) are different enough people that the sales motion needs to account for it
- That a five-minute demo is the right length, or that a cutover simulator is the right centerpiece, versus something else entirely a real prospect would ask for first
- That $45,660-scale numbers are the right order of magnitude to make someone sit up — a real customer's exposure could be 10x smaller or 100x larger, and the whole "this is worth a meeting" instinct the demo is built around assumes the number is convincingly large
- That CSV import is an acceptable on-ramp, not a dealbreaker, for someone evaluating this against tools with real ERP integrations

None of these are things more engineering effort resolves. They're the actual subject of the next phase.

## Which parts of the codebase are most likely to survive to Version 10?

The exposure calculation engine (`calculateExposure.ts`) and the evidence/confidence model (known/estimated/unresolved, facts-vs-applied-rules) — these are the oldest, most fought-over parts of this codebase (multiple remediation passes are visible in the migration history) and they encode the actual thesis of the product. If DeltaLedger exists in five years, this is still how it thinks.

The supersession pattern itself (never mutate, always supersede, enforce with a partial unique index) will likely survive even if every table using it today gets replaced — it's a principle, not an implementation.

The Server-Action-as-the-only-write-boundary layering will probably survive even through an authentication rewrite, since it's already the right shape for "insert a permission check here" — which is exactly what just happened with the read-only guard.

## Which parts do I expect to rewrite after talking to customers?

The Cutover Simulator's four controls, specifically. They're the right four for a two-part BOM change with two suppliers. I have no confidence they're the right four for whatever a real customer's actual change looks like — more affected parts, more suppliers, multi-level BOM depth, maybe a completely different disposition question than "rework vs. scrap." I'd expect the *disposition model's shape* (batches, terms-as-data, provenance tags) to survive; I'd expect the specific four sliders to be rebuilt once a real scenario shows what actually varies.

The homepage's cascade story is tuned to one scenario with a satisfying six-beat structure (Engineering → Suppliers → POs → Inventory → Exposure → Executive). A second, differently-shaped real customer story might not fit six beats, and I'd rather rebuild the narrative than force a real case into a structure built for a fictional one.

`ENGINEERING_CHANGE_CREATION_DISABLED` — this is explicitly disclosed as a placeholder for real auth, and I'd be surprised if it survives even to the first real customer conversation, let alone Version 10.

## Where do I think we're over-engineered?

The report-generation split (two reports, folded reasonably, but still rendered through a dedicated `CutoverReports` component with its own provenance-label mapping duplicated from the simulator) is slightly more machinery than two documents need right now. It's defensible — it guarantees the reports can't drift from the simulator — but I built it for a scale of reporting need (multiple stakeholder-specific documents) that doesn't exist yet with only two reports.

The three-tier `LineItemProvenance` / `LineItemCategory` distinction on every disposition line is more taxonomy than a six-line-item, one-scenario demo strictly needs today. I'd keep it — it's the right foundation for a second dataset — but I'll admit it was built for the customer this product doesn't have yet, not the demo it does.

## Where are we under-engineered?

Authentication and permissions, obviously and by design — but it's worth naming plainly rather than just filed under "future work," because it's the single biggest gap between "impressive demo" and "software a company could actually deploy."

The mitigation and PO workflows have had far less design scrutiny than the public site or the Cutover Simulator — they work, they're tested, but I checked them for function during the walkthrough, not for the same coherence bar everything built in the last several sessions has met. If a prospect explored those screens specifically, I'd expect them to feel like an earlier, less considered version of the same product — because they are.

Error handling across the ~15 write actions I guarded by throwing rather than returning a graceful result is under-engineered relative to the trust bar the rest of this product holds itself to. It's correct (the write is blocked) and it's honest (disclosed as debt), but it's not finished.

## What surprised me most while building this?

How often the type checker, not a test, caught the real bug. Twice in the read-only implementation alone, `tsc --noEmit` found a return-shape mismatch (`reason` vs. `message`) that would have shipped as a silent runtime failure — the exact "silent failure" category of bug I was explicitly hunting for in the UX walkthrough, except this one was hiding in the type system, not the UI.

And separately: how much the actual arithmetic mattered to the trust of the whole thing. The moment the disposition model's tests failed against my own hand-derived canonical numbers — twice, on the WIP double-count and the harness PO timing bug — was more clarifying than any design document. A demo can be beautifully designed and still be a lie if the number is wrong by $700. Getting the three headline figures ($72,360 / $45,660 / $24,640) to actually reproduce, against real Postgres, from a fresh seed, was worth more to how much I'd trust showing this to someone than everything built on top of it visually.
