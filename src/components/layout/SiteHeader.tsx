"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RoleSwitcher } from "./RoleSwitcher";

const PUBLIC_NAV = [
  { href: "/", label: "Home" },
  { href: "/product", label: "Product" },
  { href: "/demo", label: "Interactive Demo" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

/**
 * DeltaLedger V3 -- the single mechanism that makes the public site and the workspace read as
 * one product rather than two: one component, one logo mark, one height, one border, one set
 * of colors -- only the content inside changes. "public" renders the five-item site nav plus a
 * single accent CTA; "workspace" renders exactly what the former TopNav rendered (RoleSwitcher).
 * Never fork this into two separate header components -- if the two variants' needs diverge
 * enough that this stops being one component, that's a signal to reconsider the variant, not to
 * duplicate the chrome.
 */
export function SiteHeader({ variant }: { variant: "public" | "workspace" }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-6 py-3">
        <Link href={variant === "public" ? "/" : "/engineering-changes"} className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-accent-deep text-xs font-bold text-white">
            DL
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink">DeltaLedger</span>
        </Link>

        {variant === "public" ? (
          <nav className="flex items-center gap-6" aria-label="Site">
            <ul className="hidden items-center gap-6 sm:flex">
              {PUBLIC_NAV.slice(0, -1).map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`text-sm font-medium transition-colors ${
                        active ? "text-ink" : "text-ink-soft hover:text-ink"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link
              href="/contact"
              className="hidden text-sm font-medium text-ink-soft transition-colors hover:text-ink sm:inline"
            >
              Contact
            </Link>
            <Link
              href="/demo"
              className="rounded-sm bg-accent px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
            >
              View Demo
            </Link>
          </nav>
        ) : (
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xs font-medium text-ink-soft transition-colors hover:text-ink">
              ← Back to DeltaLedger
            </Link>
            <RoleSwitcher />
          </div>
        )}
      </div>
    </header>
  );
}
