import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeltaLedger",
  description: "Deterministic financial exposure analysis for engineering changes.",
};

/**
 * Trimmed deliberately, as part of the V3 public/workspace split: this file now owns only
 * what's genuinely global (fonts, base color, html/body tags) -- not navigation and not the
 * demo-user role context, both of which are workspace-specific concepts with no business
 * loading on the public marketing pages. See:
 *   - src/app/(workspace)/layout.tsx -- SiteHeader in "workspace" mode + DemoUserProvider
 *   - src/app/(marketing)/layout.tsx -- SiteHeader in "public" mode + PublicFooter
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-paper text-ink">{children}</body>
    </html>
  );
}
