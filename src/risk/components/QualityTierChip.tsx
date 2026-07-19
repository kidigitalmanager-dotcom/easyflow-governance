import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Layers } from "lucide-react";
import { connectedSourceLabel, QUALITY_TIER_META } from "../format";
import type { ConnectedSource, QualityTier } from "../types";

/**
 * Qualitaetsstufe: Basis / Erweitert / Voll. Sie sagt, wie tief wir bei diesem
 * Namen ueberhaupt sehen koennen - abhaengig davon, was der bewertete Betrieb
 * angeschlossen hat. Ein Name mit Bank- und Buchhaltungsanschluss ist fuer einen
 * Underwriter mehr wert als einer mit Postfach allein.
 */
export function QualityTierChip({
  tier, connectedSources, size = "md",
}: { tier: QualityTier; connectedSources?: ConnectedSource[]; size?: "sm" | "md" }) {
  const meta = QUALITY_TIER_META[tier];
  const filled = tier === "voll" ? 3 : tier === "erweitert" ? 2 : 1;
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 text-muted-foreground cursor-help ${pad}`}>
          <Layers className="w-3 h-3 shrink-0" />
          <span className="font-medium text-foreground/90">{meta.label}</span>
          <span className="flex gap-0.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-1 h-2.5 rounded-sm"
                style={{ backgroundColor: i < filled ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.25)" }} />
            ))}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">
        <span className="block font-medium mb-1">Qualitaetsstufe {meta.label} ({meta.short})</span>
        {meta.hint}
        {connectedSources && connectedSources.length > 0 && (
          <span className="block mt-1.5 text-muted-foreground">
            Angeschlossen: {connectedSources.map(connectedSourceLabel).join(", ")}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
