import { useMemo, useState } from "react";
import { useJanaCalls, useJanaCall } from "@/hooks/use-api";
import { SectionCard, Chip, EmptyState, Dot } from "@/components/ue/primitives";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PhoneCall, PhoneIncoming, PhoneOutgoing, CalendarClock, AlertTriangle,
  ChevronDown, ChevronRight, Search, ListChecks,
} from "lucide-react";

/* Anrufverlauf — Unterseite von „Verlauf" (/audit?tab=anrufe).
 *
 * Quelle ist EIN Endpunkt, der zwei Tabellen verbindet: die Gespraechs-
 * auswertung aus voice.voice_calls (kommt nach jedem Anruf automatisch von Vapi)
 * und, falls vorhanden, outcome/notes/new_date aus governance.jana_calls.
 * Das Backend entscheidet den Vorrang — die Console uebersetzt nur.
 *
 * Grundregeln wie im E-Mail-Verlauf: Fehler != leer, nichts erfinden. Ein
 * Gespraech ohne Auswertung sagt „noch nicht ausgewertet" statt eine leere
 * Zelle zu zeigen, die wie „nichts vereinbart" aussieht.
 */

const ERGEBNIS_LABEL: Record<string, string> = {
  termin_vereinbart: "Termin vereinbart",
  rueckruf_gewuenscht: "Rückruf gewünscht",
  auskunft_erteilt: "Auskunft erteilt",
  notfall_weitergeleitet: "Notfall weitergeleitet",
  anliegen_aufgenommen: "Anliegen aufgenommen",
  kein_anliegen: "Kein Anliegen",
  falsch_verbunden: "Falsch verbunden",
};

/* Farbe folgt der Bedeutung, nicht der Laune: alles, was jemanden zum Handeln
   zwingt, ist warm; erledigte Auskuenfte sind ruhig. */
const ERGEBNIS_TON: Record<string, "emerald" | "amber" | "danger" | "muted"> = {
  termin_vereinbart: "emerald",
  auskunft_erteilt: "emerald",
  rueckruf_gewuenscht: "amber",
  anliegen_aufgenommen: "amber",
  notfall_weitergeleitet: "danger",
  kein_anliegen: "muted",
  falsch_verbunden: "muted",
};

const FILTER: { key: string; label: string }[] = [
  { key: "", label: "Alle" },
  { key: "termin_vereinbart", label: "Termin" },
  { key: "rueckruf_gewuenscht", label: "Rückruf" },
  { key: "notfall_weitergeleitet", label: "Notfall" },
  { key: "auskunft_erteilt", label: "Auskunft" },
];

const SEITE = 25;

function zeit(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function dauer(s: number | null): string {
  if (s == null || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")} min` : `${r} s`;
}

function Detail({ callId }: { callId: string }) {
  const { data, isLoading, isError, refetch, isFetching } = useJanaCall(callId);
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (isError) {
    return (
      <QueryErrorNotice
        label="Das Gespräch konnte nicht geladen werden."
        onRetry={() => { void refetch(); }}
        retrying={isFetching}
      />
    );
  }
  const a = data?.anruf;
  if (!a) return null;

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        {a.zusammenfassung && (
          <div className="sm:col-span-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Zusammenfassung</div>
            <p className="leading-relaxed">{a.zusammenfassung}</p>
          </div>
        )}
        {a.bezug && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Bezug</div>
            <p>{a.bezug}</p>
          </div>
        )}
        {a.rufnummer && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Rufnummer</div>
            <p>{a.rufnummer}</p>
          </div>
        )}
        {a.dringlichkeit && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Dringlichkeit</div>
            <p className="capitalize">{a.dringlichkeit}</p>
          </div>
        )}
        {a.ende_grund && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Gesprächsende</div>
            <p>{a.ende_grund}</p>
          </div>
        )}
      </div>

      {a.offene_aufgabe && (
        <div className="rounded-md border border-p1/30 bg-p1/5 px-3 py-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-1">
            <ListChecks className="h-3.5 w-3.5" /> Offen
          </div>
          <p>{a.offene_aufgabe}</p>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Gesprächsverlauf</div>
        {a.transkript
          ? <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs leading-relaxed max-h-96 overflow-auto">{a.transkript}</pre>
          : <p className="text-muted-foreground">Für dieses Gespräch liegt kein Transkript vor.</p>}
      </div>
    </div>
  );
}

