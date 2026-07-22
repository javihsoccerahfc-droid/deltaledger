# UI Route Map & Walkthrough

## Route map

```
/                                                  -> redirects to /engineering-changes
/engineering-changes                               dashboard (Server Component, force-dynamic):
                                                    portfolio KPI cards, search, sortable table,
                                                    "Load sample engineering change" CTA
/engineering-changes/new                           create form (Client Component -> Server Action)
/engineering-changes/[id]                          -> redirects to .../boms
/engineering-changes/[id]/boms                     import current + proposed BOM, view the
                                                    real, persisted, deterministic diff
/engineering-changes/[id]/po                       import open-PO export, supplier terms,
                                                    exchange rates -- all written to the database
/engineering-changes/[id]/mapping                  PLM-to-ERP crosswalk review + bulk/individual
                                                    approval (part_data_owner/admin), DB-enforced
/engineering-changes/[id]/exposure                 exposure results -- KPI summary, search/filter,
                                                    CSV/XLSX export, row-click detail drawer
                                                    showing the real immutable snapshot row
/engineering-changes/[id]/alternate-demand         suggestion, approval (supply_chain_manager/
                                                    admin), allocation -- over-allocation guard
                                                    enforced against real committed rows
/engineering-changes/[id]/mitigation                mitigation action -> supplier response ->
                                                     outcome close, one card per exposure record
/engineering-changes/[id]/report                    exposure-vs-outcome report, export, print
/engineering-changes/[id]/audit                     full audit trail, read directly from the
                                                     append-only audit_log_entries table
```

Every route under `[id]/` is a **Server Component** (`page.tsx`) that fetches its data directly
from the repository layer, paired with a **Client Component** (in `src/components/`) that owns the
interactive parts and calls a **Server Action** for every mutation. `/engineering-changes` is
explicitly marked `export const dynamic = "force-dynamic"` because it reads live database state
that a build-time prerender would otherwise freeze -- verified during development: without that
flag, the page served a stale, empty snapshot captured at build time regardless of what was
actually in the database.

## Fastest way to see the whole product

**`/engineering-changes` -> "Load sample engineering change"**, or from the command line:

```bash
npx tsx -e "import('./db/seed').then(m => m.seedSampleEngineeringChange())"
```

This seeds a complete, realistic scenario (`db/seed.ts`) **through the real repository layer** --
the exact same functions the UI's Server Actions call, not a separate in-memory fixture -- so
every screen below has real, persisted data on first look: two suppliers, two currencies, one
closed mitigation, one still pending, one mapping still needing review.

## Walkthrough (in workflow order)

1. **`/engineering-changes`** -- a real dashboard: portfolio KPI cards (known exposure, estimated
   exposure, mappings needing approval, engineering-change count), a search box, and a sortable
   table. All computed from a fresh database read on every request.
2. **`/engineering-changes/new`** -- name + description. Submitting calls
   `createEngineeringChangeAction`, which writes a row to `engineering_changes` and an entry to
   `audit_log_entries`, then routes into the workflow.
3-5. **`/engineering-changes/[id]/boms`** -- two file inputs. Each import calls `importBomAction`,
   which parses the file, writes `bom_imports`/`bom_lines` rows, and recomputes
   `bom_diff_entries` wholesale (delete + reinsert -- the diff has no independent history worth
   preserving). The diff table below re-renders from the database via `router.refresh()`.
6. **`/engineering-changes/[id]/po`** -- one file input. `importPurchaseOrderAction` groups rows
   into `purchase_orders`/`suppliers`/`purchase_order_lines`, correctly separating multiple
   suppliers and currencies in one import (verified directly in
   `db/__tests__/persistence.test.ts`). Supplier terms and exchange rates are added through
   forms that call `addSupplierTermsAction`/`addExchangeRateAction` -- adding new terms
   **supersedes** the prior active row rather than overwriting it (the old row's original values
   remain queryable and untouched).
7-8. **`/engineering-changes/[id]/mapping`** -- "Generate mapping suggestions" writes unreviewed
   `part_number_crosswalks` rows. Approve/Reject call `approveMappingAction`/`rejectMappingAction`,
   which check `canApproveCrosswalk(user)` **inside the repository function itself** -- the
   authorization boundary is enforced at the database layer, not just by disabling a button in the
   UI. Bulk-approve loops the same action across every high-confidence match.
9-10. **`/engineering-changes/[id]/exposure`** -- "Calculate exposure" calls
   `calculateExposureAction`, which runs `db/repositories/exposure.ts`'s
   `calculateAndPersistExposure`: for every eligible (BOM diff entry, PO line) pair, it resolves
   the crosswalk, allocation rule, active supplier terms, and prior netting, then **inserts** a
   new `exposure_source_snapshots` + `exposure_records` row pair. If an active record already
   existed for that exact pair, the old row is marked `supersededById` -- its own columns are never
   touched (verified directly by a test that recalculates twice and asserts the first row's
   values are byte-for-byte unchanged). Clicking any row opens a detail drawer reading that exact
   snapshot row: crosswalk version, FX rate, source file/row, which alternate-demand allocations
   were used.
11. **`/engineering-changes/[id]/alternate-demand`** -- suggesting, approving
    (`approveAlternateDemandAction`, gated to supply_chain_manager/admin), and allocating
    (`allocateAlternateDemandAction`) all write real rows. The over-allocation guard re-reads the
    actual sum of active allocations from the database before permitting a new one -- not a
    client-side running total.
12-13. **`/engineering-changes/[id]/mitigation`** -- one card per exposure record:
    `createMitigationAction` -> `recordSupplierResponseAction` -> `createOutcomeAction` ->
    `closeOutcomeAction`, each a real insert/update. Attempting to close an outcome that assumes a
    redirected unit kept 100% of its original value without a justification note + reviewer is
    rejected by the repository function itself, with the reason surfaced inline.
14. **`/engineering-changes/[id]/report`** -- reads the same `exposure_records` and
    `financial_outcomes` tables through `buildEcoReport` (pure domain function, unchanged from the
    original engine), with a confidence-mix bar, KPI cards, export, and print.
15. **`/engineering-changes/[id]/audit`** -- a direct, unfiltered read of `audit_log_entries` for
    this engineering change, most recent first. Nothing in this table is ever updated or deleted.

## Role-switching demo

The top nav's role control is explicitly labeled **"Demo"** -- an honest acknowledgment that it
stands in for real authentication, not a styling choice meant to look like a production
permission grant. It only ever changes which `User` object gets passed into a Server Action; the
authorization checks themselves run in the repository functions regardless of what the UI does.

- Switch to **Buyer** or **CCB** on the Mapping page -> Approve/Reject are disabled, and the
  repository-level check (`approveCrosswalkById`) would reject the action even if called directly.
- Switch to **Part Data Owner** on the Alternate Demand page -> Approve/Reject are disabled (Part
  Data Owner alone is not sufficient here, only Supply Chain Manager/Admin).

## Verifying persistence yourself

```bash
npm run dev
# in the browser: create an EC, import a BOM, calculate exposure
# then, in a separate terminal, with the dev server still running:
npx tsx -e "
import { listEngineeringChanges } from './db/repositories/engineeringChanges';
listEngineeringChanges().then((rows) => console.log(rows));
"
# stop the dev server entirely, start it again, reload the page --
# everything you did is still there, because it was never in server memory.
```
