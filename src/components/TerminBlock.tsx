/**
 * TerminBlock — aus einem im Telefonat vereinbarten Zeitpunkt wird ein Termin.
 *
 * Erste Stufe des Telefon-Modus. Der Vertriebler telefoniert weiter im
 * Co-Piloten und traegt den Termin hier ein; der Knopf wandert spaeter in den
 * Telefon-Bereich der Konsole, wenn es ihn gibt. Die eingefrorene Rep-HTML wird
 * dafuer nicht angefasst.
 *
 * 🔴 LAYER 0: hier wird nie automatisch gebucht. Erst `dry_run` (Vorschau samt
 * Ueberschneidungs-Warnung, es wird nichts geschrieben), dann der Klick des
 * Menschen. Doppelbuchung ist der Fehler, den man nie machen darf, deshalb liest
 * der Server die freien Zeiten unmittelbar vor dem Schreiben neu.
 *
 * 🔴 Meeting-Arten, gemessen statt vermutet: Microsoft Graph kann nur einen
 * Teams-Link ERZEUGEN. Zoom und Google Meet kann es nicht erzeugen, aber
 * problemlos TRAGEN. Deshalb Zoom ueber den Zoom-Treiber und "eigener Link" fuer
 * alles andere. Solange Zoom nicht verbunden ist, ist "eigener Link" der Weg,
 * und die Auswahl sagt das auch, statt eine Art anzubieten, die fehlschlaegt.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, Loader2, AlertTriangle, CheckCircle2, Link2, Info } from "lucide-react";
import { toast } from "sonner";
import {
  fetchCalendarReadiness, createAppointment,
  type CalendarReadiness, type AppointmentVorschau, type MeetingArt,
} from "@/lib/api-client";

interface Props {
  repId?: string | null;
  leadId?: string | null;
  /** Vorbelegung aus dem Anruf, falls vorhanden. */
  kontaktName?: string | null;
  kontaktEmail?: string | null;
  betreffVorschlag?: string | null;
  onAngelegt?: (eventId: string) => void;
}

const DAUERN = [15, 30, 45, 60];

