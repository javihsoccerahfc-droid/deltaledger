import { ReactNode } from "react";

/**
 * V3 -- extracted from ContextBar's former inline "Current financial position" block. The
 * underlying issue V2 feedback flagged wasn't structural (it already lived inside ContextBar,
 * not a separate floating component) -- it was visual treatment: no container, sitting in open
 * flex whitespace with its own internal two-part layout, which reads as "a small self-contained
 * widget that happens to be positioned here" even though it isn't one in the DOM.
 *
 * A small, contained surface (title, value, optional supporting indicator) used consistently
 * wherever this shape appears -- today that's ContextBar; the Executive Risk Overview-style
 * headline reuses it too rather than re-deriving the same layout independently.
 */
export function StatusPanel({
  title,
  value,
  indicator,
  action,
  className = "",
}: {
  title: string;
  value: ReactNode;
  indicator?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-line bg-paper px-3 py-2 ${className}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-ink-soft">{title}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="data-num text-lg font-semibold text-ink">{value}</div>
            {indicator && <div className="min-w-0">{indicator}</div>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
