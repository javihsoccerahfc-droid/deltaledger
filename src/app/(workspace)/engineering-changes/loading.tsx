/**
 * Phase 5 (Enterprise Craftsmanship Pass) -- same rationale as the EC workspace loading
 * state (see engineering-changes/[id]/loading.tsx): a calm, static skeleton, no animation
 * beyond the pulse, matching this page's Hero-first composition.
 */
export default function PortfolioLoading() {
  return (
    <div className="animate-pulse space-y-8" aria-hidden="true">
      <div className="h-6 w-48 rounded bg-line/60" />
      <div className="h-36 rounded-lg bg-line/60" />
      <div className="h-48 rounded-md bg-line/40" />
    </div>
  );
}
