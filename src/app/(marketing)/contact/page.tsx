import { ScrollReveal } from "@/components/marketing/ScrollReveal";

export const metadata = {
  title: "Contact — DeltaLedger",
};

/**
 * Honest "coming soon" state -- deliberately not a mailto link or a form. No real contact
 * destination (email, form endpoint, CRM, scheduling link) exists in this codebase yet, and
 * inventing one to make the page look finished is exactly what it must not do. The layout is
 * built so a real destination can be dropped into the single CTA slot below without touching
 * anything else on the page.
 */
export default function ContactPage() {
  return (
    <div className="mx-auto max-w-[640px] px-6 py-20">
      <ScrollReveal>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">Contact</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Let&apos;s talk.</h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-soft">
          Contact details for DeltaLedger aren&apos;t published yet. Check back shortly, or start
          with the interactive demo in the meantime.
        </p>
        <div className="mt-8 inline-block rounded-md border border-line bg-white px-5 py-3 text-sm font-medium text-ink-soft shadow-sm">
          Contact details coming soon
        </div>
      </ScrollReveal>
    </div>
  );
}
