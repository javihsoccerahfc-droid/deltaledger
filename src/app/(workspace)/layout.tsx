import { DemoUserProvider } from "@/lib/context/DemoUserContext";
import { SiteHeader } from "@/components/layout/SiteHeader";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoUserProvider>
      <SiteHeader variant="workspace" />
      <main className="mx-auto max-w-[1400px] px-6 py-8">{children}</main>
    </DemoUserProvider>
  );
}
