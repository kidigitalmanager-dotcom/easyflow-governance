/**
 * EmailAutopilotAuditView — Audit-Trail für governance.autopilot_log.
 * Backend: GET /v1/dashboard/autopilot/log
 *
 * 2026-07-29 (Frontend-Befund 2): diese Ansicht war für einen Kunden nicht
 * lesbar. Sie zeigte pro Zeile die rohe Draft-UUID in Monospace und darunter
 * ein aufgeklapptes `JSON.stringify(row.reasons, null, 2)` — also den
 * Innenraum der Engine, samt englischer Entwickler-Sätze wie
 * "confidence=0.812 < threshold=0.900 for request_order".
 *
 * Ein Audit-Trail muss die Frage beantworten "warum hat UseEasy diese Mail
 * nicht selbst beantwortet?" — in einem Satz, auf Deutsch. Der technische
 * Rohtext bleibt erreichbar (Support braucht ihn), aber zugeklappt und
 * ausdrücklich als technisch beschriftet.
 */
import { useState } from "react";
import { Inbox, ChevronDown } from "lucide-react";
import { useAutopilotLog } from "@/hooks/use-api";
import type { AutopilotLogRow } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ── Entscheidungen ─────────────────────────────────────────────────────────
   Vollständig gegen die Schreiber abgeglichen (29.07.2026):
   autopilot_engine.js  -> logAutopilot(decision) und elig.primary_reason
   autopilot-sender     -> _markSent / _markHeld / _markDeferred / _markFallbackHuman
   Fehlt ein Code, fällt die Zeile auf den Rohwert zurück — sichtbar, aber nie
   leer. Lieber ein unbekannter Code als eine erfundene Erklärung. */
type Tone = "ok" | "warn" | "bad" | "neutral";

