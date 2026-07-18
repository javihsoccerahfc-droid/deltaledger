# DeltaLedger

DeltaLedger identifies open purchase-order exposure created by proposed engineering changes and
tracks the mitigation and financial outcome required to prevent avoidable write-offs.

**Not a PLM. Not an ERP. Not a BOM authoring tool.** This is the calculation and workflow layer
that sits on top of whatever PLM/ERP a manufacturer already runs — including one with no digital
thread at all, via CSV/XLSX export.

## Status

A persistence-backed Next.js application: every page is a Server Component reading live data
from a real SQLite database via Drizzle ORM; every mutation goes through a Server Action into a
typed repository layer; nothing is held in browser memory or an in-memory context. 117 automated
tests, all passing (17 files: pure domain logic + real database integration tests). Clean
production build, all 12 routes verified.

```bash
npm install
npx drizzle-kit migrate       # creates db/deltaledger.sqlite from db/schema.ts
npm run dev                    # http://localhost:3000
```

To see the full product immediately with realistic data, either click **"Load sample engineering
change"** on the empty dashboard, or seed it from the command line:

```bash
npx tsx -e "import('./db/seed').then(m => m.seedSampleEngineeringChange())"
```

```bash
npm test                       # 117 tests across 17 files
npm run build                  # compiles, type-checks, and prerenders -- does NOT verify business logic on its own
```

## Architecture

```
Browser
  |
  v
Server Component (page.tsx)  --reads-->  Repository layer (db/repositories/*.ts)
  |  renders + passes data as props            |
  v                                             v
Client Component ("use client")          Drizzle ORM (db/schema.ts)
  |  handles interactivity                      |
  v                                             v
Server Action (src/app/actions.ts)  --writes--> SQLite (db/deltaledger.sqlite, via better-sqlite3)
```

- **Server Components** (every `page.tsx` under `src/app/engineering-changes/`) fetch data
  directly from the repository layer at request time -- no client-side data fetching, no loading
  spinners for the initial view, and critically, **no static build-time caching of database
  reads** (`export const dynamic = "force-dynamic"` is set wherever a page depends on live data
  that a build-time prerender would otherwise freeze).
- **Client Components** (`src/components/**/*Client.tsx`) receive server-fetched data as props and
  own all interactivity: file inputs, forms, filters, the exposure detail drawer, CSV/XLSX export.
  They call Server Actions for every mutation and call `router.refresh()` afterward to re-fetch
  fresh Server Component data -- there is no separate client-side cache to keep in sync.
- **Server Actions** (`src/app/actions.ts`, `src/app/sampleDataAction.ts`) are the only way a
  mutation reaches the database. Each one is a thin wrapper: call the repository, record an audit
  event, `revalidatePath()` the affected route.
- **Repository layer** (`db/repositories/*.ts`) is where the actual business rules meet
  persistence: authorization checks, the immutable-snapshot recalculation logic, the versioned
  supplier-terms/exchange-rate pattern, the over-allocation guard. This layer is tested directly
  (`db/__tests__/*.test.ts`) against a real database, independent of any HTTP or React layer.
- **Drizzle ORM + SQLite** (`db/schema.ts`, `db/client.ts`, `better-sqlite3`) is the actual
  database. The schema is written using only column types/patterns identical in Drizzle's
  `pg-core`, so moving to real Postgres in production is a driver swap
  (`drizzle-orm/better-sqlite3` -> `drizzle-orm/postgres-js` or `node-postgres`), not a schema
  rewrite -- see "Future roadmap" below.
- **Pure domain logic** (`src/domains/deltaledger/`) is unchanged by any of the above: the
  calculation engine, classification rules, and authorization gates are plain TypeScript
  functions with zero framework or database dependency, called *by* the repository layer, not the
  other way around. This is what the majority of the automated tests exercise directly.

## Project structure

