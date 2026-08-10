/**
 * CalendarIntegration — Kalender verbinden, Karte im Integrationen-Tab.
 *
 * Zwei Einstiege, EIN Zustand: diese Karte und der Termin-Block unter /voice
 * lesen dieselbe Antwort von `/v1/calendar/readiness` und rufen denselben
 * Endpunkt zum Verbinden. Kein zweiter OAuth-Weg — sonst laufen die beiden
 * auseinander, sobald einer von beiden gepflegt wird.
 *
 * 🔴 Die Lehre vom 29.07. gilt hier woertlich: eine Karte, die einen bereits
 * erreichten Zustand anzeigt, braucht fuer JEDE Aktion eine eigene Rueckmeldung.
 * Sonst sehen "hat geklappt" und "ist kaputt" fuer den Nutzer gleich aus, und
 * genau daran wirkte der HubSpot-Ticket-Knopf tot, obwohl er funktioniert hat.
 * Deshalb: jeder Knopf hat seinen eigenen Ladezustand, jede Antwort landet
 * sichtbar in der Karte, und "nichts passiert" gibt es nicht.
 *
 * Saetze, die eine Aussage ueber das System des Kunden treffen, kommen vom
 * Server (`grenzen`, `hinweis`). Hier stehen nur Beschriftungen fuer Schluessel.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, Loader2, CheckCircle2, AlertTriangle, ExternalLink,
  RefreshCw, Unplug, Gauge, Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchCalendarReadiness, startCalendarConnect, disconnectCalendar, probeCalendar,
  type CalendarReadiness, type CalendarProviderState,
} from "@/lib/api-client";

const SCHRITT_TEXT: Record<string, string> = {
  zugangsdaten_fehlen: "Die Zugangsdaten des Anbieters sind noch nicht hinterlegt. Bis dahin laesst sich nicht verbinden.",
  kalender_verbinden: "Noch kein Kalender verbunden. Ohne ihn kann kein Termin angelegt werden.",
  bereit_ohne_zoom: "Termine koennen angelegt werden. Teams und eigene Links gehen; fuer Zoom fehlt noch die Zoom-Verbindung.",
  bereit: "Alles verbunden. Termine mit Teams, Zoom oder eigenem Link sind moeglich.",
};

const FAEHIGKEIT_TEXT: Record<string, string> = {
  createEvent: "Termin anlegen",
  sendInvitation: "Einladung verschicken",
  readFreeBusy: "Freie Zeiten lesen",
  deleteEvent: "Termin loeschen",
  teamsLink: "Teams-Link",
  zoomLink: "Zoom-Link",
  meetLink: "Google-Meet-Link",
  schedulingUrl: "Buchungslink",
  createMeeting: "Meeting anlegen",
  joinUrl: "Beitrittslink",
  readEventTypes: "Termin-Arten lesen",
  readCalendars: "Kalender lesen",
};

const WERT_TEXT: Record<string, string> = {
  yes: "geht",
  no: "geht nicht",
  conditional: "haengt am Tarif",
  carry_only: "wird nur weitergereicht, nicht erzeugt",
  via_event_type: "kommt aus der Einstellung beim Anbieter",
  wahrscheinlich: "Konto erreichbar",
};

function label(map: Record<string, string>, key: string) {
  return map[key] ?? key;
}

export default function CalendarIntegration({ repId = null }: { repId?: string | null }) {
  const [readiness, setReadiness] = useState<CalendarReadiness | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  // Je Anbieter ein eigener Ladezustand — sonst weiss der Nutzer bei drei
  // Knoepfen nicht, welcher gerade arbeitet.
  const [aktiv, setAktiv] = useState<Record<string, string | null>>({});
  const [messung, setMessung] = useState<Record<string, Record<string, string>>>({});

  const laden = useCallback(async (still = false) => {
    if (!still) setLaedt(true);
    try {
      const r = await fetchCalendarReadiness(repId);
      setReadiness(r);
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Die Bereitschaft liess sich nicht laden.");
    } finally {
      setLaedt(false);
    }
  }, [repId]);

  useEffect(() => { void laden(); }, [laden]);

  // Nach dem Rueckweg vom Anbieter steht das Ergebnis in der Adresszeile.
  // Es wird EINMAL gelesen, angezeigt und dann entfernt, damit ein Neuladen
  // nicht dieselbe Meldung noch einmal behauptet.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const stand = p.get("kalender");
    if (!stand) return;
    if (stand === "verbunden") {
      const anbieter = p.get("anbieter") || "Der Kalender";
      const konto = p.get("konto");
      const ausgerollt = p.get("ausgerollt");
      if (ausgerollt === "nein") {
        toast.warning(`${anbieter} ist verbunden, aber der Buchungslink steht noch nicht im Telefon-Skript.`, {
          description: "Die Verbindung steht. Das erneute Ausrollen des Vertrieblers hat nicht geklappt, siehe Karte.",
        });
      } else {
        toast.success(`${anbieter} verbunden${konto ? ` als ${konto}` : ""}.`);
      }
    } else if (stand === "fehler") {
      toast.error("Das Verbinden ist abgebrochen.", { description: p.get("grund") || undefined });
    }
    p.delete("kalender"); p.delete("anbieter"); p.delete("konto"); p.delete("ausgerollt"); p.delete("grund");
    const rest = p.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    void laden(true);
  }, [laden]);

  const verbinden = async (provider: string) => {
    setAktiv((a) => ({ ...a, [provider]: "verbinden" }));
    try {
      const r = await startCalendarConnect(provider, repId);
      if (r.ok && r.authorize_url) {
        window.location.href = r.authorize_url;
        return;
      }
      // Kein stilles Nichts: der Grund gehoert sichtbar in die Karte.
      toast.error("Verbinden nicht moeglich.", {
        description: r.error === "zugangsdaten_fehlen"
          ? "Die Zugangsdaten dieses Anbieters sind in der Lambda noch nicht hinterlegt."
          : r.detail || r.error || "Unbekannter Grund.",
      });
    } catch (e) {
      toast.error("Verbinden fehlgeschlagen.", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setAktiv((a) => ({ ...a, [provider]: null }));
    }
  };

  const trennen = async (provider: string, label_: string) => {
    setAktiv((a) => ({ ...a, [provider]: "trennen" }));
    try {
      const r = await disconnectCalendar(provider, repId);
      if (r.ok) toast.success(`${label_} getrennt.`);
      else toast.error(`${label_} liess sich nicht trennen.`, { description: r.error });
      await laden(true);
    } catch (e) {
      toast.error("Trennen fehlgeschlagen.", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setAktiv((a) => ({ ...a, [provider]: null }));
    }
  };

  const messen = async (provider: string, label_: string) => {
    setAktiv((a) => ({ ...a, [provider]: "messen" }));
    try {
      const r = await probeCalendar(provider, repId);
      if (r.ok && r.gemessen) {
        setMessung((m) => ({ ...m, [provider]: r.gemessen as Record<string, string> }));
        toast.success(`${label_} gemessen.`, { description: "Das Ergebnis steht in der Karte und schlaegt die Angabe des Treibers." });
      } else {
        toast.error(`${label_} liess sich nicht messen.`, {
          description: r.error === "reauth_required" ? "Die Verbindung ist abgelaufen und muss erneuert werden." : r.error,
        });
      }
      await laden(true);
    } catch (e) {
      toast.error("Messen fehlgeschlagen.", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setAktiv((a) => ({ ...a, [provider]: null }));
    }
  };

  const Anbieter = ({ a }: { a: CalendarProviderState }) => {
    const busy = aktiv[a.provider];
    const gemessen = messung[a.provider];
    return (
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{a.label}</span>
              {a.art === "conferencing" && <Badge variant="outline">Konferenz</Badge>}
              {a.verbunden
                ? <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />verbunden</Badge>
                : <Badge variant="secondary">nicht verbunden</Badge>}
              {a.verbunden && a.geerbt && <Badge variant="outline">Standard des Mandanten</Badge>}
              {a.status === "reauth_required" && (
                <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />neu verbinden</Badge>
              )}
            </div>
            {a.konto && <p className="text-sm text-muted-foreground">{a.konto}</p>}
            {a.hinweis && <p className="text-sm text-destructive">{a.hinweis}</p>}
            {!a.konfiguriert && (
              <p className="text-sm text-muted-foreground">
                Zugangsdaten noch nicht hinterlegt, deshalb ist Verbinden hier ausgeschaltet.
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {a.verbunden && (
              <Button variant="outline" size="sm" disabled={!!busy} onClick={() => messen(a.provider, a.label)}>
                {busy === "messen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
                <span className="ml-1">Messen</span>
              </Button>
            )}
            {a.verbunden ? (
              <Button variant="outline" size="sm" disabled={!!busy} onClick={() => trennen(a.provider, a.label)}>
                {busy === "trennen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                <span className="ml-1">Trennen</span>
              </Button>
            ) : (
              <Button size="sm" disabled={!!busy || !a.konfiguriert} onClick={() => verbinden(a.provider)}>
                {busy === "verbinden" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                <span className="ml-1">Verbinden</span>
              </Button>
            )}
          </div>
        </div>

        {a.buchungslink && (
          <p className="text-sm">
            Buchungslink:{" "}
            <a className="underline" href={a.buchungslink} target="_blank" rel="noreferrer">{a.buchungslink}</a>
          </p>
        )}

        {/* Grenzen kommen woertlich vom Server. Hier wird nichts nachformuliert. */}
        {Object.entries(a.grenzen || {}).length > 0 && (
          <ul className="space-y-1">
            {Object.entries(a.grenzen).map(([k, satz]) => (
              <li key={k} className="flex gap-2 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{satz}</span>
              </li>
            ))}
          </ul>
        )}

        {gemessen && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="mb-1 text-sm font-medium">Am echten Konto gemessen</p>
            <ul className="space-y-0.5 text-sm">
              {Object.entries(gemessen).map(([k, v]) => (
                <li key={k}>
                  {label(FAEHIGKEIT_TEXT, k)}: <span className={v.startsWith("no") ? "text-destructive" : ""}>{label(WERT_TEXT, v)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Kalender
            </CardTitle>
            <CardDescription>
              Aus einem im Telefonat vereinbarten Zeitpunkt wird ein Termin mit Meeting-Link,
              und die Einladung geht an den Interessenten.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => laden()} disabled={laedt}>
            {laedt ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {fehler && (
          <div className="flex gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{fehler}</span>
          </div>
        )}

        {readiness?.naechster_schritt && (
          <p className="text-sm">{label(SCHRITT_TEXT, readiness.naechster_schritt)}</p>
        )}

        {laedt && !readiness && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Bereitschaft wird gelesen…
          </div>
        )}

        {readiness?.anbieter.map((a) => <Anbieter key={a.provider} a={a} />)}
      </CardContent>
    </Card>
  );
}
