// ---------------------------------------------------------------------------
// D4 (Briefing D, IMAP-Provider-Pfad): Dialog "Postfach verbinden" (IMAP).
//
// Klickbarer Weg zu dem Endpunkt, der seit D1 scharf ist:
//   POST /v1/dashboard/mailbox/imap/connect  (Console-JWT)
//     action='autoconfig' -> Serverdaten aus der Anbieter-Tabelle / MX / Thunderbird
//     action='connect'    -> echte IMAP-Login-Probe UND SMTP-Auth-Probe,
//                            getrennt gemeldet, Ablage nur bei IMAP-Erfolg
//
// Warum dieser Weg wichtig ist: Gmail deckt in Deutschland 3,8 Prozent der
// Firmendomains ab, IONOS 34 Prozent, und 22,6 Prozent der Betriebe haben gar
// keine eigene Domain (GMX, WEB.DE, T-Online). Ohne diesen Dialog braucht jedes
// IMAP-Postfach einen Admin mit Datenbankzugang.
//
// HARD LINES (Briefing D, Frontend-Teil):
//   - Das Passwort steht ausschließlich im lokalen State dieser Komponente.
//     Nie in der URL, nie in localStorage, nie in einem Query-Parameter, nie in
//     einem Log, nie in einer Anzeige. Nach dem Verbinden wird das Feld sofort
//     geleert, ebenso beim Schließen des Dialogs.
//   - Bewusst KEIN <form>: ein Formular ohne action schickt seine Felder beim
//     Absenden als Query-String an die aktuelle Adresse. Genau das darf mit
//     einem Postfach-Passwort nie passieren.
//   - Die Fehlertexte kommen kundenlesbar-deutsch aus dem Backend (message_de)
//     und werden DURCHGEREICHT, nicht neu getextet. Eigene Texte gibt es nur
//     dort, wo das Backend keinen liefert (Feature-Schalter, Netzfehler, 401).
//   - Serverdaten werden hier NICHT hartkodiert. Die Anbieter-Tabelle steht im
//     Backend (imap_config.js); eine zweite Kopie im Frontend würde bei der
//     ersten Serveränderung still falsch werden.
//
// Self-contained: eigener fetch statt api-client. Grund ist nicht Bequemlichkeit,
// sondern die Antwortform. apiPost wirft bei jedem Status ungleich 2xx und
// verwirft den Rumpf; hier steckt die eigentliche Nachricht aber genau dort
// (503 mit message_de, 200 mit ok:false und getrenntem imap/smtp-Ergebnis).
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Mail, Loader2, Check, AlertTriangle, X, ServerCog, ShieldCheck, KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SectionCard, Chip } from "@/components/ue/primitives";
import { supabase } from "@/integrations/supabase/client";

const IMAP_CONNECT_URL = "https://api.useeasy.ai/v1/dashboard/mailbox/imap/connect";

/* ------------------------------------------------------------------ Typen */

interface ImapPublicConfig {
  provider_hint?: string;
  provider_label?: string | null;
  imap_host?: string | null;
  imap_port?: number | null;
  imap_secure?: boolean | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_secure?: boolean | null;
  username_rule?: string;
  app_password?: boolean;
  notes_de?: string[];
  source?: string;
}

interface ProbeResult {
  ok?: boolean;
  error_code?: string;
  message_de?: string;
  detail?: string | null;
}

interface ImapApiResponse {
  ok?: boolean;
  action?: string;
  saved?: boolean;
  needs_manual?: boolean;
  error?: string;
  message_de?: string;
  config?: ImapPublicConfig;
  config_used?: ImapPublicConfig;
  imap?: ProbeResult;
  smtp?: ProbeResult;
  imap_username?: string;
}

/* -------------------------------------------------------------- Anbieter */

// Nur Anzeigenamen. Die Serverdaten liefert das Backend (Anbieter-Tabelle,
// MX-Erkennung, Thunderbird-Datenbank) und niemand sonst.
const PROVIDERS: { hint: string; label: string }[] = [
  { hint: "ionos", label: "IONOS" },
  { hint: "strato", label: "Strato" },
  { hint: "mittwald", label: "Mittwald" },
  { hint: "all_inkl", label: "All-Inkl" },
  { hint: "gmx", label: "GMX" },
  { hint: "webde", label: "WEB.DE" },
  { hint: "t_online", label: "T-Online" },
  { hint: "hetzner", label: "Hetzner" },
  { hint: "other", label: "Anderer Anbieter" },
];