```
db/
  schema.ts                    # Drizzle schema -- every table, portable to Postgres
  client.ts                    # better-sqlite3 connection (DELTALEDGER_DB_PATH env override)
  seed.ts                      # realistic two-supplier, two-currency demo scenario, run through
                                # the SAME repository functions the app uses (no separate fixture)
  repositories/
    organizations.ts           # single bootstrap org until real auth exists
    engineeringChanges.ts       # create / list / get / update status
    bom.ts                      # BOM import, deterministic diff (recomputed wholesale on each import)
    purchaseOrders.ts           # PO/supplier import (multi-PO, multi-supplier, multi-currency),
                                 # versioned supplier terms, versioned exchange rates
    crosswalk.ts                # mapping suggestions, authorization-gated approve/reject
    alternateDemand.ts          # suggestion -> approval -> allocation, DB-enforced over-allocation guard
    exposure.ts                 # THE core calculation: immutable insert-only snapshots -- a
                                 # recalculation always INSERTs a new (snapshot, record) pair and
                                 # marks any prior active record for the same pair "superseded" --
                                 # there is no update function for either table, by design
    mitigation.ts                # mitigation actions, supplier responses
    financialOutcome.ts          # build (draft) -> close, reusing the corrected fee-counted-once
                                  # formula and the redirect-value-justification gate
    audit.ts                     # append-only audit log
  __tests__/
    persistence.test.ts         # create/list/reopen, BOM diff, multi-supplier PO, versioned terms,
                                  # authorization enforcement, audit log -- all against a real DB
    exposureFlow.test.ts        # full exposure -> alt-demand -> mitigation -> outcome pipeline,
                                  # including an explicit assertion that recalculation supersedes
                                  # rather than mutates

drizzle/                        # generated SQL migrations (drizzle-kit generate/migrate)
drizzle.config.ts

src/
  app/
    actions.ts                  # every Server Action -- the only path a mutation can reach the DB
    sampleDataAction.ts          # wraps db/seed.ts for the "Load sample data" button
    layout.tsx                   # root layout: prototype banner, top nav, DemoUserProvider
    page.tsx                     # redirects to /engineering-changes
    engineering-changes/
      page.tsx                   # dashboard (Server Component) + EcListClient (Client Component)
      new/page.tsx                # create form (Client Component, calls a Server Action)
      [id]/
        layout.tsx                 # EC header + step-progress stepper, computed from real DB state
        page.tsx                   # redirects to .../boms
        boms/, po/, mapping/, exposure/, alternate-demand/, mitigation/, report/, audit/
                                     # one Server Component page.tsx + one Client Component per step

  components/
    ec/, bom/, po/, mapping/, exposure/, alternateDemand/, mitigation/, report/
                                  # the Client Component half of each workflow step
    layout/                       # EcStepper, RoleSwitcher, TopNav, PrototypeBanner
    shared/                       # Badges (confidence vs. cancellation kept visually distinct), States

  lib/context/DemoUserContext.tsx
                                  # THE ONLY React context in the app -- holds nothing but the
                                  # "acting as" demo role. No domain data lives in React state
                                  # anywhere in this codebase.

  appLayer/
    workflow.ts                   # generateCrosswalkSuggestions -- the one function from the
                                   # original application layer still in active use (called by
                                   # db/repositories/crosswalk.ts)
    ingestPurchaseOrder.ts         # groups a raw PO export into PurchaseOrder/Supplier/Line
                                    # entities -- used by db/repositories/purchaseOrders.ts

  domains/deltaledger/            # pure domain logic -- see below
  core/                           # generic ingestion/normalization/validation/export helpers,
                                   # no domain vocabulary
```

## The engineering workflow

```
Engineering Change
        |
        v
BOM Diff  ------------  import current + proposed BOM, deterministic added/removed/qty-changed diff
        |
        v
Open PO  -------------  import the open-PO export; supplier cancellation terms; exchange rates
        |
        v
Mapping  -------------  approve PLM-to-ERP part-number crosswalks (part_data_owner/admin only);
        |                bulk-approve for high-confidence matches
        v
Exposure  ------------  calculate deterministic financial exposure: gross committed value, net
        |                exposure after alternate-demand netting, exposure confidence (known/
        |                estimated/unresolved) kept strictly independent of cancellation status/
        |                confidence -- never merged into one number or one indicator
        v
Alternate Demand  ----  suggest -> approve (supply_chain_manager/admin only) -> allocate against a
        |                specific exposure record; recalculating exposure nets the allocation in
        v
Mitigation  ----------  record what actually happened: mitigation action -> supplier response ->
        |                financial outcome (actual cost avoided vs. actual realized loss, with the
        |                fee counted exactly once, and a hard gate requiring explicit justification
        |                before a redirected unit can be recorded as retaining 100% of its value)
        v
Report  --------------  exposure-vs-outcome rollup, confidence mix, export to CSV/XLSX, print
        v
Audit Trail  ---------  every action taken, append-only, who/what/when
```

Each step's page is a real database read; each mutation is a real database write; reloading the
browser at any point in this workflow shows exactly what's actually stored, not a client-side
cache.

## Key design decisions preserved from the domain model

- **Never coerce a missing/invalid quantity or price to zero.** Both are `number | null` with an
  explicit `ok | missing | invalid` parse-status field, everywhere a number is parsed from a
  source file.
