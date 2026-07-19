import { useEffect, useState } from "react";
import { Check, Lock, ShieldCheck } from "lucide-react";
import { fmtDateTimeDe, fmtPeriod, fmtScore } from "../format";
import { canWriteDecisionNote, getRiskSession } from "../session";
import type { DecisionNote, DecisionStatus, RiskScore } from "../types";

/**
 * Block 6 - Entscheidungsvermerk.
 *
 * Er ist nicht Arbeitsorganisation, sondern Nachweis: er belegt die Befassung
 * durch einen Menschen, die Art. 22 Abs. 3 DSGVO als Gegenstueck zur
 * automatisierten Bewertung verlangt. Daraus folgt beides:
 *
 * - **append-only.** Kein Bearbeiten, kein Loeschen. Ein ueberschreibbarer
 *   Vermerk belegt nichts.
 * - **Score-Bezug.** Jeder Eintrag haelt fest, auf welchen Stand er sich
 *   bezog: Modellversion, Periode, Score und Berechnungszeitpunkt. Sonst ist
 *   die Entscheidung spaeter nicht rekonstruierbar.
 *
 * Der Vermerk bleibt beim Kunden und fliesst in keinen Score ein. Der Contract
 * hat dafuer noch keinen Endpunkt (STATUS.md, Fund B-2) - bis dahin lokal.
 * Beim Umstellen auf die API muss der Speicher serverseitig append-only sein,
 * per Trigger erzwungen, nicht nur durch die Oberflaeche.
 */
const STATUS_LABEL: Record<DecisionStatus, string> = {
  limit_erhoeht: "Limit erhoeht",
  limit_gehalten: "Limit gehalten",
  limit_gesenkt: "Limit gesenkt",
  abgelehnt: "Abgelehnt",
  eskaliert: "Eskaliert",
};
const STATUS_ORDER: DecisionStatus[] = ["limit_erhoeht", "limit_gehalten", "limit_gesenkt", "abgelehnt", "eskaliert"];
const KEY = (id: string) => `ue_risk_decisions_${id}`;

function load(accountId: string): DecisionNote[] {
  try {
    const raw = window.localStorage.getItem(KEY(accountId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function DecisionNoteBlock({ score }: { score: RiskScore }) {
  const session = getRiskSession();
  const mayWrite = canWriteDecisionNote(session.role);
  const [status, setStatus] = useState<DecisionStatus>("limit_gehalten");
  const [note, setNote] = useState("");
  const [entries, setEntries] = useState<DecisionNote[]>([]);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => { setEntries(load(score.account_id)); setNote(""); setStatus("limit_gehalten"); }, [score.account_id]);

  const append = () => {
    const entry: DecisionNote = {
      account_id: score.account_id,
      status,
      note: note.trim(),
      author: session.role,
      created_at: new Date().toISOString(),
      // Bezugspunkt festhalten: worauf sich diese Entscheidung stuetzte.
      model_version: score.model_version,
      period: score.period,
      score_at_decision: score.health_score,
      computed_at: score.computed_at,
    };
    const next = [entry, ...entries];
    try { window.localStorage.setItem(KEY(score.account_id), JSON.stringify(next)); } catch { /* ignore */ }
    setEntries(next);
    setNote("");
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2500);
  };

  return (
    <div>
      {mayWrite ? (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {STATUS_ORDER.map((s) => {
              const active = s === status;
              return (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    active ? "bg-primary/15 border-primary/40 text-primary"
                           : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"}`}>
                  {STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Begruendung der Entscheidung, interner Vermerk."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />

          <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-muted-foreground/70 max-w-lg">
              Der Vermerk bleibt in Ihrem Haus, wird nicht an UseEasy uebertragen
              und fliesst in keinen Score ein. Er wird <span className="text-foreground/80">nur ergaenzt, nie ueberschrieben</span> -
              er belegt die Befassung durch einen Menschen.
            </p>
            <div className="flex items-center gap-3">
              {justSaved && (
                <span className="text-xs text-primary flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> festgehalten
                </span>
              )}
              <button type="button" onClick={append}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                Vermerk festhalten
              </button>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0" />
          Ihre Rolle darf Entscheidungsvermerke lesen, aber nicht schreiben.
        </p>
      )}

      {entries.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border/60">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Verlauf der Befassung
          </h4>
          <ul className="space-y-2.5">
            {entries.map((e) => (
              <li key={e.created_at} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="text-xs font-medium text-foreground">{STATUS_LABEL[e.status]}</span>
                  <span className="text-[11px] text-muted-foreground">{fmtDateTimeDe(e.created_at)} · {e.author}</span>
                </div>
                {e.note && <p className="mt-1 text-xs text-muted-foreground leading-snug">{e.note}</p>}
                <p className="mt-1.5 text-[10px] text-muted-foreground/60">
                  Bezog sich auf Score {fmtScore(e.score_at_decision)} · Stand {fmtPeriod(e.period)} ·
                  Modell {e.model_version} · berechnet {fmtDateTimeDe(e.computed_at)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
