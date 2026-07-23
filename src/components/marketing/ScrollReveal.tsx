"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

/**
 * DeltaLedger's public pages use exactly one reveal mechanic, applied consistently, rather than
 * a different animation library or easing curve per section -- the same "one canonical version"
 * discipline the workspace's Button/Card components already hold everything else to.
 *
 * Deliberately no animation library: a single IntersectionObserver plus a CSS transition covers
 * every use on these pages, and `motion-reduce:` needs no JS branch at all -- Tailwind's variant
 * handles it declaratively. Adding a dependency for this would be the exact over-engineering the
 * V3 design review flagged elsewhere in this codebase.
 */
export function ScrollReveal({
  children,
  className = "",
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
      className={`motion-safe:transition motion-safe:duration-700 motion-safe:ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      } ${className}`}
    >
      {children}
    </div>
  );
}