const DECISION: Record<string, { label: string; tone: Tone; erklaerung: string }> = {
  // — tatsächlich versendet —
  sent: {
    label: "Gesendet",
    tone: "ok",
    erklaerung: "Die Antwort ist rausgegangen. Sie liegt im Ordner „Gesendet“ des Postfachs.",
  },
  queued_for_send: {
    label: "Zum Senden eingereiht",
    tone: "ok",
    erklaerung: "Alle Prüfungen bestanden. Der Entwurf wartet auf das nächste Sende-Fenster.",
  },

  // — Schatten-Modus: UseEasy rechnet mit, sendet aber nichts —
  shadow_would_send: {
    label: "Probelauf: hätte gesendet",
    tone: "neutral",
    erklaerung: "Im Probelauf. UseEasy hätte diese Antwort selbst verschickt, hat es aber nicht getan.",
  },
  shadow_would_qualify: {
    label: "Probelauf: wäre geeignet",
    tone: "neutral",
    erklaerung: "Im Probelauf. Der Fall wäre geeignet gewesen, es lag nur noch kein Entwurf vor.",
  },
  shadow_would_hold: {
    label: "Probelauf: hätte zurückgehalten",
    tone: "neutral",
    erklaerung: "Im Probelauf. UseEasy hätte diese Antwort Ihnen vorgelegt statt sie zu senden.",
  },

  // — vom Betreiber oder vom Tarif gestoppt —
  held_disabled: {
    label: "Autopilot aus",
    tone: "neutral",
    erklaerung: "Der Autopilot ist für Ihren Betrieb ausgeschaltet. Der Entwurf wartet auf Ihre Freigabe.",
  },
  held_no_policy: {
    label: "Noch nicht eingerichtet",
    tone: "neutral",
    erklaerung: "Für Ihren Betrieb sind noch keine Autopilot-Regeln hinterlegt. Bis dahin sendet UseEasy nichts.",
  },
  killed: {
    label: "Not-Aus gezogen",
    tone: "bad",
    erklaerung: "Der Not-Aus-Schalter steht auf aus. Solange er gezogen ist, sendet UseEasy nichts.",
  },
  held_kill_switch: {
    label: "Not-Aus gezogen",
    tone: "bad",
    erklaerung: "Der Not-Aus-Schalter steht auf aus. Solange er gezogen ist, sendet UseEasy nichts.",
  },
  tenant_paused: {
    label: "Vorübergehend pausiert",
    tone: "warn",
    erklaerung: "Der Versand ist befristet angehalten. Danach läuft er von selbst weiter.",
  },
  held_daily_cap: {
    label: "Tagesmenge erreicht",
    tone: "warn",
    erklaerung: "Die für heute vereinbarte Höchstmenge ist erreicht. Weitere Antworten legt UseEasy Ihnen vor.",
  },
  deferred_send_window: {
    label: "Wartet auf das Sende-Fenster",
    tone: "warn",
    erklaerung: "Der Anbieter des Postfachs lässt gerade keine weiteren Mails zu. UseEasy wartet ab, statt das Limit zu reißen.",
  },

  // — inhaltliche Gründe —
  held_low_conf: {
    label: "Zu unsicher",
    tone: "warn",
    erklaerung: "UseEasy war sich bei diesem Fall nicht sicher genug und hat ihn Ihnen vorgelegt.",
  },
  held_no_confidence: {
    label: "Keine Einschätzung",
    tone: "warn",
    erklaerung: "Zu dieser Mail lag keine belastbare Einschätzung vor. Ohne die sendet UseEasy nichts.",
  },
  held_no_threshold: {
    label: "Keine Schwelle hinterlegt",
    tone: "warn",
    erklaerung: "Für diese Art von Anliegen ist keine Sicherheitsschwelle festgelegt. Ohne die sendet UseEasy nichts.",
  },
  held_risk_flag: {
    label: "Heikler Inhalt",
    tone: "bad",
    erklaerung: "Die Mail enthält etwas, das nie automatisch beantwortet wird. Sie geht immer an einen Menschen.",
  },
  held_not_whitelisted: {
    label: "Art nicht freigegeben",
    tone: "neutral",
    erklaerung: "Diese Art von Anliegen haben Sie nicht für den Autopilot freigegeben.",
  },
  held_hard_block_intent: {
    label: "Dauerhaft gesperrte Art",
    tone: "bad",
    erklaerung: "Diese Art von Anliegen ist im Code gesperrt und kann auch nicht freigeschaltet werden.",
  },
  held_hard_block_action_type: {
    label: "Dauerhaft gesperrte Aktion",
    tone: "bad",
    erklaerung: "Diese Aktion darf UseEasy grundsätzlich nicht selbst ausführen.",
  },
  held_unknown_action_type: {
    label: "Unbekannte Aktion",
    tone: "bad",
    erklaerung: "Eine Aktion, die UseEasy nicht kennt. Im Zweifel wird nichts gesendet.",
  },
  not_implemented_yet: {
    label: "Noch nicht verfügbar",
    tone: "neutral",
    erklaerung: "Diese Aktion ist vorgesehen, aber noch nicht freigeschaltet.",
  },
  held_no_core_key: {
    label: "Anliegen nicht eingeordnet",
    tone: "warn",
    erklaerung: "Die Mail ließ sich keiner Kategorie zuordnen. Unsortiertes sendet UseEasy nie selbst.",
  },
  held_no_need_reply: {
    label: "Keine Antwort nötig",
    tone: "neutral",
    erklaerung: "Diese Mail brauchte aus Sicht von UseEasy keine Antwort.",
  },
  held_need_reply_fallback: {
    label: "Antwortbedarf nur geraten",
    tone: "warn",
    erklaerung: "Ob eine Antwort nötig ist, war nur eine Notannahme. Darauf sendet UseEasy nicht automatisch.",
  },
  held_legal_basis: {
    label: "Rechtsgrundlage unklar",
    tone: "bad",
    erklaerung: "Die Rechtsgrundlage für eine automatische Antwort war nicht eindeutig.",
  },
  held_no_body: {
    label: "Entwurf leer",
    tone: "warn",
    erklaerung: "Es gab keinen brauchbaren Entwurfstext zum Senden.",
  },
  held_body_too_short: {
    label: "Entwurf zu kurz",
    tone: "warn",
    erklaerung: "Der Entwurf war zu kurz, um ihn ungelesen zu verschicken.",
  },

  // — Reifegrad —
  held_no_maturity: {
    label: "Noch nicht eingespielt",
    tone: "neutral",
    erklaerung: "UseEasy hat für diese Art von Anliegen noch zu wenig mitgelaufene Fälle gesehen.",
  },
  held_high_mismatch: {
    label: "Probelauf weicht zu oft ab",
    tone: "warn",
    erklaerung: "Im Probelauf lag UseEasy zu oft anders als Sie. Bis das besser wird, sendet es nicht selbst.",
  },
  held_high_edit_rate: {
    label: "Entwürfe werden zu oft geändert",
    tone: "warn",
    erklaerung: "Sie ändern die Entwürfe noch häufig. Bis das seltener wird, sendet UseEasy nicht selbst.",
  },

  // — Fehler beim Senden —
  send_failed_fallback_human: {
    label: "Versand fehlgeschlagen",
    tone: "bad",
    erklaerung: "Der Versand hat nicht geklappt. Der Entwurf liegt wieder bei Ihnen zur Freigabe.",
  },
  held_unknown: {
    label: "Zurückgehalten",
    tone: "warn",
    erklaerung: "UseEasy hat den Entwurf zurückgehalten, ohne einen eindeutigen Grund nennen zu können.",
  },
};

