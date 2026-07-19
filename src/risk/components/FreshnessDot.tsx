import { fmtAge, FRESHNESS_META } from "../format";
import type { RiskFreshness } from "../types";

/** fresh / stale / dead plus Alter. Ohne Alter ist der Status wertlos. */
export function FreshnessDot({
  freshness, showLabel = true, showAge = true,
}: { freshness: RiskFreshness | null | undefined; showLabel?: boolean; showAge?: boolean }) {
  const status = freshness?.status ?? "no_sla";
  const meta = FRESHNESS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs"
      title={`${meta.label}. ${meta.hint} Zuletzt beobachtet ${fmtAge(freshness?.age_hours)}.`}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} aria-hidden />
      {showLabel && <span style={{ color: meta.color }}>{meta.label}</span>}
      {showAge && <span className="text-muted-foreground/70">{fmtAge(freshness?.age_hours)}</span>}
    </span>
  );
}