export function AnrufVerlaufTab() {
  const [ergebnis, setErgebnis] = useState("");
  const [nurNotfall, setNurNotfall] = useState(false);
  const [suche, setSuche] = useState("");
  const [sucheAktiv, setSucheAktiv] = useState("");
  const [offset, setOffset] = useState(0);
  const [offen, setOffen] = useState<string | null>(null);

  const params = useMemo(
    () => ({ limit: SEITE, offset, ergebnis: ergebnis || undefined, notfall: nurNotfall || undefined, q: sucheAktiv || undefined }),
    [offset, ergebnis, nurNotfall, sucheAktiv],
  );
  const { data, isLoading, isError, refetch, isFetching } = useJanaCalls(params);

  const anrufe = data?.anrufe ?? [];
  const total = data?.total ?? 0;

  const filterSetzen = (k: string) => { setErgebnis(k); setOffset(0); setOffen(null); };

  return (
    <div className="space-y-4">
      {/* Filterzeile */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTER.map((f) => (
          <Chip key={f.key || "alle"} active={ergebnis === f.key} onClick={() => filterSetzen(f.key)}>
            {f.label}
          </Chip>
        ))}
        <Chip active={nurNotfall} onClick={() => { setNurNotfall(!nurNotfall); setOffset(0); }}>
          Nur Notfälle
        </Chip>

        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); setSucheAktiv(suche.trim()); setOffset(0); setOffen(null); }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Anliegen, Name, Transkript …"
              aria-label="Anrufe durchsuchen"
              className="h-9 w-56 rounded-md border border-border bg-background pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">Suchen</Button>
          {sucheAktiv && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSuche(""); setSucheAktiv(""); setOffset(0); }}>
              Zurücksetzen
            </Button>
          )}
        </form>
      </div>

      {isError && (
        <QueryErrorNotice
          label="Der Anrufverlauf konnte nicht geladen werden."
          onRetry={() => { void refetch(); }}
          retrying={isFetching}
        />
      )}

      <SectionCard
        title="Anrufe"
        subtitle={
          isLoading ? "wird geladen …"
            : total === 0 ? "Noch keine Gespräche erfasst."
            : `${total} ${total === 1 ? "Gespräch" : "Gespräche"}${data?.notfaelle ? ` · ${data.notfaelle} als Notfall` : ""}${data?.offen ? ` · ${data.offen} mit offener Aufgabe` : ""}`
        }
      >
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !isError && anrufe.length === 0 ? (
          <EmptyState
            icon={<PhoneCall className="h-5 w-5" />}
            title={sucheAktiv || ergebnis || nurNotfall ? "Kein Gespräch passt zu diesem Filter." : "Noch keine Gespräche."}
            description={
              sucheAktiv || ergebnis || nurNotfall
                ? "Filter zurücksetzen, um alle Gespräche zu sehen."
                : "Sobald jemand den Telefon-Assistenten anruft, steht das Gespräch hier — mit Ergebnis, Notiz und vereinbartem Termin."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 py-2" />
                  <th className="py-2 pr-3 font-medium">Zeitpunkt</th>
                  <th className="py-2 pr-3 font-medium">Anrufer</th>
                  <th className="py-2 pr-3 font-medium">Ergebnis</th>
                  <th className="py-2 pr-3 font-medium">Termin</th>
                  <th className="py-2 pr-3 font-medium">Notiz</th>
                  <th className="py-2 pr-3 font-medium text-right">Dauer</th>
                </tr>
              </thead>
              <tbody>
                {anrufe.map((a) => {
                  const auf = offen === a.call_id;
                  const ton = a.ergebnis ? (ERGEBNIS_TON[a.ergebnis] ?? "muted") : "muted";
                  return (
                    <>
                      <tr
                        key={a.call_id}
                        className={cn(
                          "border-b border-border/60 align-top transition-colors hover:bg-muted/40 cursor-pointer",
                          auf && "bg-muted/30",
                        )}
                        onClick={() => setOffen(auf ? null : a.call_id)}
                      >
                        <td className="py-2.5 text-muted-foreground">
                          {auf ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {a.richtung === "outbound"
                              ? <PhoneOutgoing className="h-3.5 w-3.5 text-muted-foreground" />
                              : <PhoneIncoming className="h-3.5 w-3.5 text-muted-foreground" />}
                            {zeit(a.beginn)}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div>{a.kontakt_name || "—"}</div>
                          {a.rufnummer && <div className="text-xs text-muted-foreground">{a.rufnummer}</div>}
                        </td>
                        <td className="py-2.5 pr-3">
                          {a.ergebnis ? (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                              <Dot tone={ton} />
                              {ERGEBNIS_LABEL[a.ergebnis] ?? a.ergebnis}
                              {a.notfall && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {a.ausgewertet ? "—" : "noch nicht ausgewertet"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          {a.termin ? (
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarClock className="h-3.5 w-3.5 text-primary" />
                              {a.termin}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2.5 pr-3 max-w-md">
                          <span className="line-clamp-2">{a.notiz || <span className="text-muted-foreground">—</span>}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right whitespace-nowrap text-muted-foreground">{dauer(a.dauer_sekunden)}</td>
                      </tr>
                      {auf && (
                        <tr key={`${a.call_id}-detail`} className="border-b border-border/60 bg-muted/20">
                          <td />
                          <td colSpan={6} className="py-3 pr-3">
                            <Detail callId={a.call_id} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(offset > 0 || data?.hat_mehr) && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline" size="sm"
              disabled={offset === 0 || isFetching}
              onClick={() => { setOffset(Math.max(0, offset - SEITE)); setOffen(null); }}
            >
              Zurück
            </Button>
            <span className="text-xs text-muted-foreground">
              {offset + 1}–{Math.min(offset + SEITE, total)} von {total}
            </span>
            <Button
              variant="outline" size="sm"
              disabled={!data?.hat_mehr || isFetching}
              onClick={() => { setOffset(offset + SEITE); setOffen(null); }}
            >
              Weiter
            </Button>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default AnrufVerlaufTab;