/* Filter-Auswahl: bewusst nicht alle 25 Codes, sondern die, nach denen man
   wirklich sucht. Der Rest bleibt über „Alle“ erreichbar. */
const FILTER_CHOICES = [
  "sent",
  "queued_for_send",
  "deferred_send_window",
  "send_failed_fallback_human",
  "held_low_conf",
  "held_risk_flag",
  "held_not_whitelisted",
  "held_daily_cap",
  "held_disabled",
  "killed",
  "shadow_would_send",
  "shadow_would_hold",
];

/* ── Gründe ────────────────────────────────────────────────────────────────
   reasons[] ist Array<{ code, msg? , ... }>. `msg` ist englischer
   Entwickler-Text mit Rohwerten und gehört NICHT vor den Kunden. Wir zeigen
   den deutschen Satz zum Code; nur wenn ein Code unbekannt ist, fällt die
   Zeile auf den Code zurück (nie auf msg). */
const REASON: Record<string, string> = {
  // Sender-Codes
  "policy.enabled=false": "Autopilot war ausgeschaltet.",
  "kill_switch=true": "Der Not-Aus-Schalter war gezogen.",
  tenant_paused: "Der Versand war vorübergehend angehalten.",
  daily_cap_reached: "Die Tagesmenge war ausgeschöpft.",
  send_window_reached: "Das Sende-Fenster des Anbieters war ausgeschöpft.",
  send_failed: "Der Versand ist mit einem Fehler abgebrochen.",
  sent: "Erfolgreich versendet.",
};

function reasonText(code: string): string {
  if (REASON[code]) return REASON[code];
  if (DECISION[code]) return DECISION[code].erklaerung;
  return code; // unbekannt: roh zeigen statt schweigen
}

const TONE_CLASS: Record<Tone, string> = {
  ok: "border-emerald/30 bg-emerald-surface text-emerald-light",
  warn: "border-amber/30 bg-amber-surface text-amber",
  bad: "border-destructive/35 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted/50 text-muted-foreground",
};

const DOT_CLASS: Record<Tone, string> = {
  ok: "bg-emerald",
  warn: "bg-amber",
  bad: "bg-destructive",
  neutral: "bg-muted-foreground/50",
};

function zeitpunkt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/* Anliegen-Kategorien in Klartext — dieselben Bezeichnungen wie im Rest der
   Console, damit „core_key“ nirgends roh auftaucht. */
const CORE_KEY_LABEL: Record<string, string> = {
  request_order: "Anfrage & Auftrag",
  support_issue: "Support & Störung",
  status_fulfillment: "Status & Abwicklung",
  returns_refund: "Rückgabe & Erstattung",
  billing_payment: "Rechnung & Zahlung",
  contract_legal: "Vertrag & Recht",
  manual_review: "Manuelle Prüfung",
};

