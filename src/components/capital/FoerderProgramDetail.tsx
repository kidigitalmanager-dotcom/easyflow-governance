// ─────────────────────────────────────────────────────────────────────────────
// FoerderProgramDetail.tsx — aufklappbare, belegte Antrags-Detailansicht je Programm.
// Lazy: laedt die foerder-detail RAG-Antwort erst auf Klick (LLM-Kosten schonen).
// Zeigt Jana's belegte Antrags-Zusammenfassung + Unterlagen/Schritte/Fristen (jede
// Aussage mit Richtlinien-Ausschnitt belegt), die Original-Ausschnitte und die Quelle;
// plus "an Berater weiterleiten" -> teilbares PDF-Bundle.
// Ehrlicher Fallback, wenn die Richtlinie (noch) nicht indexiert ist.
// Wird im aufgeklappten ProgramRow der FoerderRadarCard gerendert (einziger Mount-Punkt).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { Sparkles, Loader2, ExternalLink, Send, ClipboardList, ListChecks, CalendarClock, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useFoerderDetail } from "@/hooks/use-capital";
import { FoerderAntragBundle } from "@/components/capital/FoerderAntragBundle";
import type { FoerderProgram, FoerderDetailItem } from "@/lib/capital";

function ItemList({ label, icon, items }: { label: string; icon: React.ReactNode; items: FoerderDetailItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="pt-1">
      <p className="text-[11px] font-medium text-foreground flex items-center gap-1">{icon}{label}</p>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="text-xs text-muted-foreground leading-relaxed pl-3 relative">
            <span className="absolute left-0 top-1.5 w-1 h-1 rounded-full bg-muted-foreground/50" />
            {it.text}
            <span className="ml-1 text-[9px] text-muted-foreground/60 whitespace-nowrap">[Beleg {it.quelle}]</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FoerderProgramDetail({ program }: { program: FoerderProgram }) {
  const [wantDetail, setWantDetail] = useState(false);
  const [showBundle, setShowBundle] = useState(false);
  const [showExcerpts, setShowExcerpts] = useState(false);
  const { data, isLoading, isError } = useFoerderDetail(program.program_key, wantDetail);

  if (!wantDetail) {
    return (
      <button
        type="button"
        onClick={() => setWantDetail(true)}
        className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium rounded-md border border-primary/40 bg-primary/10 text-primary px-2.5 py-1 transition-colors hover:bg-primary/20"
        title="Belegte Antrags-Anleitung aus der offiziellen Richtlinie (Jana)"
      >
        <Sparkles className="w-3 h-3" /> Antrag genauer ansehen (Jana)
      </button>
    );
  }

  if (isLoading) {
    return <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Jana liest die offizielle Richtlinie …</p>;
  }
  if (isError || !data) {
    return <p className="mt-1 text-xs text-muted-foreground">Antrags-Details konnten gerade nicht geladen werden. Bitte die verlinkte Quelle nutzen.</p>;
  }

  const detail = data.detail ?? null;
  const excerpts = data.excerpts ?? [];
  const sourceUrl = data.source_url || program.source || "";

  return (
    <div className="mt-1.5 rounded-md border border-primary/15 bg-primary/[0.03] p-2.5 space-y-1.5">
      {data.indexed && detail?.summary ? (
        <>
          <p className="text-[11px] font-semibold text-primary flex items-center gap-1"><Sparkles className="w-3 h-3" /> So beantragst du das (Jana)</p>
          <p className="text-xs text-foreground/90 leading-relaxed">{detail.summary}</p>
          <ItemList label="Benötigte Unterlagen" icon={<ClipboardList className="w-3 h-3 text-muted-foreground" />} items={detail.documents_needed} />
          <ItemList label="Antrags-Schritte" icon={<ListChecks className="w-3 h-3 text-muted-foreground" />} items={detail.steps} />
          <ItemList label="Fristen & Voraussetzungen" icon={<CalendarClock className="w-3 h-3 text-muted-foreground" />} items={detail.deadlines_conditions} />
          {detail.documents_needed.length === 0 && detail.steps.length === 0 && detail.deadlines_conditions.length === 0 && (
            <p className="text-xs text-muted-foreground">In der Richtlinie sind keine spezifischen Unterlagen/Schritte/Fristen belegt – siehe Original-Ausschnitte und Quelle.</p>
          )}
        </>
      ) : data.indexed ? (
        <p className="text-xs text-muted-foreground">{data.message || "Antrags-Zusammenfassung noch nicht scharfgeschaltet. Unten die relevanten Ausschnitte der offiziellen Richtlinie."}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{data.message || "Die offizielle Richtlinie ist für dieses Programm noch nicht indexiert – bitte die verlinkte Quelle nutzen (sie ist maßgeblich)."}</p>
      )}

      {excerpts.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowExcerpts((v) => !v)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            {showExcerpts ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Ausschnitte aus der offiziellen Richtlinie ({excerpts.length})
          </button>
          {showExcerpts && (
            <div className="mt-1 space-y-1">
              {excerpts.map((ex) => (
                <p key={ex.id} className="text-[11px] text-muted-foreground/90 leading-relaxed border-l-2 border-border pl-2">
                  <span className="text-muted-foreground/60">{ex.id}:</span> {ex.content.length > 320 ? ex.content.slice(0, 320) + " …" : ex.content}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center flex-wrap gap-2 pt-0.5">
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
            <ExternalLink className="w-3 h-3" /> Offizielle Quelle
          </a>
        )}
        <button
          type="button"
          onClick={() => setShowBundle(true)}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium rounded-md border border-primary/40 bg-primary/10 text-primary px-2.5 py-1 transition-colors hover:bg-primary/20"
          title="Programm-Detail + Antrags-Checkliste + Firmendaten als teilbares PDF für den Fördermittelberater"
        >
          <Send className="w-3 h-3" /> An Berater weiterleiten (PDF)
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1 pt-0.5">
        <FileText className="w-2.5 h-2.5" /> {data.disclaimer || "Ohne Gewähr – die offizielle Richtlinie ist maßgeblich."}
      </p>

      {showBundle && <FoerderAntragBundle data={data} onClose={() => setShowBundle(false)} />}
    </div>
  );
}
