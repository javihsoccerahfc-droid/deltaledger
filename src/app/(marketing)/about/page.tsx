import { ScrollReveal } from "@/components/marketing/ScrollReveal";

export const metadata = {
  title: "About — DeltaLedger",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-20">
      <ScrollReveal>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">About</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Engineering change decisions deserve the same rigor as the engineering itself.
        </h1>
        <div className="mt-8 space-y-5 text-sm leading-relaxed text-ink-soft">
          <p>
            An engineering change is a technical decision and a financial one at the same time.
            Most organizations are well-equipped for the first and poorly equipped for the
            second — not for lack of data, but because the data that would answer &ldquo;what does
            this cost us, right now, on parts we&apos;ve already committed to buy&rdquo; is split
            across systems that were never built to talk to each other.
          </p>
          <p>
            DeltaLedger exists to close that gap — deterministically, with every figure traceable
            to a real source record, and without ever presenting a number the underlying data
            doesn&apos;t actually support. The goal isn&apos;t to make the decision for you. It&apos;s
            to make sure the decision is made with the evidence already in front of you, instead
            of assembled by hand after the fact.
          </p>
        </div>
      </ScrollReveal>
    </div>
  );
}