function AuditRow({ row }: { row: AutopilotLogRow }) {
  const [technik, setTechnik] = useState(false);
  const d = DECISION[row.decision];
  const tone: Tone = d?.tone ?? "neutral";
  const gruende = Array.isArray(row.reasons)
    ? (row.reasons as Array<{ code?: unknown }>)
        .map((r) => (r && typeof r.code === "string" ? r.code : ""))
        .filter(Boolean)
    : [];
  /* Im Probelauf beschreibt die Entscheidung nur den MODUS ("hätte
     zurückgehalten") — der eigentliche Grund steht dann ausschließlich in
     reasons[]. Überall sonst setzt die Engine decision = primary_reason, also
     ist reasons[0] die maschinenlesbare Zwillingsform der Überschrift und
     würde denselben Satz ein zweites Mal zeigen. */
  const istProbelauf = row.decision.startsWith("shadow_");
  const weitere = istProbelauf ? gruende : gruende.slice(1);

  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-3.5">
      <div className="flex items-start gap-2.5">
        <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[tone]}`} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${TONE_CLASS[tone]}`}>
              {d?.label ?? row.decision}
            </span>
            {row.core_key && (
              <span className="text-[12px] text-muted-foreground">
                {CORE_KEY_LABEL[row.core_key] ?? row.core_key}
              </span>
            )}
            <span className="text-[11.5px] text-muted-foreground">{zeitpunkt(row.created_at)}</span>
          </div>

          <p className="text-[13px] leading-relaxed">
            {d?.erklaerung ?? "Für diese Entscheidung liegt noch keine Erklärung in der Console vor."}
          </p>

          {weitere.length > 0 && (
            <ul className="space-y-0.5 pt-0.5">
              {weitere.map((code, i) => (
                <li key={`${code}-${i}`} className="text-[12px] text-muted-foreground">
                  {reasonText(code)}
                </li>
              ))}
            </ul>
          )}

          {row.cooldown_until && (
            <p className="text-[12px] text-muted-foreground">
              Nächster Versuch ab {zeitpunkt(row.cooldown_until)}.
            </p>
          )}

          <button
            type="button"
            onClick={() => setTechnik((v) => !v)}
            className="inline-flex items-center gap-1 pt-0.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={technik}
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${technik ? "rotate-180" : ""}`} />
            Technische Angaben {technik ? "ausblenden" : "einblenden"}
          </button>
          {technik && (
            <dl className="mt-1.5 space-y-1 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[11.5px]">
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-muted-foreground">Entscheidung</dt>
                <dd className="break-all">{row.decision}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-muted-foreground">Entwurf</dt>
                <dd className="break-all">{row.draft_id}</dd>
              </div>
              {row.event_id && (
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-muted-foreground">Vorgang</dt>
                  <dd className="break-all">{row.event_id}</dd>
                </div>
              )}
              {row.confidence != null && (
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-muted-foreground">Sicherheit</dt>
                  <dd>{Math.round(Number(row.confidence) * 100)} Prozent</dd>
                </div>
              )}
              {gruende.length > 0 && (
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-muted-foreground">Prüf-Codes</dt>
                  <dd className="break-all">{gruende.join(", ")}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmailAutopilotAuditView() {
  const [decision, setDecision] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const { data, isLoading } = useAutopilotLog({ decision: decision || undefined, limit, offset });

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold">Autopilot Audit-Trail</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Jede Entscheidung des Autopiloten, mit Begründung. Nichts wird gesendet, was hier nicht steht.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={decision || "__all__"} onValueChange={(v) => { setDecision(v === "__all__" ? "" : v); setOffset(0); }}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Alle Entscheidungen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle</SelectItem>
              {FILTER_CHOICES.map((k) => (
                <SelectItem key={k} value={k}>{DECISION[k]?.label ?? k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data && (
            <span className="text-sm text-muted-foreground">
              {data.pagination.total} {data.pagination.total === 1 ? "Eintrag" : "Einträge"}
            </span>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-[var(--radius)]" />
          ))}
        </div>
      )}
      {data?.rows.length === 0 && (
        <div className="glass-card p-12 text-center">
          <Inbox className="w-10 h-10 text-primary mx-auto mb-3" />
          <p className="text-lg font-medium">Noch keine Autopilot-Entscheidungen</p>
          <p className="text-sm text-muted-foreground mt-1">
            Sobald die erste E-Mail im Schatten-Modus eingeht, erscheinen die Entscheidungen hier
            — für diesen Filter ist noch nichts protokolliert.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {data?.rows.map((row) => <AuditRow key={row.id} row={row} />)}
      </div>

      {data && data.pagination.has_more && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setOffset(offset + limit)}>Mehr laden</Button>
        </div>
      )}
    </div>
  );
}