// Rückfall für die Anzeige, wenn das Backend keinen provider_label mitschickt.
const HINT_LABEL: Record<string, string> = PROVIDERS.reduce(
  (acc, p) => { acc[p.hint] = p.label; return acc; },
  {} as Record<string, string>,
);

const providerLabel = (cfg?: ImapPublicConfig | null): string => {
  if (!cfg) return "";
  if (cfg.provider_label) return cfg.provider_label;
  return HINT_LABEL[cfg.provider_hint ?? ""] ?? "Anderer Anbieter";
};

/* --------------------------------------------------------------- Transport */

export type ImapTransportResult = { status: number; data: ImapApiResponse; networkError?: boolean };
export type ImapTransport = (body: Record<string, unknown>) => Promise<ImapTransportResult>;

// D4.1 (Briefing D, 29.07.2026): der Dialog bekommt seinen Transportweg jetzt
// als Prop herein. Grund: /connect laeuft PRE-LOGIN, dort gibt es kein
// Supabase-Token und keinen Dashboard-Endpunkt, sondern einen Onboarding-Token
// und /v1/onboarding/connect/imap. Eine zweite Kopie dieses Dialogs waere bei
// der ersten Aenderung an den Fehlertexten oder den Passwort-Hard-Lines still
// auseinandergelaufen; die Transport-Funktion ist das einzige, was sich
// zwischen Konsole und Onboarding wirklich unterscheidet.
async function postImapConnect(body: Record<string, unknown>): Promise<ImapTransportResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) return { status: 401, data: { ok: false, error: "not_authenticated" } };

  let res: Response;
  try {
    res = await fetch(IMAP_CONNECT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { status: 0, data: { ok: false }, networkError: true };
  }

  let data: ImapApiResponse = {};
  try { data = (await res.json()) as ImapApiResponse; } catch { data = {}; }
  return { status: res.status, data };
}

// Eigener Text NUR, wo das Backend keinen message_de liefert.
function fallbackMessage(status: number, error?: string, networkError?: boolean): string {
  if (networkError) return "Der Server ist gerade nicht erreichbar. Bitte die Verbindung prüfen und es noch einmal versuchen.";
  if (status === 401) return "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich neu an und versuchen Sie es noch einmal.";
  if (status === 404) return "Der Verbinden-Endpunkt ist auf diesem Server noch nicht verfügbar.";
  switch (error) {
    case "feature_disabled":
      return "Das Verbinden eigener Postfächer ist derzeit abgeschaltet. Bitte später noch einmal versuchen oder support@useeasy.ai anschreiben.";
    case "invalid_email":
      return "Diese Adresse sieht nicht wie eine gültige E-Mail-Adresse aus.";
    case "password_required":
      return "Bitte tragen Sie das Passwort des Postfachs ein.";
    case "tenant_unresolved":
    case "not_authenticated":
      return "Ihr Konto konnte nicht aufgelöst werden. Bitte melden Sie sich neu an.";
    default:
      return "Die Anfrage ist fehlgeschlagen. Bitte später noch einmal versuchen.";
  }
}

function emailLooksValid(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

const portOrNull = (v: string): number | null => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 && n <= 65535 ? n : null;
};

/* ------------------------------------------------------------- Bausteine */

