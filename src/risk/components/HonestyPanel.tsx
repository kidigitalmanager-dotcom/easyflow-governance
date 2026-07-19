import { AlertTriangle } from "lucide-react";
import { fmtCount, FRESHNESS_META } from "../format";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { CoverageBar } from "./CoverageBar";
import { FreshnessDot } from "./FreshnessDot";
import type { FreshnessStatus, RiskScore } from "../types";

/**
 * Block 2 - Ehrlichkeit. Steht direkt unter dem Score, nicht am Seitenende.
 * Konfidenz, Abdeckung, Aktualitaet und der Hinweis auf duenne Historie.
 * Diese Elemente sind nirgends abschaltbar.
 */
export function HonestyPanel({ score }: { score: RiskScore }) {
  const counts: Record<FreshnessStatus, number> = { fresh: 0, stale: 0, dead: 0, no_sla: 0 };
  for (const m of score.metrics ?? []) counts[m.freshness?.status ?? "no_sla"]++;
  const total = score.metrics?.length ?? 0;
  const worst: FreshnessStatus = counts.dead > 0 ? "dead" : counts.stale > 0 ? "stale" : "fresh";
  const oldest = (score.metrics ?? []).reduce<number | null>(
    (acc, m) => (m.freshness?.age_hours == null ? acc : acc == null ? m.freshness.age_hours : Math.max(acc, m.freshness.age_hours)),
    null
  );

  return (
    <section aria-label="Datenlage" className="rounded-xl border border-border bg-card/40 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        Wie belastbar ist diese Bewertung
      </h3>

      {score.history_note && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#E8A33D]/30 bg-[#E8A33D]/10 px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#E8A33D" }} />
          <p className="text-xs leading-snug" style={{ color: "#E8A33D" }}>{score.history_note}</p>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <ConfidenceMeter value={score.confidence} />
        <CoverageBar
          coverage={score.coverage}
          categories={score.categories}
          connectedSources={score.connected_sources}
          qualityTier={score.quality_tier}
        />
      </div>

      <div className="mt-4 pt-3 border-t border-border/60 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="text-xs font-medium text-muted-foreground">Aktualitaet der Quellen</span>
        <FreshnessDot freshness={{ status: worst, age_hours: oldest, last_observed_at: null }} />
        <span className="text-[11px] text-muted-foreground/70">
          {fmtCount(counts.fresh)} von {fmtCount(total)} Kennzahlen aktuell
          {counts.stale > 0 && <> · {fmtCount(counts.stale)} veraltet</>}
          {counts.dead > 0 && <> · {fmtCount(counts.dead)} abgerissen</>}
        </span>
        {(counts.stale > 0 || counts.dead > 0) && (
          <span className="text-[11px]" style={{ color: FRESHNESS_META[worst].color }}>
            {FRESHNESS_META[worst].hint}
          </span>
        )}
      </div>
    </section>
  );
}
