// -----------------------------------------------------------------------------
// FaelleTab.tsx — Schnitt B: der Fall in der Konsole.
//
// Quelle sind governance.case_state plus governance.copilot_lead_status_history
// (Backend /v1/dashboard/leads/cases), NICHT jana_calls oder voice_calls — das
// ist Jana, der KI-Telefonassistent, und dort steht kein Co-Pilot-Anruf drin.
//
// Zwei Regeln, die diese Ansicht traegt:
//  1. Eine leere Liste sagt, OB sie leer oder kaputt ist. "Es gibt nichts" und
//     "ich konnte nicht lesen" duerfen nicht derselbe Anblick sein.
//  2. Der Status wird nie direkt geschrieben, sondern ueber patch_lead_status
//     in leads-sync — derselbe Weg wie ein Klick im Co-Piloten, also dieselbe
//     Historienzeile, derselbe HubSpot-Push, derselbe Schleifenschutz.
// -----------------------------------------------------------------------------
import { useState } from "react";
import { useCopilotCases, useCopilotCase, useSetLeadStatus } from "@/hooks/use-api";
import type { CopilotCase } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import {
  Search, ChevronLeft, ChevronRight, CalendarClock, AlertTriangle, Building2, X,
} from "lucide-react";

const PER_PAGE = 25;