function ProbeRow({ title, result }: { title: string; result?: ProbeResult }) {
  const ok = !!result?.ok;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${ok ? "border-emerald-surface bg-emerald-surface/40" : "border-amber/30 bg-amber-surface"}`}>
      <p className={`flex items-center gap-1.5 text-[12.5px] font-medium ${ok ? "text-emerald-light" : "text-amber"}`}>
        {ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
        {title}
        <span className="font-normal">{ok ? "funktioniert" : "hat nicht geklappt"}</span>
      </p>
      {!ok && result?.message_de ? (
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{result.message_de}</p>
      ) : null}
    </div>
  );
}

function ServerFields({
  legend, host, setHost, port, setPort, secure, setSecure, hostPlaceholder, idPrefix,
}: {
  legend: string;
  host: string; setHost: (v: string) => void;
  port: string; setPort: (v: string) => void;
  secure: boolean; setSecure: (v: boolean) => void;
  hostPlaceholder: string;
  idPrefix: string;
}) {
  return (
    <div className="space-y-2">
      <p className="ue-kicker">{legend}</p>
      <div className="flex flex-wrap gap-2">
        <Input
          id={`${idPrefix}-host`}
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder={hostPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="h-9 min-w-[13rem] flex-1 text-[13px]"
        />
        <Input
          id={`${idPrefix}-port`}
          value={port}
          onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="Port"
          inputMode="numeric"
          autoComplete="off"
          className="h-9 w-24 text-[13px]"
        />
      </div>
      <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground" htmlFor={`${idPrefix}-secure`}>
        <Switch id={`${idPrefix}-secure`} checked={secure} onCheckedChange={setSecure} />
        {secure ? "Direkte SSL/TLS-Verbindung" : "STARTTLS auf dem angegebenen Port"}
      </label>
    </div>
  );
}

/* ----------------------------------------------------------------- Dialog */

export function ImapConnectDialog({
  open, onOpenChange, initialEmail = "", transport, mode = "connect", invalidateMe = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Vorbelegte Adresse, wenn ein bestehendes Postfach neu verbunden wird. */
  initialEmail?: string;
  /**
   * D4.1: Weg zum Backend. Ohne Angabe der Dashboard-Endpunkt mit
   * Supabase-Token (Konsole); /connect reicht seinen eigenen herein.
   */
  transport?: ImapTransport;
  /**
   * D5: "smtp" richtet einen fehlgeschlagenen Versand-Zugang nach, ohne dass
   * der Kunde das Gefuehl bekommt, sein ganzes Postfach neu verbinden zu
   * muessen. Technisch ist es derselbe action=connect, der die bestehende
   * Zeile aktualisiert - nur die Texte und der Einstieg sind andere.
   */
  mode?: "connect" | "smtp";
  /** Pre-login gibt es keine ["me"]-Abfrage, die man invalidieren koennte. */
  invalidateMe?: boolean;
}) {
  const queryClient = useQueryClient();
  const post = transport ?? postImapConnect;
  const smtpMode = mode === "smtp";

  const [step, setStep] = useState<"provider" | "form" | "result">("provider");
  const [hint, setHint] = useState<string | null>(null);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");

  const [auto, setAuto] = useState<ImapApiResponse | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoForEmail, setAutoForEmail] = useState<string | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [imapSecure, setImapSecure] = useState(true);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpSecure, setSmtpSecure] = useState(true);

  const [connecting, setConnecting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [result, setResult] = useState<ImapApiResponse | null>(null);

  const resetAll = (keepEmail: string) => {
    setStep("provider");
    setHint(null);
    setEmail(keepEmail);
    setPassword("");
    setAuto(null);
    setAutoBusy(false);
    setAutoForEmail(null);
    setManualOpen(false);
    setImapHost(""); setImapPort("993"); setImapSecure(true);
    setSmtpHost(""); setSmtpPort("465"); setSmtpSecure(true);
    setConnecting(false);
    setTopError(null);
    setResult(null);
  };

  // Hard Line: beim Öffnen UND beim Schließen bleibt kein Passwort im Speicher
  // liegen. Auch der Rest wird zurückgesetzt, damit kein zweiter Kunde die
  // Vorschau des ersten sieht.
  useEffect(() => {
    resetAll(initialEmail);
    if (open && initialEmail) setStep("form");
    // D5: beim Nachreichen des Versand-Zugangs stehen die Serverfelder offen -
    // meistens ist genau der SMTP-Server der Grund, warum es nicht ging.
    if (open && smtpMode) { setStep("form"); setManualOpen(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialEmail, smtpMode]);

  const cfg = auto?.ok ? auto.config : null;
  const needsManual = auto != null && !auto.ok;

  const applyConfigToFields = (c?: ImapPublicConfig | null) => {
    if (!c) return;
    if (c.imap_host) setImapHost(c.imap_host);
    if (c.imap_port) setImapPort(String(c.imap_port));
    if (typeof c.imap_secure === "boolean") setImapSecure(c.imap_secure);
    if (c.smtp_host) setSmtpHost(c.smtp_host);
    if (c.smtp_port) setSmtpPort(String(c.smtp_port));
    if (typeof c.smtp_secure === "boolean") setSmtpSecure(c.smtp_secure);
  };

  const runAutoconfig = async (addr: string) => {
    const value = addr.trim().toLowerCase();
    if (!emailLooksValid(value) || autoBusy) return;
    if (autoForEmail === value) return;
    setAutoBusy(true);
    setTopError(null);
    const { status, data, networkError } = await post({ action: "autoconfig", email: value });
    setAutoBusy(false);
    setAutoForEmail(value);

    // 200 mit ok:false ist hier KEIN Fehler, sondern die ehrliche Auskunft
    // "nicht gefunden, bitte von Hand". Alles andere ist ein echter Fehler.
    if (status !== 200) {
      setAuto(null);
      setTopError(data.message_de || fallbackMessage(status, data.error, networkError));
      return;
    }
    setAuto(data);
    if (data.ok) {
      applyConfigToFields(data.config);
      // Serverdaten unvollständig (z.B. All-Inkl ohne MX-Treffer): Felder öffnen.
      setManualOpen(!data.config?.imap_host);
    } else {
      setManualOpen(true);
    }
  };

  const handleConnect = async () => {
    const addr = email.trim().toLowerCase();
    if (!emailLooksValid(addr)) { setTopError("Bitte tragen Sie die vollständige E-Mail-Adresse des Postfachs ein."); return; }
    if (!password) { setTopError("Bitte tragen Sie das Passwort des Postfachs ein."); return; }

    const body: Record<string, unknown> = { action: "connect", email: addr, password };

    // provider_hint NUR mitschicken, wenn die Erkennung nichts Genaueres weiß.
    // Das Backend lässt den Body gegen die Erkennung gewinnen; ein pauschal
    // mitgeschickter Wert würde eine bessere Erkennung überschreiben und die
    // anbieterspezifischen Hinweise in den Fehlermeldungen verlieren.
    const detected = cfg?.provider_hint;
    if (hint && hint !== "other" && (!detected || detected === "other")) body.provider_hint = hint;

    // Was der Kunde sieht, wird auch geschickt: die Felder sind mit den
    // erkannten Werten vorbelegt, geöffnet gelten sie als seine Entscheidung.
    if (manualOpen) {
      const ih = imapHost.trim().toLowerCase();
      if (ih) {
        body.imap_host = ih;
        body.imap_port = portOrNull(imapPort) ?? 993;
        body.imap_secure = imapSecure;
      }
      const sh = smtpHost.trim().toLowerCase();
      if (sh) {
        body.smtp_host = sh;
        body.smtp_port = portOrNull(smtpPort) ?? 465;
        body.smtp_secure = smtpSecure;
      }
    }

    setConnecting(true);
    setTopError(null);
    const { status, data, networkError } = await post(body);
    setConnecting(false);
    // Hard Line: das Passwort verlässt den State, sobald die Antwort da ist.
    setPassword("");

    if (status !== 200 || !data.imap) {
      // Kein Probe-Ergebnis: Feature aus, Migration fehlt, Schlüssel fehlt,
      // Host gesperrt, Serverdaten unklar. Inline zeigen, damit der Kunde
      // korrigieren kann, statt ihn auf eine leere Ergebnisseite zu schicken.
      setTopError(data.message_de || fallbackMessage(status, data.error, networkError));
      if (data.needs_manual) setManualOpen(true);
      return;
    }

    setResult(data);
    setStep("result");
    if (data.saved) {
      if (invalidateMe) void queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success(smtpMode ? `Versand für ${addr} gespeichert` : `Postfach ${addr} verbunden`);
    }
  };

  const detectedLabel = providerLabel(cfg);
  const chosenLabel = hint ? HINT_LABEL[hint] : "";
  const mismatch =
    !!cfg && !!hint && hint !== "other" && !!cfg.provider_hint &&
    cfg.provider_hint !== "other" && cfg.provider_hint !== hint;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Mail className="h-4 w-4 text-primary" />
            {smtpMode ? "Versand einrichten" : "Postfach verbinden"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            {smtpMode
              ? "Nur der Postausgang wird neu geprüft. Ihr Postfach bleibt verbunden, Empfang und Entwürfe laufen unverändert weiter."
              : "UseEasy meldet sich mit den Zugangsdaten Ihres Postfachs an, so wie es ein E-Mail-Programm tut. Wir lesen und entwerfen. Gesendet wird nichts ohne Ihre Freigabe."}
          </DialogDescription>
        </DialogHeader>

        {/* ------------------------------------------------ Schritt 1: Anbieter */}
        {step === "provider" && (
          <div className="space-y-4">
            <p className="text-[12.5px] text-muted-foreground">
              Bei welchem Anbieter liegt das Postfach? Die Auswahl hilft uns bei den
              Hinweisen. Die Serverdaten ermitteln wir gleich automatisch aus Ihrer Adresse.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PROVIDERS.map((p) => (
                <Chip key={p.hint} active={hint === p.hint} onClick={() => setHint(p.hint)}>
                  {p.label}
                </Chip>
              ))}
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              Eigene Firmen-Domain? Wählen Sie den Anbieter, bei dem die Domain liegt, oder
              „Anderer Anbieter“. Wir erkennen den Server dann über den MX-Eintrag Ihrer Domain.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button size="sm" disabled={!hint} onClick={() => setStep("form")}>Weiter</Button>
            </div>
          </div>
        )}

        {/* -------------------------------------- Schritt 2: Adresse + Passwort */}
        {step === "form" && (
          <div className="space-y-4">
            {chosenLabel ? (
              <p className="text-[11.5px] text-muted-foreground">
                Anbieter: <span className="text-foreground">{chosenLabel}</span>{" "}
                <button type="button" className="underline hover:text-foreground" onClick={() => setStep("provider")}>
                  ändern
                </button>
              </p>
            ) : null}

            <div className="space-y-1.5">
              <label className="ue-kicker" htmlFor="imap-email">E-Mail-Adresse</label>
              <Input
                id="imap-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => void runAutoconfig(email)}
                onKeyDown={(e) => { if (e.key === "Enter") void runAutoconfig(email); }}
                placeholder="name@ihre-firma.de"
                autoComplete="email"
                spellCheck={false}
                className="h-9 text-[13px]"
              />
            </div>

            {/* Autoconfig-Vorschau: was der Server ermittelt hat, im Klartext. */}
            {autoBusy ? (
              <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Serverdaten werden ermittelt …
              </p>
            ) : cfg ? (
              <div className="rounded-lg border border-emerald-surface bg-emerald-surface/40 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-light">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  Erkannt: {detectedLabel}
                </p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  Empfang {cfg.imap_host}:{cfg.imap_port}
                  {cfg.smtp_host ? <> , Versand {cfg.smtp_host}:{cfg.smtp_port}</> : null}
                </p>
                {mismatch ? (
                  <p className="mt-1.5 text-[11.5px] text-amber">
                    Sie hatten {chosenLabel} gewählt. UseEasy nutzt die erkannten Daten von{" "}
                    {detectedLabel}. Über „Serverdaten selbst eintragen“ können Sie das ändern.
                  </p>
                ) : null}
                {(cfg.notes_de ?? []).length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {(cfg.notes_de ?? []).map((n, i) => (
                      <li key={i} className="flex gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                        <span aria-hidden className="text-muted-foreground">·</span>
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : needsManual ? (
              <div className="rounded-lg border border-amber/30 bg-amber-surface px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-amber">
                  <ServerCog className="h-3.5 w-3.5 shrink-0" /> Serverdaten nicht gefunden
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {auto?.message_de
                    ?? "Die Serverdaten konnten nicht automatisch ermittelt werden. Bitte tragen Sie IMAP- und SMTP-Server laut der Hilfe Ihres Anbieters ein."}
                </p>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="ue-kicker" htmlFor="imap-password">Passwort des Postfachs</label>
              <Input
                id="imap-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !connecting) void handleConnect(); }}
                placeholder="Passwort"
                autoComplete="new-password"
                spellCheck={false}
                className="h-9 text-[13px]"
              />
              <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                Wird verschlüsselt gespeichert, nie angezeigt und nie protokolliert. Sie können
                es jederzeit im Konto Ihres Anbieters ändern, dann verliert UseEasy den Zugriff.
              </p>
            </div>

            {/* Manuelle Serverfelder: Rückfall, nicht Regelfall. */}
            <div>
              <button
                type="button"
                onClick={() => setManualOpen((v) => !v)}
                className="text-[11.5px] text-muted-foreground underline hover:text-foreground"
              >
                {manualOpen ? "Serverdaten ausblenden" : "Serverdaten selbst eintragen"}
              </button>
              {manualOpen ? (
                <div className="mt-3 space-y-4 rounded-lg border border-border bg-muted/40 p-3">
                  <ServerFields
                    legend="Posteingang (IMAP)"
                    host={imapHost} setHost={setImapHost}
                    port={imapPort} setPort={setImapPort}
                    secure={imapSecure} setSecure={setImapSecure}
                    hostPlaceholder="imap.anbieter.de"
                    idPrefix="imap-in"
                  />
                  <ServerFields
                    legend="Postausgang (SMTP)"
                    host={smtpHost} setHost={setSmtpHost}
                    port={smtpPort} setPort={setSmtpPort}
                    secure={smtpSecure} setSecure={setSmtpSecure}
                    hostPlaceholder="smtp.anbieter.de"
                    idPrefix="imap-out"
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    UseEasy verbindet sich ausschließlich verschlüsselt. Die Postausgangs-Daten
                    werden jetzt schon geprüft und gespeichert, damit Sie später nicht ein
                    zweites Mal ran müssen. Gesendet wird dadurch nichts.
                  </p>
                </div>
              ) : null}
            </div>

            {topError ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] leading-relaxed text-danger">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {topError}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button size="sm" disabled={connecting || autoBusy} onClick={() => void handleConnect()}>
                {connecting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-1.5 h-3.5 w-3.5" />}
                {connecting ? "Wird geprüft …" : "Verbinden"}
              </Button>
            </div>
          </div>
        )}

        {/* -------------------------------------------- Schritt 3: Ergebnis */}
        {step === "result" && result ? (
          <div className="space-y-3">
            <ProbeRow title="Empfang (IMAP) " result={result.imap} />
            <ProbeRow title="Versand (SMTP) " result={result.smtp} />

            {result.saved ? (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">
                  {smtpMode ? "Der Versand ist eingerichtet." : "Das Postfach ist verbunden."}
                </p>
                <p className="mt-1">
                  UseEasy holt neue E-Mails alle zwei Minuten ab, sortiert sie in Ordner unterhalb
                  von „UE“ ein und legt Antwort-Entwürfe in Ihrem Entwürfe-Ordner ab. Die Ordner
                  entstehen beim ersten Mal von selbst. Versendet wird nichts ohne Ihre Freigabe.
                </p>
                {/* D5 (Briefing D): der Versand ist ab jetzt ein eigener Zustand. Solange
                    der Autopilot in shadow oder assisted läuft, entstehen nur Entwürfe;
                    sobald er wirklich sendet, geht das über genau diesen SMTP-Zugang. Wer
                    das erst beim ersten autonomen Versand erfährt, erfährt es zu spät. */}
                {result.smtp?.ok === true ? (
                  <p className="mt-1.5 flex items-start gap-1.5 text-emerald-light">
                    <Check className="mt-0.5 h-3 w-3 shrink-0" />
                    Versand ist eingerichtet. Sobald Sie den Autopiloten auf automatisches
                    Antworten stellen, gehen die Antworten über Ihren eigenen Postausgang raus
                    und liegen danach in Ihrem Gesendet-Ordner.
                  </p>
                ) : (
                  <p className="mt-1.5">
                    Der Versand ist noch offen. Für den Empfang und die Entwürfe spielt das keine
                    Rolle, Sie können es später nachholen, ohne das Postfach neu zu verbinden.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                Es wurde nichts gespeichert. UseEasy legt Zugangsdaten nur ab, wenn der Empfang
                nachweislich funktioniert.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              {result.saved ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => resetAll("")}>Weiteres Postfach</Button>
                  <Button size="sm" onClick={() => onOpenChange(false)}>Fertig</Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Schließen</Button>
                  <Button size="sm" onClick={() => { setResult(null); setStep("form"); }}>Noch einmal versuchen</Button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ Karte */

export function ImapMailboxConnectCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SectionCard
        title="Eigenes Postfach verbinden (IMAP)"
        subtitle="Für alle Anbieter ohne Google- oder Microsoft-Anmeldung."
        action={<Button size="sm" onClick={() => setOpen(true)}>Postfach verbinden</Button>}
        bodyClassName="p-4 space-y-3"
      >
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          IONOS, Strato, Mittwald, All-Inkl, GMX, WEB.DE, T-Online, Hetzner und jeder andere
          Anbieter mit IMAP. Sie brauchen nur die E-Mail-Adresse und das Passwort des Postfachs.
          Die Serverdaten ermittelt UseEasy selbst.
        </p>
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Manche Anbieter verlangen ein eigenes App-Passwort oder erst eine Freischaltung von
          IMAP. Falls das so ist, sagt es Ihnen der Dialog im Klartext.
        </p>
      </SectionCard>
      <ImapConnectDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default ImapMailboxConnectCard;
