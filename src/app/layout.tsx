import type { Metadata } from "next";
import "./globals.css";
import { DemoUserProvider } from "@/lib/context/DemoUserContext";
import { TopNav } from "@/components/layout/TopNav";

export const metadata: Metadata = {
  title: "DeltaLedger",
  description: "A deterministic financial decision platform for engineering changes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-paper text-ink">
        <DemoUserProvider>
          <TopNav />
          <main className="mx-auto max-w-[1400px] px-6 py-8">{children}</main>
        </DemoUserProvider>
      </body>
    </html>
  );
}
