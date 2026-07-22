import { ReactNode } from "react";

/**
 * The base container primitive for V2's design system. Every card-shaped surface in the
 * product (metric tiles, the evidence coverage panel, portfolio rows) should compose this
 * rather than hand-rolling its own border/padding/radius combination.
 *
 * Phase 6D -- added a subtle shadow (`shadow-sm`) alongside the existing border. A flat,
 * shadowless white box against a barely-different `paper` page background was the actual gap
 * behind "everything feels flat" -- not a missing color, a missing depth cue. This is the one
 * `surface` treatment; DeltaLedger's other, much bolder surface (`Hero.tsx`) is intentionally
 * a separate component, not a variant of this one -- see that file for why.
 */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-md border border-line bg-white shadow-sm ${className}`}>{children}</div>;
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border-b border-line px-4 py-3 ${className}`}>{children}</div>;
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 py-4 ${className}`}>{children}</div>;
}
