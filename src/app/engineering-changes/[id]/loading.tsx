/**
 * Phase 5 (Enterprise Craftsmanship Pass) -- the shell (ContextBar, WorkspaceTabs) already
 * persists across tab navigation without remounting, per Next.js layout semantics. What was
 * missing was any feedback for the CONTENT area while a page's server data is being fetched --
 * with no loading.tsx anywhere in the app, switching tabs on a slower connection produced a
 * silent, unexplained pause with nothing visibly happening. This is deliberately a calm,
 * static skeleton -- no shimmer animation, no motion -- consistent with the product's
 * "nothing flashy, everything intentional" interaction philosophy. It approximates the shape
 * of a typical workspace page (a Hero-sized block, then supporting content) so the transition
 * reads as "the same page, still arriving" rather than "the page disappeared."
 */
export default function EcSectionLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden="true">
      <div className="h-28 rounded-lg bg-line/60" />
      <div className="space-y-3">
        <div className="h-4 w-1/3 rounded bg-line/60" />
        <div className="h-4 w-1/2 rounded bg-line/40" />
      </div>
      <div className="h-40 rounded-md bg-line/40" />
    </div>
  );
}
