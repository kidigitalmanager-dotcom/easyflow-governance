import { useEffect, useRef, useState } from "react";

/**
 * Redesign 27.07.2026 — Bewegungs-Bausteine.
 *
 * Regel aus dem Briefing: ruhig und langsam, niemals blinken, und
 * `prefers-reduced-motion` wird ueberall respektiert. Die CSS-Seite ist in
 * index.css geloest (globaler Media-Query); hier steht nur, was JS wissen muss
 * — vor allem: Count-up ueberspringen statt beschleunigen.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    // Safari < 14 kennt addEventListener auf MediaQueryList nicht.
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  return reduced;
}

/**
 * Zaehlt eine Kennzahl in ~950 ms hoch (cubic ease-out) — das `armCount`-Muster
 * aus Leons Entwurf. Wichtig fuer die echte Console:
 *  - `value === null/undefined` heisst "Server hat noch nichts geliefert";
 *    dann wird NICHT von 0 hochgezaehlt, sondern nichts angezeigt.
 *  - Beim Wechsel auf einen neuen Wert wird vom bisherigen Stand weitergezaehlt,
 *    damit ein Refetch nicht auf 0 zurueckspringt.
 */
export function useCountUp(
  value: number | null | undefined,
  durationMs = 950,
): number | null {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState<number | null>(
    value === null || value === undefined ? null : reduced ? value : 0,
  );
  const fromRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === null || value === undefined) {
      setDisplay(null);
      return;
    }
    if (reduced || durationMs <= 0) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    const delta = value - from;
    if (delta === 0) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
      setDisplay(from + delta * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
        setDisplay(value);
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [value, durationMs, reduced]);

  return display;
}