- **Two distinct "nothing to show" outcomes, not conflated:** an *Unmapped Exposure Gap* (no
  crosswalk approved -- no database row is ever created) versus an *Unresolved* exposure record
  (a row *is* created, but something needed for a trustworthy number is missing -- its dollar
  fields are `0` by construction, and the report layer excludes Unresolved records from every
  total, visible only via a count).
- **Exposure confidence and cancellation confidence are answers to two different questions** and
  are kept visually distinct in the UI on purpose (a square badge vs. a differently-shaped round
  pill) so they can't be casually merged into one "risk" indicator.
- **Immutability**: an `ExposureSourceSnapshot` freezes every input used in a calculation
  (crosswalk version, supplier-terms version, exchange rate + its own snapshot id, quantities,
  prices, which alternate-demand allocations were used). Recalculating never updates a past
  `ExposureRecord` -- it inserts a new one and marks the old one `supersededById`. The Exposure
  page's row-click detail drawer shows this frozen snapshot directly.
- **The corrected financial formula**: a cancellation fee is counted exactly once (inside
  `actual_realized_loss`), not subtracted from the avoidance side and added again on the loss
  side -- an earlier draft double-counted it.

## Current limitations

- **Gap visibility is transient.** An Unmapped Exposure Gap is, by design, never a database row --
  nothing was created, so there's nothing to persist. Gaps are shown immediately after running a
  calculation and are not retained across a page reload; re-running the calculation reproduces
  them.
- **One-to-many / many-to-one crosswalk allocation** can be configured in the mapping UI, but
  `db/repositories/exposure.ts` currently resolves against only the *first* allocation rule for a
  given crosswalk rather than fully reconciling a multi-row split -- sufficient to demonstrate the
  "Unresolved when invalid" behavior, not a complete reconciliation.
- **No authentication.** `DemoUserContext` is an explicit, honestly-labeled "Demo" role switcher
  standing in for real login/RBAC. Every table already has an `organizationId` column so real
  multi-tenancy is a matter of resolving the actual org from a session, not a schema change.
- **Single bootstrap organization.** `getOrCreateDefaultOrganization()` is the only tenant that
  exists right now.
- **PO-to-engineering-change linkage is an interim simplification.** `purchaseOrders.engineeringChangeId`
  ties a PO import to the EC it was uploaded for. A real production model would share one PO
  master across many engineering changes (a PO becomes "relevant" to an EC via BOM-diff
  part-number matching at exposure-calculation time, not at upload time) -- flagged here rather
  than silently treated as the final shape.
- **No component-level rendering tests.** The tests exercise pure domain logic and the real
  database/repository layer directly (where the actual business-rule risk lives); there is no
  React-Testing-Library/jsdom test clicking through the rendered pages. `npm run build` plus
  manual route verification substitute for that here.
- **The `xlsx` npm dependency has open security advisories with no fix published to the npm
  registry** (SheetJS moved patched releases to its own CDN). Documented with the exact
  remediation command in `XLSX_REMEDIATION.md`; not executed in this environment because that CDN
  isn't reachable from here.
- **SQLite, single file, no backup strategy, no connection pooling** -- appropriate for local
  development and demos, not for a real multi-user production deployment.

## Future roadmap

- **Postgres.** The schema is already written using only cross-compatible Drizzle column types.
  Migration path: stand up a Postgres instance, swap `drizzle-orm/better-sqlite3` for
  `drizzle-orm/postgres-js` (or `node-postgres`) in `db/client.ts`, regenerate migrations with
  `dialect: "postgresql"` in `drizzle.config.ts`, and run them against the real database. No
  repository or Server Action code should need to change.
- **Real authentication and RBAC.** Replace `DemoUserContext` with a real session (NextAuth or
  equivalent), resolve the actual `organizationId` and `User` row from that session instead of
  `getOrCreateDefaultOrganization()`, and let the existing `organizationId` columns do the
  multi-tenant scoping they were already built for.
- **Full one-to-many/many-to-one crosswalk reconciliation** in `db/repositories/exposure.ts`,
  replacing the current first-rule-only resolution.
- **A proper PO-to-EC relevance model**, replacing the interim `purchaseOrders.engineeringChangeId`
  column with the BOM-diff-driven relevance join described above.
- **Production deployment**: containerize (`Dockerfile` + `docker-compose.yml` for app + Postgres),
  CI (lint/typecheck/test/build on every PR), structured logging, and a real backup strategy for
  the database.
- **The deferred `xlsx` CDN remediation**, executed and verified once run in an environment with
  unrestricted network access (see `XLSX_REMEDIATION.md`).