export default function TerminBlock({
  repId = null, leadId = null, kontaktName = null, kontaktEmail = null,
  betreffVorschlag = null, onAngelegt,
}: Props) {
  const [readiness, setReadiness] = useState<CalendarReadiness | null>(null);
  const [datum, setDatum] = useState("");
  const [uhrzeit, setUhrzeit] = useState("");
  const [dauer, setDauer] = useState(30);
  const [email, setEmail] = useState(kontaktEmail ?? "");
  const [name, setName] = useState(kontaktName ?? "");
  const [betreff, setBetreff] = useState(betreffVorschlag ?? "");
  const [art, setArt] = useState<MeetingArt>("teams");
  const [eigenerLink, setEigenerLink] = useState("");
  const [notiz, setNotiz] = useState("");
  const [vorschau, setVorschau] = useState<AppointmentVorschau | null>(null);
  const [pruefe, setPruefe] = useState(false);
  const [lege, setLege] = useState(false);
  const [ergebnis, setErgebnis] = useState<{ link: string | null; web: string | null } | null>(null);

  useEffect(() => {
    void fetchCalendarReadiness(repId).then(setReadiness).catch(() => setReadiness(null));
  }, [repId]);

  const zoomVerbunden = useMemo(
    () => Boolean(readiness?.anbieter.find((a) => a.provider === "zoom")?.verbunden),
    [readiness],
  );
  const kalenderVerbunden = Boolean(readiness?.termin_moeglich);

  const startsAt = useMemo(() => {
    if (!datum || !uhrzeit) return null;
    const d = new Date(`${datum}T${uhrzeit}:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }, [datum, uhrzeit]);

  const eingabeVollstaendig = Boolean(
    startsAt && (art !== "link" || /^https:\/\//i.test(eigenerLink)),
  );

  // Jede Aenderung macht die Vorschau ungueltig. Sonst bestaetigt der Nutzer
  // eine Vorschau, die zu anderen Eingaben gehoert.
  useEffect(() => { setVorschau(null); setErgebnis(null); },
    [datum, uhrzeit, dauer, email, name, betreff, art, eigenerLink, notiz]);

  const eingabe = () => ({
    rep_id: repId, lead_id: leadId,
    starts_at: startsAt as string,
    duration_min: dauer,
    subject: betreff.trim() || (name ? `Termin mit ${name}` : "Termin"),
    notes: notiz.trim() || undefined,
    attendee_email: email.trim() || undefined,
    attendee_name: name.trim() || undefined,
    meeting: art === "link" ? { type: art, url: eigenerLink.trim() } : { type: art },
  });

  const pruefen = async () => {
    if (!eingabeVollstaendig) return;
    setPruefe(true);
    try {
      const r = await createAppointment({ ...eingabe(), dry_run: true });
      if (r.ok && r.vorschau) {
        setVorschau(r.vorschau);
        if (r.vorschau.ueberschneidung) {
          toast.warning("In dieser Zeit steht schon etwas im Kalender.", {
            description: "Der Termin laesst sich trotzdem anlegen, du solltest es nur wissen.",
          });
        }
      } else {
        toast.error("Vorschau nicht moeglich.", { description: fehlerText(r.error, r.felder) });
      }
    } catch (e) {
      toast.error("Vorschau fehlgeschlagen.", { description: e instanceof Error ? e.message : undefined });
    } finally { setPruefe(false); }
  };

  const anlegen = async () => {
    setLege(true);
    try {
      const r = await createAppointment(eingabe());
      if (r.ok && r.event_id) {
        setErgebnis({ link: r.beitrittslink ?? null, web: r.web_link ?? null });
        toast.success(
          r.vorschau?.einladung_wird_verschickt
            ? "Termin angelegt und Einladung verschickt."
            : "Termin angelegt. Ohne E-Mail-Adresse ging keine Einladung raus.",
        );
        if (r.fall && !r.fall.case_notiert) {
          toast.info("Der Termin steht im Kalender, wurde aber nicht am Fall vermerkt.", {
            description: r.fall.grund === "kein_lead_bezug"
              ? "Zu diesem Anruf gibt es keinen Lead-Bezug."
              : "Die Migration ist moeglicherweise noch nicht eingespielt.",
          });
        }
        onAngelegt?.(r.event_id);
      } else {
        toast.error("Termin nicht angelegt.", { description: fehlerText(r.error, r.felder, r.detail) });
      }
    } catch (e) {
      toast.error("Anlegen fehlgeschlagen.", { description: e instanceof Error ? e.message : undefined });
    } finally { setLege(false); }
  };

  if (readiness && !kalenderVerbunden) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarPlus className="h-5 w-5" />Termin</CardTitle>
          <CardDescription>
            Noch kein Kalender verbunden. Unter Einstellungen, Reiter Integrationen, einmal verbinden,
            danach lassen sich hier Termine anlegen.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const ArtKnopf = ({ wert, text, aus }: { wert: MeetingArt; text: string; aus?: string }) => (
    <Button
      type="button" size="sm"
      variant={art === wert ? "default" : "outline"}
      disabled={Boolean(aus)}
      onClick={() => setArt(wert)}
      title={aus}
    >
      {text}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarPlus className="h-5 w-5" />Termin anlegen</CardTitle>
        <CardDescription>
          Zeitpunkt eintragen, pruefen, bestaetigen. Es wird nichts angelegt, bevor du es bestaetigst.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="tb-datum">Datum</Label>
            <Input id="tb-datum" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tb-zeit">Uhrzeit</Label>
            <Input id="tb-zeit" type="time" value={uhrzeit} onChange={(e) => setUhrzeit(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Dauer</Label>
            <div className="flex gap-1">
              {DAUERN.map((d) => (
                <Button key={d} type="button" size="sm" variant={dauer === d ? "default" : "outline"} onClick={() => setDauer(d)}>
                  {d}
                </Button>
              ))}
              <span className="self-center text-sm text-muted-foreground">Min.</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tb-name">Name des Interessenten</Label>
            <Input id="tb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Max Mustermann" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tb-mail">E-Mail fuer die Einladung</Label>
            <Input id="tb-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="max@firma.de" />
            {!email.trim() && (
              <p className="text-xs text-muted-foreground">
                Ohne Adresse entsteht nur ein Eintrag in deinem Kalender, keine Einladung.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="tb-betreff">Betreff</Label>
          <Input id="tb-betreff" value={betreff} onChange={(e) => setBetreff(e.target.value)}
                 placeholder={name ? `Termin mit ${name}` : "Termin"} />
        </div>

        <div className="space-y-2">
          <Label>Meeting</Label>
          <div className="flex flex-wrap gap-2">
            <ArtKnopf wert="teams" text="Teams" />
            <ArtKnopf wert="zoom" text="Zoom"
                      aus={zoomVerbunden ? undefined : "Zoom ist noch nicht verbunden. Bis dahin geht ein Zoom-Link ueber „eigener Link“."} />
            <ArtKnopf wert="link" text="Eigener Link" />
            <ArtKnopf wert="none" text="Kein Meeting" />
          </div>
          {art === "teams" && (
            <p className="flex gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Outlook erzeugt den Teams-Link beim Anlegen selbst.
            </p>
          )}
          {art === "link" && (
            <div className="space-y-1">
              <Input value={eigenerLink} onChange={(e) => setEigenerLink(e.target.value)}
                     placeholder="https://zoom.us/j/… oder https://meet.google.com/…" />
              <p className="flex gap-2 text-xs text-muted-foreground">
                <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Muss mit https beginnen. Der Link landet im Termin und geht mit der Einladung raus.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="tb-notiz">Notiz im Termin</Label>
          <Input id="tb-notiz" value={notiz} onChange={(e) => setNotiz(e.target.value)}
                 placeholder="Worum es im Gespraech gehen soll" />
        </div>

        {vorschau && (
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <span className="font-medium">Vorschau</span>
              {vorschau.ueberschneidung
                ? <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Ueberschneidung</Badge>
                : <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />Zeit ist frei</Badge>}
              {vorschau.geerbt && <Badge variant="outline">Kalender des Mandanten</Badge>}
            </div>
            <ul className="space-y-0.5 text-sm">
              <li>{vorschau.betreff}</li>
              <li>{vorschau.beginn.replace("T", ", ")} bis {vorschau.ende.slice(11, 16)} Uhr ({vorschau.dauer_min} Min.)</li>
              <li>Kalender: {vorschau.kalender ?? "unbekannt"}</li>
              <li>
                {vorschau.einladung_wird_verschickt
                  ? `Einladung an ${vorschau.teilnehmer.join(", ")}`
                  : "Keine Einladung, weil keine Adresse angegeben ist"}
              </li>
              {vorschau.meeting_art === "zoom" && <li>Der Zoom-Raum wird beim Bestaetigen angelegt.</li>}
              {vorschau.beitrittslink && <li>Beitrittslink: {vorschau.beitrittslink}</li>}
              {!vorschau.frei_belegt_gelesen && (
                <li className="text-muted-foreground">
                  Freie Zeiten konnten nicht gelesen werden ({vorschau.frei_belegt_hinweis}), die Ueberschneidung ist also ungeprueft.
                </li>
              )}
            </ul>
          </div>
        )}

        {ergebnis && (
          <div className="space-y-1 rounded-lg border border-emerald-500/40 p-4 text-sm">
            <p className="font-medium">Termin steht im Kalender.</p>
            {ergebnis.link && <p>Beitrittslink: <a className="underline" href={ergebnis.link} target="_blank" rel="noreferrer">{ergebnis.link}</a></p>}
            {ergebnis.web && <p><a className="underline" href={ergebnis.web} target="_blank" rel="noreferrer">In Outlook oeffnen</a></p>}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={pruefen} disabled={!eingabeVollstaendig || pruefe || lege}>
            {pruefe && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Pruefen
          </Button>
          <Button onClick={anlegen} disabled={!vorschau || lege}>
            {lege && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Termin anlegen und einladen
          </Button>
        </div>
        {!vorschau && eingabeVollstaendig && (
          <p className="text-xs text-muted-foreground">Erst pruefen, dann anlegen. Das ist die Bestaetigung.</p>
        )}
      </CardContent>
    </Card>
  );
}

function fehlerText(error?: string, felder?: string[], detail?: string): string {
  const FELD: Record<string, string> = {
    zeitpunkt_fehlt: "Datum und Uhrzeit fehlen",
    dauer_ungueltig: "Die Dauer liegt ausserhalb des Erlaubten",
    email_ungueltig: "Die E-Mail-Adresse sieht nicht richtig aus",
    meeting_art_unbekannt: "Diese Meeting-Art gibt es nicht",
    link_muss_https_sein: "Der eigene Link muss mit https beginnen",
    rep_id_ungueltig: "Die Kennung des Vertrieblers ist ungueltig",
  };
  if (felder?.length) return felder.map((f) => FELD[f] ?? f).join(". ");
  const E: Record<string, string> = {
    kein_kalender_verbunden: "Es ist kein Kalender verbunden.",
    zoom_nicht_verbunden: "Zoom ist nicht verbunden. Nimm bis dahin „eigener Link“.",
    reauth_required: "Die Kalender-Verbindung ist abgelaufen und muss erneuert werden.",
    zoom_reauth_required: "Die Zoom-Verbindung ist abgelaufen und muss erneuert werden.",
    zoom_meeting_fehlgeschlagen: "Zoom hat das Meeting nicht angelegt.",
    termin_anlegen_fehlgeschlagen: "Der Kalender hat den Termin abgelehnt.",
  };
  return E[error ?? ""] ?? detail ?? error ?? "Unbekannter Grund.";
}
