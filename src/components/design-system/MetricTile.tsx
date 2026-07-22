import { Card } from "./Card";

export type MetricTone = "neutral" | "success" | "warning" | "critical";

const TONE_TEXT: Record<MetricTone, string> = {
  neutral: "text-ink",
  success: "text-status-success",
  warning: "text-status-warning",
  critical: "text-status-critical",
};

/**
 * A single labeled value -- the primitive behind every "$482,000 / Known"-style summary block
 * in the product (Context Bar, Overview, and later the Portfolio Command Center). Per the
 * Experience Specification: the value is always visually louder than its label. Reused, not
 * rebuilt, everywhere a number needs a caption.
 */
export function MetricTile({
  label,
  value,
  tone = "neutral",
  size = "md",
}: {
  label: string;
  value: string;
  tone?: MetricTone;
  size?: "sm" | "md" | "lg";
}) {
  const valueSizeClass = size === "lg" ? "text-2xl" : size === "md" ? "text-lg" : "text-base";

  return (
    <Card className="px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`data-num mt-0.5 font-semibold ${valueSizeClass} ${TONE_TEXT[tone]}`}>{value}</p>
    </Card>
  );
}
