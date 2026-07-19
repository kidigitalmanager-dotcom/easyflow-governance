import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { confidenceMeta, fmtPct } from "../format";

/**
 * Konfidenz mit Erlaeuterung. Nicht abschaltbar: ein Underwriter, der die
 * Datenlage nicht sieht, entscheidet falsch und schiebt es auf uns.
 */
export function ConfidenceMeter({
  value, compact = false,
}: { value: number | null | undefined; compact?: boolean }) {
  const meta = confidenceMeta(value);
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value)) * 100;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5" title={`Konfidenz ${fmtPct(value)} (${meta.label}). ${meta.hint}`}>
        <span className="h-1.5 w-10 rounded-full bg-muted overflow-hidden inline-block align-middle">
          <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{fmtPct(value)}</span>
      </span>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          Konfidenz
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Was bedeutet Konfidenz?" className="text-muted-foreground/70 hover:text-foreground">
                <Info className="w-3 h-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed">
              Wie belastbar die Datenbasis hinter diesem Score ist: wie viele Signale
              geliefert haben, wie aktuell sie sind und wie lang die Historie ist.
              Die Konfidenz sagt nichts darueber, wie gut oder schlecht der Name
              dasteht, sondern nur, wie sicher die Aussage ist.
            </TooltipContent>
          </Tooltip>
        </span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: meta.color }}>
          {fmtPct(value)} <span className="font-normal">· {meta.label}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">{meta.hint}</p>
    </div>
  );
}
