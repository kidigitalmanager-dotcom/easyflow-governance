import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { bandColor, BEHAVIOUR_META, fmtPct, fmtScore, isBehaviourMetric, methodLabel } from "../format";
import { FreshnessDot } from "./FreshnessDot";
import type { RiskCategory, RiskMetric } from "../types";

/**
 * Der KPI-Vektor, gruppiert in die sechs Kategorien. Standardmaessig
 * eingeklappt: wer die Reason Codes gelesen hat, braucht ihn meistens nicht.
 *
 * Je Kennzahl steht KLASSEN-Provenance ("welche Signalfamilie"), nie ein
 * Quellbeleg. Das ist die Produktgrenze zum Investorenprodukt.
 */
export function KpiGrid({
  metrics, categories, highlightCategories = [],
}: {
  metrics: RiskMetric[];
  categories: RiskCategory[];
  highlightCategories?: string[];
}) {
  // Standardmaessig ALLE eingeklappt - so steht es in der Spezifikation.
  // Die Segment-Schwerpunkte steuern die Reihenfolge und eine Markierung,
  // nicht das Aufklappen: sonst liest der Underwriter wieder den ganzen Vektor
  // statt der Treiber.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((s) => ({ ...s, [k]: !s[k] }));

  const highlighted = new Set(highlightCategories);
  const ordered = [...categories].sort(
    (a, b) => Number(highlighted.has(b.key)) - Number(highlighted.has(a.key))
  );

  return (
    <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
      {ordered.map((cat) => {
        const rows = metrics.filter((m) => m.category_key === cat.key);
        const isOpen = !!open[cat.key];
        const color = bandColor(cat.score == null ? "unbekannt" : cat.score >= 70 ? "gesund" : cat.score >= 50 ? "beobachten" : "kritisch");
        return (
          <div key={cat.key}>
            <button
              type="button"
              onClick={() => toggle(cat.key)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            >
              {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
              <span className="text-sm font-medium text-foreground min-w-0 truncate">{cat.name}</span>
              {highlighted.has(cat.key) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 whitespace-nowrap"
                  title="Fuer Ihre Kundengruppe besonders relevant. Zuerst gelistet, aber nicht automatisch geoeffnet.">
                  Schwerpunkt
                </span>
              )}
              <span className="flex-1" />
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {rows.length} {rows.length === 1 ? "Kennzahl" : "Kennzahlen"}
              </span>
              <span className="text-sm font-semibold tabular-nums w-9 text-right" style={{ color }}>
                {fmtScore(cat.score)}
              </span>
            </button>

            {isOpen && (
              <div className="px-4 pb-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      <th className="text-left font-medium py-1.5">Kennzahl</th>
                      <th className="text-right font-medium py-1.5 w-14">Wert</th>
                      <th className="text-right font-medium py-1.5 w-20 hidden sm:table-cell">Perzentil</th>
                      <th className="text-left font-medium py-1.5 w-40 pl-4 hidden md:table-cell">Signalfamilie</th>
                      <th className="text-left font-medium py-1.5 w-32 pl-2">Stand</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {rows.map((m) => {
                      const beh = isBehaviourMetric(m.metric_key);
                      const uebersprungen = m.value == null && !!m.skipped_reason;
                      return (
                      <tr key={m.metric_key}>
                        <td className="py-2 pr-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-foreground/90 cursor-help border-b border-dotted border-muted-foreground/30">
                                {m.name}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs leading-relaxed">
                              {beh
                                ? <><span className="block font-medium mb-1">Verhaltenssignal</span>{BEHAVIOUR_META[m.metric_key].why}</>
                                : (m.measures || "Keine Beschreibung hinterlegt.")}
                            </TooltipContent>
                          </Tooltip>
                          {m.short_code && (
                            <span className="ml-2 text-[10px] font-mono text-muted-foreground/60">{m.short_code}</span>
                          )}
                          {beh && (
                            <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 align-middle"
                              title="Verhaltenssignal - misst das Verhalten gegenueber Glaeubigern, nicht Bilanzwerte">
                              Verhalten
                            </span>
                          )}
                          {/* Ein uebersprungenes Signal sagt warum. Ein leeres Feld
                              wirkt wie ein Fehler, ein erklaertes wie Sorgfalt. */}
                          {uebersprungen && (
                            <span className="block mt-0.5 text-[10px] text-muted-foreground/70 italic">
                              {m.skipped_reason}
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums font-medium"
                          style={{ color: uebersprungen ? "#5A6473" : bandColor(m.band) }}>
                          {uebersprungen ? "kein Wert" : fmtScore(m.value)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                          {m.percentile_vertical == null ? "–" : `p${m.percentile_vertical}`}
                        </td>
                        <td className="py-2 pl-4 text-muted-foreground hidden md:table-cell">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help truncate block max-w-[15rem]">
                                {m.provenance?.sources_used?.join(", ") || "–"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs leading-relaxed">
                              <span className="block font-medium mb-1">{methodLabel(m.provenance?.method_label)}</span>
                              Signalfamilie, nicht Einzelbeleg. Quellbelege werden in
                              diesem Produkt grundsaetzlich nicht ausgeliefert.
                              {m.provenance?.window_weeks ? <> Fenster: {m.provenance.window_weeks} Wochen.</> : null}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="py-2 pl-2">
                          <FreshnessDot freshness={m.freshness} showLabel={false} />
                        </td>
                      </tr>
                    );})}
                    {rows.length === 0 && (
                      <tr><td colSpan={5} className="py-3 text-muted-foreground/60">
                        Keine Kennzahl dieser Kategorie hat fuer diesen Namen Daten.
                      </td></tr>
                    )}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] text-muted-foreground/60">
                  Abdeckung dieser Kategorie {fmtPct(cat.coverage)} · Konfidenz {fmtPct(cat.confidence)}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