const STATUS_META: Record<string, { label: string; cls: string }> = {
  offen:          { label: "Offen",          cls: "text-muted-foreground bg-muted border-border" },
  angerufen:      { label: "Angerufen",      cls: "text-sky-400 bg-sky-400/10 border-sky-400/20" },
  termin:         { label: "Termin",         cls: "text-green-500 bg-green-500/10 border-green-500/20" },
  rueckruf:       { label: "Rückruf",        cls: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  spaeter:        { label: "Später",         cls: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  mailbox:        { label: "Mailbox",        cls: "text-muted-foreground bg-muted border-border" },
  abgesagt:       { label: "Abgesagt",       cls: "text-red-400 bg-red-400/10 border-red-400/20" },
  kein_interesse: { label: "Kein Interesse", cls: "text-red-400 bg-red-400/10 border-red-400/20" },
  falsche_nummer: { label: "Falsche Nummer", cls: "text-red-400 bg-red-400/10 border-red-400/20" },
};
/** Reihenfolge der Knoepfe im Detail — dieselben Werte, die leads-sync erlaubt. */
const STATUS_WAHL = [
  "angerufen", "termin", "rueckruf", "spaeter", "mailbox",
  "kein_interesse", "falsche_nummer", "abgesagt", "offen",
];

const HERKUNFT_TEXT: Record<string, string> = {
  copilot: "Co-Pilot",
  console: "Konsole",
  webhook: "aus HubSpot",
  manual: "ohne Angabe",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const m = STATUS_META[status] ?? { label: status, cls: "text-muted-foreground bg-muted border-border" };
  return (
    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border ${m.cls}`}>
      {m.label}
    </span>
  );
}

function zeit(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
function tag(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Detail eines Falls: Zustand, Zeitleiste, Status setzen. */
function FallDetail({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { data, isLoading, isError, refetch, isFetching } = useCopilotCase(leadId);
  const setStatus = useSetLeadStatus();
  const [notiz, setNotiz] = useState("");
  const [rueckmeldung, setRueckmeldung] = useState<{ ton: "ok" | "info" | "fehler"; text: string } | null>(null);
  /** Fuer den Wiederholversuch: derselbe Schluessel erzeugt keine zweite Zeile. */
  const [letzteRequestId, setLetzteRequestId] = useState<string | null>(null);

  if (isLoading) return <div className="p-4"><Skeleton className="h-24 w-full" /></div>;
  if (isError || !data?.ok) {
    return (
      <div className="p-4">
        <QueryErrorNotice
          label="Der Fall konnte nicht geladen werden."
          onRetry={() => { void refetch(); }}
          retrying={isFetching}
        />
      </div>
    );
  }

  const f = data.fall;
  const aendern = (neu: string) => {
    setRueckmeldung(null);
    setStatus.mutate(
      {
        leadId,
        payload: {
          status: neu,
          previous_status: f.status,
          notes: notiz.trim() || null,
          vertriebler_id: data.sicht.rep_id,
          vertriebler_name: data.sicht.name,
          request_id: letzteRequestId,
        },
      },
      {
        onSuccess: (r) => {
          setLetzteRequestId(r.request_id ?? null);
          if (r.duplicate) setRueckmeldung({ ton: "info", text: "War schon so — es wurde nichts doppelt eingetragen." });
          else if (r.ok === false) setRueckmeldung({ ton: "fehler", text: `Nicht gespeichert: ${r.error ?? "unbekannter Grund"}` });
          else { setNotiz(""); setLetzteRequestId(null); setRueckmeldung({ ton: "ok", text: "Gespeichert. Der Co-Pilot und HubSpot sehen den neuen Stand." }); }
        },
        onError: (e: unknown) => setRueckmeldung({
          ton: "fehler",
          text: `Nicht gespeichert: ${e instanceof Error ? e.message : "Verbindung fehlgeschlagen"}. Nochmal versuchen ist gefahrlos.`,
        }),
      },
    );
  };

  return (
    <div className="border-t border-border/60 bg-muted/20 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{f.firma ?? f.lead_id}</p>
          <p className="text-xs text-muted-foreground">
            {[f.ansprechpartner, f.telefon, f.ort, f.email].filter(Boolean).join(" · ") || "Keine Stammdaten hinterlegt."}
          </p>
          {f.list_name && <p className="text-[11px] text-muted-foreground">Aus Liste: {f.list_name}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      {data.stammdaten === "nicht_erreichbar" && (
        <p className="text-[11.5px] text-amber-400">
          Die Stammdaten konnten nicht geladen werden — Firma und Telefonnummer fehlen deshalb, der Fall selbst stimmt.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass-card p-3">
          <p className="text-[11px] text-muted-foreground">Aktueller Status</p>
          <div className="mt-1"><StatusBadge status={f.status} /></div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {zeit(f.status_am)} · {HERKUNFT_TEXT[f.herkunft ?? ""] ?? f.herkunft ?? "—"}
          </p>
        </div>
        <div className="glass-card p-3">
          <p className="text-[11px] text-muted-foreground">Termin</p>
          <p className="mt-1 text-[13px]">{f.termin_am ? zeit(f.termin_am) : "kein Termin am Fall"}</p>
          {f.termin_link && (
            <a href={f.termin_link} target="_blank" rel="noreferrer" className="text-[11px] text-primary">Meeting öffnen</a>
          )}
        </div>
        <div className="glass-card p-3">
          <p className="text-[11px] text-muted-foreground">Zusage und Frist</p>
          <p className="mt-1 text-[13px]">
            {f.zusage_am ? `${f.zusage_art === "termin" ? "Termin" : "Zusage"} zum ${tag(f.zusage_am)}` : "keine Zusage"}
          </p>
          <p className="text-[11px] text-muted-foreground">{f.frist_am ? `Frist: ${tag(f.frist_am)}` : "keine offene Frist"}</p>
        </div>
      </div>

      {/* ── Zeitleiste: append-only, also echte Historie ─────────────────── */}
      <div>
        <p className="ue-kicker mb-2">Verlauf</p>
        {data.verlauf_stand === "lesefehler" ? (
          <p className="text-[11.5px] text-amber-400">
            Der Verlauf konnte nicht gelesen werden. Das heisst nicht, dass es keinen gibt.
          </p>
        ) : data.verlauf.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground">Noch kein Eintrag.</p>
        ) : (
          <ol className="space-y-1.5">
            {data.verlauf.slice().reverse().map((v) => (
              <li key={String(v.id)} className="flex flex-wrap items-center gap-2 text-[11.5px]">
                <span className="text-muted-foreground tabular-nums">{zeit(v.erstellt_am)}</span>
                {v.vorher && <><StatusBadge status={v.vorher} /><span className="text-muted-foreground">→</span></>}
                <StatusBadge status={v.status} />
                <span className="text-muted-foreground">
                  {v.vertriebler ?? "—"} · {HERKUNFT_TEXT[v.herkunft ?? ""] ?? v.herkunft ?? "ohne Angabe"}
                </span>
                {v.notiz && <span className="w-full pl-1 text-muted-foreground">„{v.notiz}"</span>}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ── Status setzen ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="ue-kicker">Status ändern</p>
        <textarea
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          placeholder="Notiz zum Gespräch (optional) — sie geht als Notiz mit ins CRM."
          rows={2}
          className="w-full rounded-md border border-border bg-background/60 p-2 text-[12.5px]"
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_WAHL.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === f.status ? "secondary" : "outline"}
              disabled={setStatus.isPending}
              onClick={() => aendern(s)}
            >
              {STATUS_META[s]?.label ?? s}
            </Button>
          ))}
        </div>
        {setStatus.isPending && <p className="text-[11.5px] text-muted-foreground">Wird gespeichert…</p>}
        {rueckmeldung && (
          <p className={
            rueckmeldung.ton === "ok" ? "text-[11.5px] text-green-500"
            : rueckmeldung.ton === "info" ? "text-[11.5px] text-muted-foreground"
            : "text-[11.5px] text-red-400"
          }>
            {rueckmeldung.text}
          </p>
        )}
      </div>
    </div>
  );
}

export default function FaelleTab() {
  const [status, setStatusFilter] = useState("offen");
  const [sicht, setSicht] = useState("alle");
  const [suche, setSuche] = useState("");
  const [sucheAktiv, setSucheAktiv] = useState("");
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [seite, setSeite] = useState(0);
  const [offen, setOffen] = useState<string | null>(null);

  const q = useCopilotCases({
    status, sicht, q: sucheAktiv || undefined,
    von: von || undefined, bis: bis || undefined,
    limit: PER_PAGE, offset: seite * PER_PAGE,
  });

  const d = q.data;
  const faelle: CopilotCase[] = d?.faelle ?? [];
  const gesamt = d?.gesamt ?? 0;
  const rolle = d?.sicht?.rolle;
  const istLeitung = rolle === "leitung";
  const zuruecksetzen = (fn: () => void) => { setSeite(0); setOffen(null); fn(); };

  return (
    <div className="space-y-4">
      <div className="glass-card p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Fälle</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Jeder Lead, an dem gearbeitet wurde — mit Status, Termin, Frist und dem vollen Verlauf.
            </p>
          </div>
          {rolle && (
            <p className="text-[11px] text-muted-foreground">
              {istLeitung
                ? `Sicht: alle Fälle des Betriebs${d?.sicht.rep_id ? ` · dein Konto: ${d.sicht.name ?? d.sicht.rep_id}` : ""}`
                : `Sicht: deine Fälle (${d?.sicht.name ?? d?.sicht.rep_id})`}
            </p>
          )}
        </div>

        {/* Filter */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { k: "offen", t: "Offen" },
            { k: "erledigt", t: "Erledigt" },
            { k: "alle", t: "Alle" },
            { k: "unberuehrt", t: "Noch nicht angefasst" },
          ].map((o) => (
            <Button
              key={o.k}
              size="sm"
              variant={status === o.k ? "secondary" : "outline"}
              onClick={() => zuruecksetzen(() => setStatusFilter(o.k))}
            >
              {o.t}
            </Button>
          ))}
          {istLeitung && (
            <Button
              size="sm"
              variant={sicht === "meine" ? "secondary" : "outline"}
              onClick={() => zuruecksetzen(() => setSicht(sicht === "meine" ? "alle" : "meine"))}
            >
              Nur meine
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") zuruecksetzen(() => setSucheAktiv(suche.trim())); }}
              placeholder="Firma, Ansprechpartner, Ort…"
              className="w-56 rounded-md border border-border bg-background/60 px-2 py-1 text-[12.5px]"
            />
            <Button size="sm" variant="outline" onClick={() => zuruecksetzen(() => setSucheAktiv(suche.trim()))}>Suchen</Button>
            {sucheAktiv && (
              <Button size="sm" variant="ghost" onClick={() => zuruecksetzen(() => { setSuche(""); setSucheAktiv(""); })}>
                zurücksetzen
              </Button>
            )}
          </div>
          <label className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
            von
            <input type="date" value={von} onChange={(e) => zuruecksetzen(() => setVon(e.target.value))}
              className="rounded-md border border-border bg-background/60 px-2 py-1 text-[12px]" />
          </label>
          <label className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
            bis
            <input type="date" value={bis} onChange={(e) => zuruecksetzen(() => setBis(e.target.value))}
              className="rounded-md border border-border bg-background/60 px-2 py-1 text-[12px]" />
          </label>
        </div>
      </div>

      {/* 🔴 Fehler ist NICHT leer: ein Lesefehler bekommt eine eigene Meldung,
          sonst sieht "es gibt nichts" genauso aus wie "ich kam nicht dran". */}
      {q.isError && (
        <QueryErrorNotice
          label="Die Fälle konnten nicht geladen werden."
          onRetry={() => { void q.refetch(); }}
          retrying={q.isFetching}
        />
      )}

      {!q.isError && d?.stammdaten === "nicht_erreichbar" && (
        <p className="text-[11.5px] text-amber-400">
          Die Lead-Stammdaten sind gerade nicht erreichbar — die Fälle stimmen, aber Firma und
          Telefonnummer fehlen in der Liste.
        </p>
      )}
      {d?.hinweis && <p className="text-[11.5px] text-muted-foreground">{d.hinweis}</p>}
      {d?.suche_gekuerzt && (
        <p className="text-[11.5px] text-amber-400">
          Die Suche hatte sehr viele Treffer und wurde gekürzt. Bitte enger suchen.
        </p>
      )}

      <div className="glass-card overflow-hidden">
        {q.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
          </div>
        ) : faelle.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              {q.isError ? "Nicht geladen." :
                status === "unberuehrt" ? "Alle Leads wurden schon angefasst."
                : sucheAktiv ? "Kein Fall passt zu dieser Suche."
                : status === "offen" ? "Kein offener Fall."
                : status === "erledigt" ? "Kein erledigter Fall."
                : "Noch kein Fall — er entsteht beim ersten Statuswechsel im Co-Piloten."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-[12.5px]">
            <thead className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Firma</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Vertriebler</th>
                <th className="px-3 py-2 font-medium">Termin</th>
                <th className="px-3 py-2 font-medium">Frist</th>
              </tr>
            </thead>
            <tbody>
              {faelle.map((f) => {
                const auf = offen === f.lead_id;
                const unberuehrt = status === "unberuehrt";
                return (
                  <tr key={f.lead_id} className="border-b border-border/40 last:border-0 align-top">
                    <td colSpan={auf ? 5 : 1} className={auf ? "p-0" : "px-4 py-2"}>
                      {auf ? (
                        <FallDetail leadId={f.lead_id} onClose={() => setOffen(null)} />
                      ) : (
                        <button
                          type="button"
                          className="text-left hover:text-primary disabled:cursor-default disabled:hover:text-foreground"
                          disabled={unberuehrt}
                          onClick={() => setOffen(f.lead_id)}
                        >
                          <span className="font-medium">{f.firma ?? f.lead_id}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {[f.ansprechpartner, f.ort, f.telefon].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </button>
                      )}
                    </td>
                    {!auf && (
                      <>
                        <td className="px-3 py-2">
                          {unberuehrt ? (
                            <span className="text-[11px] text-muted-foreground">noch nicht angefasst</span>
                          ) : (
                            <>
                              <StatusBadge status={f.status} />
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                {zeit(f.status_am)} · {HERKUNFT_TEXT[f.herkunft ?? ""] ?? f.herkunft ?? "—"}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{f.vertriebler ?? (f.list_name ?? "—")}</td>
                        <td className="px-3 py-2">
                          {f.termin_am
                            ? <span className="inline-flex items-center gap-1 text-green-500"><CalendarClock className="h-3.5 w-3.5" />{zeit(f.termin_am)}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {f.frist_am
                            ? <span className="inline-flex items-center gap-1 text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />{tag(f.frist_am)}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Serverseitig geschnitten: die Seite kommt aus SQL beziehungsweise aus
          leads-sync, nicht aus einer im Browser gefilterten Gesamtliste. */}
      {gesamt > PER_PAGE && (
        <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
          <span>
            {seite * PER_PAGE + 1}–{Math.min((seite + 1) * PER_PAGE, gesamt)} von {gesamt}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={seite === 0}
              onClick={() => { setOffen(null); setSeite((s) => Math.max(0, s - 1)); }}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" disabled={(seite + 1) * PER_PAGE >= gesamt}
              onClick={() => { setOffen(null); setSeite((s) => s + 1); }}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
