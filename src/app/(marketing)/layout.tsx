import { SiteHeader } from "@/components/layout/SiteHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader variant="public" />
      <main>{children}</main>
      <PublicFooter />
    </>
  );
}
