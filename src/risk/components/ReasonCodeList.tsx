import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { directionColor, fmtDelta, fmtScore } from "../format";
import { TrendSparkline } from "./TrendSparkline";
import type { RiskReasonCode } from "../types";

/**
 * Die Treiber dieses Falls - die Kernkomponente des Produkts.
 * Drei bis fuenf Zeilen, sortiert nach absolutem Punktbeitrag. Kein Fliesstext,
 * keine Handlungsempfehlung: der Beitrag in Punkten ist die Aussage.
 */
export function ReasonCodeList({
  reasonCodes, max = 5,
}: { reasonCodes: RiskReasonCode[]; max?: number }) {
  const list = [...(reasonCodes ?? [])]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, max);

  if (list.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Fuer diesen Namen liegen keine belastbaren Treiber vor. Das heisst nicht,
        dass es keine gibt, sondern dass die Datenlage fuer eine Zuordnung zu duenn ist.
      </p>
    );
  }

  const maxAbs = Math.max(...list.map((r) => Math.abs(r.contribution)), 1);

  return (
    <div>
      <ul className="space-y-3">
        {list.map((r) => {
          const color = directionColor(r.direction);
          const widthPct = (Math.abs(r.contribution) / maxAbs) * 100;
          const negative = r.contribution < 0;
          return (
            <li key={r.metric_key} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 items-start">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{r.name}</span>
                  {r.short_code && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r.short_code}</span>
                  )}
                  <span className="text-xs text-muted-foreground">Wert {fmtScore(r.value)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{r.label}</p>
                {/* Beitragsbalken: Laenge = Gewicht des Treibers, Seite = Richtung */}
                <div className="mt-1.5 h-1.5 rounded-full bg-muted/60 overflow-hidden flex" aria-hidden>
                  <span className="w-1/2 flex justify-end">
                    {negative && <span className="h-full rounded-l-full" style={{ width: `${widthPct}%`, backgroundColor: color }} />}
                  </span>
                  <span className="w-1/2">
                    {!negative && <span className="h-full rounded-r-full block" style={{ width: `${widthPct}%`, backgroundColor: color }} />}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-base font-semibold tabular-nums" style={{ color }}>
                  {fmtDelta(r.contribution, 1)}
                </div>
                <div className="text-[10px] text-muted-foreground">Punkte</div>
                <TrendSparkline values={r.trend_6m} width={72} height={20} showGapHint={false} className="mt-1" />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[11px] leading-snug text-muted-foreground/70 flex items-start gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label="Wie ist der Punktbeitrag zu lesen?" className="mt-0.5 shrink-0 text-muted-foreground/70 hover:text-foreground">
              <Info className="w-3 h-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs leading-relaxed">
            Der Punktbeitrag sagt, wie viele Punkte des Gesamtscores auf diese
            Kennzahl entfallen - gemessen gegen den Sektor-Median der
            Vergleichsgruppe. Die Summe aller Treiber ergibt nicht den Score,
            sondern erklaert seine Abweichung.
          </TooltipContent>
        </Tooltip>
        <span>
          Punktbeitrag am Gesamtscore, signiert. Sortiert nach Gewicht, nicht nach Kategorie.
        </span>
      </p>
    </div>
  );
}
