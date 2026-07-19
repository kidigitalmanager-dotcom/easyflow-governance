import { ArrowUpRight } from "lucide-react";
import { BAND_LABEL, bandColor, fmtScore } from "../format";
import type { RiskCounterfactual } from "../types";

/**
 * Gegenprobe: was muesste sich aendern. Deterministisch aus dem Snapshot
 * gerechnet, nicht generiert. Rechtlich der wichtigste Block (D&B C-203/22),
 * fachlich der ueberzeugendste: damit kann ein Underwriter mit dem Kunden reden.
 */
export function CounterfactualCard({ cf }: { cf: RiskCounterfactual | null | undefined }) {
  if (!cf) return null;
  const color = bandColor(cf.target_band);
  const reachable = cf.levers.length > 0;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}1a`, color }}>
          <ArrowUpRight className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-foreground leading-relaxed">{cf.text}</p>

          {reachable ? (
            <ul className="mt-3 space-y-1.5">
              {cf.levers.map((l) => (
                <li key={l.metric_key} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{l.name}</span>
                  <span className="tabular-nums whitespace-nowrap">
                    <span className="text-muted-foreground">{fmtScore(l.current)}</span>
                    <span className="text-muted-foreground/50 mx-1">auf</span>
                    <span className="font-semibold" style={{ color }}>{fmtScore(l.required)}</span>
                    <span className="text-muted-foreground/60 ml-1.5">({l.delta == null ? "–" : `+${Math.round(l.delta)}`})</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Kein einzelner Treiber traegt weit genug. Das ist eine Aussage ueber
              die Datenlage, keine ueber den Namen.
            </p>
          )}

          <p className="mt-3 text-[11px] text-muted-foreground/70">
            Zielband {BAND_LABEL[cf.target_band]} ab Score {cf.target_score}
            {cf.gap > 0 && <> · Abstand aktuell {cf.gap} Punkte</>}
            {" · "}Rechnung bei sonst unveraenderten Werten, deterministisch, ohne Sprachmodell.
          </p>
        </div>
      </div>
    </div>
  );
}
