import { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-deep disabled:opacity-40",
  secondary: "border border-line bg-white text-ink hover:border-accent hover:text-accent disabled:opacity-40",
  outline: "border border-accent bg-white text-accent hover:bg-accent-soft disabled:opacity-40",
  ghost: "border border-line bg-white text-ink-soft hover:text-ink disabled:opacity-40",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

/**
 * Milestone 5 -- the product's single most duplicated element (a rounded, accent-colored
 * action button) had drifted into several near-identical variants across pages: some used
 * `disabled:opacity-40`, others `disabled:opacity-50`; some secondary buttons got an
 * accent-colored hover state, others didn't. None of this was a deliberate design decision --
 * it was independent pages each re-deriving "what a button looks like" from scratch. This is
 * the one canonical version; every button in the product should render through this rather
 * than hand-rolling its own className string.
 */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-sm font-medium transition-colors ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
