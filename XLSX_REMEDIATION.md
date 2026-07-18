# XLSX Dependency Remediation — DEFERRED, not executed

## Status: attempted, blocked by this environment's network policy, deferred

## Exact command to run in an environment with normal internet access

```bash
npm uninstall xlsx
npm install --save xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

## Why this exact command

`npm audit` reports `xlsx` (currently pinned `^0.18.5`) as vulnerable to two advisories with
"No fix available":

- **GHSA-4r6h-8v6p-xvw6** — Prototype Pollution in SheetJS (CVE-2023-30533), fixed in 0.19.3
- **GHSA-5pgg-2g8v-p4x9** — SheetJS ReDoS (CVE-2024-22363), fixed in 0.20.2

"No fix available" is misleading, not accurate: SheetJS stopped publishing patched releases to
the npm registry after `0.18.5` and moved to distributing fixed versions from their own CDN
(`cdn.sheetjs.com`) instead. A real fix exists; it just isn't installable via a normal
npm-registry semver range.

This matters specifically for this project because `xlsx` is a **direct runtime dependency that
parses user-uploaded files** (BOM/PO/supplier imports), and the prototype-pollution advisory is
explicitly triggered by reading specially crafted files — precisely our ingestion path. This is
not a theoretical, unused-code-path advisory the way most of the Next.js ones currently are.

## Why it's deferred here, not executed

This sandbox's network egress allowlist does not include `cdn.sheetjs.com`:

```
$ npm install --save xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm error code E403
npm error 403 403 Forbidden - GET https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Per instruction, no substitute spreadsheet library was introduced to work around this — the
original `xlsx@^0.18.5` dependency has been restored exactly as it was, and the vulnerability
remains open and tracked here rather than papered over.

## Verification gate — run this BEFORE merging the swap

The public API surface this codebase actually uses (`XLSX.read`, `XLSX.write`,
`XLSX.utils.sheet_to_json`, `XLSX.utils.aoa_to_sheet`, `XLSX.utils.book_new/book_append_sheet`,
`cellDates`) is unchanged between 0.18.5 and 0.20.3 per SheetJS's own migration documentation, so
this should be a drop-in swap. "Should be" is not "verified" — confirm with:

```bash
npm test                      # all tests, including src/core/__tests__/xlsxRegression.test.ts,
                               # which exists specifically to catch a behavior change across this swap
npm run build                  # confirms the bundler still resolves the package correctly
```

Only merge the swap once both are green against the new dependency.

## Current `npm audit` snapshot (with xlsx restored to ^0.18.5)

```
6 vulnerabilities (1 moderate, 5 high)

xlsx  *                     — high — prototype pollution + ReDoS — no npm-registry fix (see above)
next  9.3.4-canary.0-16.3.0-canary.5 — high — multiple DoS/cache-poisoning/XSS advisories,
                               fixed only in next@16.2.10 (major, breaking)
postcss <8.5.10 (nested under next) — moderate — XSS via unescaped </style> in stringify output,
                               fixed only by upgrading next (postcss here is next's own bundled
                               build-time copy, not a direct dependency)
glob 10.2.0-10.4.5 (nested under eslint-config-next) — high — CLI command injection via a flag
                               this project never invokes; dev/lint tooling only, not shipped
```

Next.js's advisory list has grown since the review that first flagged this (npm's advisory
database is queried live and expands over time) — now includes several additional DoS/cache-
poisoning/XSS items, all still gated behind the same major-version fix (`next@16.2.10`) and all
still requiring features this app doesn't yet use (`next/image` remotePatterns, Server Components
caching, Middleware/Proxy i18n, WebSocket upgrades). This doesn't change the earlier
classification — still deferred until real UI work introduces any of that surface, and definitely
resolved before production deployment regardless.
