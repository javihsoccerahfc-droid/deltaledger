import type { Metadata } from "next";
import "./globals.css";
import { DemoUserProvider } from "@/lib/context/DemoUserContext";
import { PrototypeBanner } from "@/components/layout/PrototypeBanner";
import { TopNav } from "@/components/layout/TopNav";

export const metadata: Metadata = {
  title: "DeltaLedger",
  description: "Engineering-change financial exposure and mitigation tracking. Not for production purchasing or financial decisions.",
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
          <PrototypeBanner />
          <TopNav />
          <main className="mx-auto max-w-[1400px] px-6 py-8">{children}</main>
        </DemoUserProvider>
      </body>
    </html>
  );
}
