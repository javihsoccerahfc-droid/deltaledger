"use client";

import { useEffect, useState } from "react";

/**
 * Animates from 0 to `target` once `start` becomes true. Used exactly once, on the homepage's
 * cascade visualization -- kept as a small standalone hook rather than inlined so the easing
 * and duration can't quietly diverge if a second use ever appears.
 */
export function useCountUp(target: number, durationMs: number, start: boolean): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }

    let frame: number;
    const startTime = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, target, durationMs]);

  return value;
}
