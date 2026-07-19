import { useEffect, useState } from "react";
import { Check, Lock } from "lucide-react";
import { fmtDateTimeDe } from "../format";
import { canWriteDecisionNote, getRiskSession } from "../session";
import type { DecisionNote, DecisionStatus } from "../types";

/**
 * Block 6 - Entscheidungsvermerk. Bleibt beim Kunden, geht in dessen
 * Audit-Trail, ist NICHT Teil unseres Modells und fliesst nie in einen Score.
 *
 * Der API-Contract hat dafuer bisher keinen Endpunkt (siehe STATUS.md, Fund B-2).
 * Bis dahin lokal im Browser, damit der Ablauf vorfuehrbar ist - der Speicherort
 * ist die einzige Stelle, die spaeter getauscht wird.
 */
const STATUS_LABEL: Record<DecisionStatus, string> = {
  limit_erhoeht: "Limit erhoeht",
  limit_gehalten: "Limit gehalten",
  limit_gesenkt: "Limit gesenkt",
  abgelehnt: "Abgelehnt",
  eskaliert: "Eskaliert",
};
const STATUS_ORDER: DecisionStatus[] = ["limit_erhoeht", "limit_gehalten", "limit_gesenkt", "abgelehnt", "eskaliert"];
const KEY = (id: string) => `ue_risk_decision_${id}`;

export function DecisionNoteBlock({ accountId }: { accountId: string }) {
  const session = getRiskSession();
  const mayWrite = canWriteDecisionNote(session.role);
  const [status, setStatus] = useState<DecisionStatus>("limit_gehalten");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<DecisionNote | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY(accountId));
      if (raw) { const d = JSON.parse(raw) as DecisionNote; setSaved(d); setStatus(d.status); setNote(d.note); }
      else { setSaved(null); setNote(""); setStatus("limit_gehalten"); }
    } catch { /* ignore */ }
  }, [accountId]);

  const save = () => {
    const entry: DecisionNote = {
      account_id: accountId, status, note: note.trim(),
      author: session.role, created_at: new Date().toISOString(),
    };
    try { window.localStorage.setItem(KEY(accountId), JSON.stringify(entry)); } catch { /* ignore */ }
    setSaved(entry); setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2500);
  };

  if (!mayWrite) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Lock className="w-4 h-4 shrink-0" />
        Ihre Rolle ({session.role}) darf Entscheidungsvermerke lesen, aber nicht schreiben.
      </p>
    );
  }

  return (
    <div>
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
        <p className="text-[11px] text-muted-foreground/70">
          Der Vermerk bleibt in Ihrem Haus. Er wird nicht an UseEasy uebertragen und
          fliesst in keinen Score ein.
        </p>
        <div className="flex items-center gap-3">
          {justSaved && (
            <span className="text-xs text-primary flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> gespeichert
            </span>
          )}
          <button type="button" onClick={save}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            Vermerk speichern
          </button>
        </div>
      </div>

      {saved && (
        <p className="mt-3 pt-3 border-t border-border/60 text-[11px] text-muted-foreground">
          Zuletzt: <span className="text-foreground/80">{STATUS_LABEL[saved.status]}</span>
          {" · "}{fmtDateTimeDe(saved.created_at)}{" · "}{saved.author}
        </p>
      )}
    </div>
  );
}
