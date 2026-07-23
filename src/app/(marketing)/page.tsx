import Link from "next/link";
import { EngineeringChangeStory } from "@/components/marketing/EngineeringChangeStory";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

/**
 * The homepage's job is to demonstrate DeltaLedger's core insight before it names the product --
 * see EngineeringChangeStory for the actual mechanism. This file stays deliberately thin: a
 * one-line opening (not a hero paragraph), the story itself, and a single short close. Anything
 * that reads as a feature list belongs on /product, not here.
 */
export default function HomePage() {
  return (
    <div>
      <section className="bg-ink pb-8 pt-20 sm:pt-28">
        <div className="mx-auto max-w-[1400px] px-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">DeltaLedger</p>
          <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            One engineering change. Watch what it touches.
          </h1>
        </div>
      </section>

      <div className="bg-ink">
        <EngineeringChangeStory />
      </div>

      <section className="mx-auto max-w-[1400px] px-6 py-28 text-center">
        <ScrollReveal>
          <p className="mx-auto max-w-md text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            See it before it&apos;s expensive.
          </p>
          <Link
            href="/demo"
            className="mt-7 inline-block rounded-sm bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
          >
            Explore the Interactive Demo
          </Link>
        </ScrollReveal>
      </section>
    </div>
  );
}
