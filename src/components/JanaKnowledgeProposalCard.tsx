import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Sparkles, Check, X, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJanaKnowledge, usePatchJanaKnowledge } from "@/hooks/use-api";

// ---------------------------------------------------------------------------
// B3 Jana-Wissen: dezente Vorschlags-Karte auf /signale (Muster
// UpsellSuggestionCard). Zeigt maximal 2 offene Wissens-Vorschläge mit
// 1-Klick-Bestätigen/Ablehnen; rendert NICHTS, wenn keine Vorschläge offen
// sind oder die API (noch) nicht erreichbar ist. Kein Pop-up, kein Spam.
// ---------------------------------------------------------------------------

const MAX_SHOWN = 2;

export function JanaKnowledgeProposalCard() {
  const { data } = useJanaKnowledge();
  const patchMutation = usePatchJanaKnowledge();
  const [busyId, setBusyId] = useState<number | null>(null);

  const proposed = (data?.ok ? data.facts : []).filter((f) => f.status === "proposed");
  if (!proposed.length) return null;

  const shown = proposed.slice(0, MAX_SHOWN);
  const more = proposed.length - shown.length;

  const decide = (id: number, action: "confirm" | "reject") => {
    setBusyId(id);
    patchMutation.mutate({ id, action }, {
      onSuccess: () => toast.success(action === "confirm"
        ? "Bestätigt — Jana nutzt diese Regel ab sofort."
        : "Abgelehnt — Jana schlägt das nicht erneut vor."),
      onError: (e: Error) => toast.error(e.message || "Aktion fehlgeschlagen"),
      onSettled: () => setBusyId(null),
    });
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-amber" />
        <h3 className="text-sm font-medium">Jana hat etwas gelernt — stimmt das?</h3>
      </div>
      {/* 2026-07-29 (Frontend-Befund 3): identisch zum Jana-Wissen-Tab. Die
          Klasse `dark:bg-amber-950/20` war wirkungslos (kein `dark` auf <html>),
          uebrig blieb helles Creme auf dunkler Karte. Echte Tokens statt der
          rohen Tailwind-Palette. */}
      {shown.map((fact) => (
        <div
          key={fact.id}
          className="relative overflow-hidden rounded-[var(--radius)] border border-amber/25 bg-amber-surface/70 p-3 pl-4 space-y-2"
        >
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-amber/70" />
          <p className="text-sm">{fact.fact_text}</p>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7" disabled={busyId === fact.id} onClick={() => decide(fact.id, "confirm")}>
              {busyId === fact.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Stimmt
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" disabled={busyId === fact.id}
              onClick={() => decide(fact.id, "reject")}>
              <X className="w-3.5 h-3.5" />
              Stimmt nicht
            </Button>
          </div>
        </div>
      ))}
      <Link to="/einstellungen?tab=jana-wissen" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        {more > 0 ? `${more} weitere Vorschläge im Jana-Wissen` : "Alles Wissen ansehen und bearbeiten"}
        <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
