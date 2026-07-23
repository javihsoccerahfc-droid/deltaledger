import Link from "next/link";

/**
 * Deliberately minimal -- no sitemap, no column-of-links footer. Three things belong here:
 * the logo mark (so it's recognizable as the same product on every scroll depth), the
 * fictional-company disclosure (Master Specification Section 15 requires this be visible
 * wherever Nova Robotics is referenced or reachable -- the footer is a natural site-wide home
 * for it rather than repeating it inline on every page), and a way to get in touch.
 */
export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-accent-deep text-[10px] font-bold text-white">
            DL
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink">DeltaLedger</span>
        </div>

        <p className="max-w-xl text-xs leading-relaxed text-ink-soft">
          Nova Robotics and ECO-1042 are a realistic, fictional demonstration scenario. No live PLM
          or ERP integration is used, and no real customer data appears anywhere in the demo.
        </p>

        <div className="flex items-center gap-5 text-xs font-medium text-ink-soft">
          <Link href="/about" className="hover:text-ink">
            About
          </Link>
          <Link href="/contact" className="hover:text-ink">
            Contact
          </Link>
          <span>&copy; {new Date().getFullYear()} DeltaLedger</span>
        </div>
      </div>
    </footer>
  );
}
