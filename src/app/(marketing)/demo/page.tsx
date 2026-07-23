import Link from "next/link";
import * as ecRepo from "../../../../db/repositories/engineeringChanges";

export const metadata = {
  title: "Interactive Demo — DeltaLedger",
};

// Resolves a real database row at request time -- must never be statically prerendered at
// build time, which would bake in whatever EC id happened to exist (or didn't) at build time
// rather than the actual current state of the database.
export const dynamic = "force-dynamic";

const NOVA_EC_NAME_PREFIX = "ECO-1042";

/**
 * This page IS the guided tour's "Demo Entry / Welcome" step (Master Specification, Section
 * 13) -- there is deliberately no second, workspace-internal welcome screen behind this one.
 * A public marketing page and an in-app entry screen were doing the exact same job; building
 * both would have been the kind of duplicated screen the V3 design review exists to catch.
 *
 * Server component: resolves the real seeded engineering change at request time rather than
 * linking to a hardcoded id, and degrades honestly (not a crash, not a fake link) if the demo
 * data hasn't been seeded against this database yet.
 */
export default async function DemoPage() {
  const all = await ecRepo.listEngineeringChanges();
  const novaEc = all.find((e) => e.name.startsWith(NOVA_EC_NAME_PREFIX));

  return (
    <div className="mx-auto max-w-[900px] px-6 py-20">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">Interactive demo</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Nova Robotics, Inc. — ECO-1042
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-soft">
        Nova Robotics is a realistic, fictional autonomous-mobile-robot manufacturer. ECO-1042 is
        a real engineering change scenario — a PCBA revision to fix thermal throttling — running
        through the real DeltaLedger calculation engine. Nothing here is a mockup, and nothing is
        real customer data.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          { label: "What you'll see", body: "The financial exposure of one real engineering change, calculated live." },
          { label: "What's inside", body: "A full workspace — BOM diff, open POs, mapping, exposure, and the Cutover Simulator." },
          { label: "What to try first", body: "The Cutover Simulator: move the date and watch the numbers change." },
        ].map((item) => (
          <div key={item.label} className="rounded-md border border-line bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{item.label}</p>
            <p className="mt-1.5 text-sm text-ink">{item.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10">
        {novaEc ? (
          <Link
            href={`/engineering-changes/${novaEc.id}/overview`}
            className="inline-block rounded-sm bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
          >
            Enter the Nova Robotics Demo
          </Link>
        ) : (
          <div className="rounded-md border border-status-warning/30 bg-status-warningBg px-4 py-3 text-sm text-status-warning">
            The Nova Robotics demo data hasn&apos;t been seeded against this database yet. Run{" "}
            <code className="font-mono text-xs">npm run db:seed:nova</code> and reload this page.
          </div>
        )}
      </div>
    </div>
  );
}
