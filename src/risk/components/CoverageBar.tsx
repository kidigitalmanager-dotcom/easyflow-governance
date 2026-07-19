import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { connectedSourceLabel, fmtPct, QUALITY_TIER_META } from "../format";
import type { ConnectedSource, QualityTier, RiskCategory } from "../types";

/**
 * Coverage heisst hier nicht nur "wie viel Prozent", sondern: welche
 * Signalfamilien haben fuer diesen Namen ueberhaupt Daten und welche nicht.
 * Die Luecke ist die eigentliche Information.
 */
export function CoverageBar({
  coverage, categories, connectedSources, qualityTier,
}: {
  coverage: number | null | undefined;
  categories?: RiskCategory[];
  connectedSources?: ConnectedSource[];
  qualityTier?: QualityTier;
}) {
  const pct = coverage == null ? 0 : Math.max(0, Math.min(1, coverage)) * 100;
  const tier = qualityTier ? QUALITY_TIER_META[qualityTier] : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          Datenabdeckung
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Was bedeutet Datenabdeckung?" className="text-muted-foreground/70 hover:text-foreground">
                <Info className="w-3 h-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed">
              Anteil der Kennzahlen, die fuer diesen Namen tatsaechlich Daten haben.
              Eine niedrige Abdeckung heisst nicht, dass es dem Namen schlecht geht,
              sondern dass wir weniger von ihm sehen.
            </TooltipContent>
          </Tooltip>
        </span>
        <span className="text-xs font-semibold tabular-nums text-foreground">{fmtPct(coverage)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {tier && (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground/80">
          <span className="font-medium text-foreground">Qualitaetsstufe {tier.label}</span>
          {" ("}{tier.short}{"). "}{tier.hint}
        </p>
      )}

      {connectedSources && connectedSources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {connectedSources.map((s) => (
            <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
              {connectedSourceLabel(s)}
            </span>
          ))}
        </div>
      )}

      {categories && categories.length > 0 && (
        <ul className="mt-3 space-y-1">
          {categories.map((c) => {
            const has = (c.kpis_with_data ?? 0) > 0;
            return (
              <li key={c.key} className="flex items-center justify-between text-[11px]">
                <span className={has ? "text-muted-foreground" : "text-muted-foreground/50"}>{c.name}</span>
                <span className={has ? "text-foreground/80 tabular-nums" : "text-muted-foreground/50"}>
                  {has ? `${c.kpis_with_data} Kennzahlen` : "keine Daten"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
