import { ReactNode, ElementType } from "react";

/**
 * Phase 6D -- the typographic scale, as real components rather than a documented convention.
 * Before this, every page picked its own size/weight/color for "the page title" or "a section
 * header," which is exactly how a product ends up feeling like several tools stitched
 * together rather than one. A convention that lives only in a comment gets drifted from the
 * first time someone is in a hurry; a component that's actually imported can't drift.
 *
 * Six tiers, each with one fixed treatment:
 *  - PageTitle: one per page, the route-level heading.
 *  - NarrativeConclusion: the Phase 6C "answer" sentence -- promoted here to its own tier
 *    specifically so it's never rendered as an afterthought-sized paragraph again.
 *  - SectionHeader: labels a group of related content.
 *  - MetricValue: a standalone number that needs to read as important (bigger than the old
 *    MetricTile default) -- tabular/mono, since numeric rhythm is part of this product's
 *    identity.
 *  - Caption: metadata, timestamps, micro-labels.
 *  - Body text has no wrapper -- plain `text-sm text-ink` is already used correctly
 *    everywhere; wrapping it would add indirection without adding consistency.
 */

export function PageTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h1 className={`text-2xl font-semibold tracking-tight text-ink ${className}`}>{children}</h1>;
}

export function NarrativeConclusion({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xl font-semibold leading-snug text-ink ${className}`}>{children}</p>;
}

export function SectionHeader({
  children,
  as: Component = "h2",
  className = "",
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}) {
  return <Component className={`text-sm font-semibold uppercase tracking-wide text-ink-soft ${className}`}>{children}</Component>;
}

export function MetricValue({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`data-num text-2xl font-semibold tracking-tight text-ink md:text-3xl ${className}`}>{children}</p>;
}

export function Caption({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] uppercase tracking-wide text-ink-soft ${className}`}>{children}</p>;
}
