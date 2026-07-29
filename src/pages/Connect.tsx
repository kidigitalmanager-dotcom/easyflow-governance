import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Helmet } from "react-helmet-async";
import { AlertTriangle, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dot, type DotTone } from "@/components/ue/primitives";
import { ImapConnectDialog, type ImapTransport } from "@/components/ImapMailboxConnectCard";
import logo from "@/assets/useeasy-logo.jpg";


/**
 * Öffentliche Self-Serve-Onboarding-Landingpage (Phase 1).
 * URL: app.useeasy.ai/connect?token=<jwt-like>
 *
 * Flow:
 *   1) Token validieren (GET /v1/onboarding/connect/validate?token=…)
 *   2) Branche/Pack auswählen (GET /v1/onboarding/packs, vorausgewählt aus Tenant-Domain)
 *   3) Auswahl speichern (POST /v1/onboarding/connect/set-domain {token, pack_key})
 *   4) Postfach verbinden — Redirect auf /v1/onboarding/connect/{google|outlook}/start?token=…
 *      ODER (D4.1, 29.07.2026) IMAP direkt hier: POST /v1/onboarding/connect/imap
 *
 * PRE-LOGIN: keine Supabase-Auth, kein apiFetch — direkter fetch zur api.useeasy.ai.
 *
 * v4.62 (B4): Branche-Wahl ist PFLICHT. Vorbelegt wird nur, wenn die Branche aus
 * der Tenant-Domain ableitbar ist (z.B. HV-Bundle → real_estate); sonst bleibt das
 * Feld leer und die "Postfach verbinden"-Buttons sind inaktiv, bis der Kunde bewusst
 * eine Branche wählt — verhindert die stille ecom-Default-Fehlklassifikation.
 *
 * Redesign 27.07.2026: Die Seite läuft AUSSERHALB des AppLayout und behält deshalb
 * ihren eigenen zentrierten Rahmen — gestaltet in der Sprache des neuen Login
 * (dunkler Grund, .glass-card, Emerald-CTA). Die vier Backend-Schritte oben sind
 * für den Kunden als DREI sichtbare Schritte zusammengefasst (Speichern passiert
 * beim Verbinden automatisch), jeder mit Statuspunkt: erledigt = emerald,
 * offen = muted, Problem = danger.
 *
 * ⚠ Der Entwurf zeigt zusätzlich einen DNS-Check je Domain. Einen solchen Endpoint
 * gibt es nicht (weder hier noch sonst im Client) — er wird deshalb NICHT
 * vorgetäuscht. Die einzige echte Vorab-Prüfung ist die Gmail-Verfügbarkeit
 * (503-Probe unten); sie steht sichtbar an Schritt 3.
 */

const API_BASE = "https://api.useeasy.ai";

/**
 * D4.1 (Briefing D, 29.07.2026): IMAP direkt im Onboarding.
 *
 * Warum das hier stehen MUSS und nicht erst in der Konsole: IONOS hostet 34
 * Prozent der deutschen Firmen-Postfaecher, Google 3,8 Prozent. Wer sich selbst
 * registriert und bei IONOS liegt, kam auf dieser Seite bis heute nicht weiter
 * und musste den Weg ueber Einstellungen, Integrationen finden. Das ist der
 * falsche Trichter fuer die Mehrheit der Zielkunden.
 *
 * 🔴 HARD LINE: der Onboarding-Token steht in der Adresszeile dieser Seite (so
 * ist sie gebaut), das Postfach-Passwort geht ausschliesslich im POST-Rumpf
 * raus. Beides darf NIE in derselben URL landen, weil Query-Strings in
 * Browser-Verlauf, Referrer und Gateway-Zugriffslogs stehen. Deshalb wandert
 * hier auch der Token in den Rumpf: eine Anfrage, kein Query-String, fertig.
 *
 * Der Dialog ist DERSELBE wie in der Konsole (ImapConnectDialog). Nur der
 * Transportweg wird ausgetauscht - eine zweite Kopie waere bei der ersten
 * Aenderung an den Fehlertexten still auseinandergelaufen.
 */
export function makeOnboardingImapTransport(token: string): ImapTransport {
  return async (body) => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/v1/onboarding/connect/imap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, token }),
      });
    } catch {
      return { status: 0, data: { ok: false }, networkError: true };
    }
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    return { status: res.status, data };
  };
}

type ValidateResp = {
  ok: boolean;
  status?: string;
  tenant_id?: string;
  company_name?: string | null;
  email?: string | null;
  domain?: string | null;
  plan?: string | null;
  expires_at?: string;
};

type Pack = {
  pack_key: string;
  display_name: string;
  description: string | null;
  domain: string | null;
};

type Stage = "loading" | "ready" | "error";

/** Statuspunkt je Schritt: erledigt = emerald, offen = muted, Problem = danger. */
type StepState = "done" | "problem" | "open";
const STEP_TONE: Record<StepState, DotTone> = { done: "emerald", problem: "danger", open: "muted" };

export default function Connect() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>("loading");
  const [errReason, setErrReason] = useState<string>("");
  const [tenant, setTenant] = useState<ValidateResp | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selectedPack, setSelectedPack] = useState<string>("");
  const [saving, setSaving] = useState(false);
  // v4.103.0 — Gmail-Not-Aus: der Start-Endpoint antwortet 503 gmail_oauth_disabled,
  // solange GMAIL_OAUTH_ENABLED=false (GCP-Billing-Sperre). Beim Laden ohne Token
  // proben (enabled = 400 token_required, disabled = 503); fail-open bei Netzfehlern.
  const [gmailAvailable, setGmailAvailable] = useState<boolean>(true);
  // D4.1: IMAP-Dialog (derselbe wie in der Konsole, anderer Transportweg).
  const [imapOpen, setImapOpen] = useState(false);
  const imapTransport = useMemo(() => makeOnboardingImapTransport(token), [token]);

  // Beim Laden: Token validieren + Pack-Liste holen.
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!token) {
        setErrReason("missing_token");
        setStage("error");
        return;
      }
      try {
        const [vRes, pRes, gAvail] = await Promise.all([
          fetch(`${API_BASE}/v1/onboarding/connect/validate?token=${encodeURIComponent(token)}`),
          fetch(`${API_BASE}/v1/onboarding/packs`),
          fetch(`${API_BASE}/v1/onboarding/connect/google/start`)
            .then((r) => r.status !== 503)
            .catch(() => true),
        ]);
        if (!cancelled) setGmailAvailable(gAvail);
        const vJson: ValidateResp = await vRes.json();
        if (!vRes.ok || !vJson.ok) {
          if (cancelled) return;
          setErrReason(vJson.status || `http_${vRes.status}`);
          setStage("error");
          return;
        }
        const pJson = await pRes.json();
        if (cancelled) return;
        setTenant(vJson);
        setPacks(Array.isArray(pJson.packs) ? pJson.packs : []);
        // Pack NUR vorbelegen, wenn aus der Tenant-Domain ableitbar (z.B. HV-Bundle
        // → real_estate, vom Stripe-Webhook gesetzt). Sonst leer lassen → der Kunde
        // MUSS die Branche bewusst wählen, sonst bleiben die Verbinden-Buttons inaktiv.
        const byDomain = (Array.isArray(pJson.packs) ? pJson.packs : []).find(
          (p: Pack) => vJson.domain && vJson.domain !== "ecom" && (p.domain === vJson.domain || p.pack_key.startsWith(`${vJson.domain}_`)),
        );
        setSelectedPack(byDomain?.pack_key || "");
        setStage("ready");
      } catch {
        if (cancelled) return;
        setErrReason("network_error");
        setStage("error");
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  }, [token]);

  const reasonMessage = useMemo(() => {
    switch (errReason) {
      case "missing_token":
        return "Der Link in Ihrer E-Mail ist unvollständig. Bitte öffnen Sie den vollständigen Button aus der „Postfach verbinden“-Mail.";
      case "not_found":
        return "Dieser Link ist nicht gültig. Möglicherweise wurde er bereits genutzt oder eingegeben.";
      case "expired":
        return "Dieser Link ist abgelaufen (Gültigkeit 72 Stunden). Wir senden Ihnen gerne einen neuen — bitte bei support@useeasy.ai melden.";
      case "used":
        return "Dieser Link wurde bereits verwendet. Falls Sie das Postfach erneut verbinden möchten, melden Sie sich unter support@useeasy.ai.";
      case "network_error":
        return "Netzwerk-Fehler. Bitte prüfen Sie Ihre Verbindung und laden Sie die Seite neu.";
      default:
        return `Unerwarteter Fehler (${errReason}). Bitte bei support@useeasy.ai melden.`;
    }
  }, [errReason]);

  async function persistPackSelection(pack: string) {
    // 2026-07-27 (Bugfix): Der Fall "nichts zu speichern" ist ein ERFOLG, kein
    // Abbruch. Vorher lieferte dieser Zweig undefined; hiess das vorbelegte Pack
    // genauso wie tenant.domain, blieb `ok` falsy und der Kunde konnte sein
    // Postfach NIE verbinden — der Klick verpuffte kommentarlos.
    if (!pack || pack === tenant?.domain) return true;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/v1/onboarding/connect/set-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pack_key: pack }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        toast({
          title: "Konnte Branche nicht speichern",
          description: j.error || `HTTP ${res.status}`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "unbekannter Fehler";
      toast({ title: "Netzwerk-Fehler", description: msg, variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function connectMailbox(provider: "google" | "outlook") {
    // Gmail-Not-Aus: nicht auf die Google-Fehlerseite laufen lassen.
    if (provider === "google" && !gmailAvailable) {
      toast({
        title: "Gmail ist vorübergehend nicht verfügbar",
        description: "Bitte verbinden Sie Ihr Outlook / Microsoft 365 Postfach. Gmail folgt in Kürze.",
        variant: "destructive",
      });
      return;
    }
    // Branche ist Pflicht — ohne Auswahl kein Connect (Buttons sind ohnehin inaktiv).
    if (!selectedPack) {
      toast({
        title: "Bitte zuerst Branche wählen",
        description: "Damit UseEasy Ihre E-Mails korrekt kategorisiert, wählen Sie bitte Ihre Branche aus.",
        variant: "destructive",
      });
      return;
    }
    // Branche vorher persistieren — auch falls der Nutzer dasselbe Pack lässt,
    // ist der Roundtrip harmlos (Backend ist idempotent).
    const ok = await persistPackSelection(selectedPack);
    if (!ok) return;
    const url = `${API_BASE}/v1/onboarding/connect/${provider}/start?token=${encodeURIComponent(token)}`;
    window.location.href = url;
  }

  /* Drei sichtbare Schritte. Der Status ist abgeleitet, nichts wird geraten:
     Schritt 1 haengt am Validate-Ergebnis, Schritt 2 an der Auswahl,
     Schritt 3 bleibt offen, bis der Kunde den Redirect ausloest. */
  const steps: Array<{ title: string; hint: string; state: StepState }> = [
    {
      title: "Link geprüft",
      hint:
        stage === "loading" ? "wird geprüft …"
          : stage === "error" ? "nicht gültig"
            : "gültig",
      state: stage === "error" ? "problem" : stage === "ready" ? "done" : "open",
    },
    {
      title: "Branche wählen",
      hint: selectedPack ? "gewählt" : "noch offen",
      state: stage === "ready" && selectedPack ? "done" : "open",
    },
    {
      title: "Postfach verbinden",
      // D4.1: IMAP ist ab jetzt ein gleichwertiger dritter Weg und steht deshalb
      // auch in der Schritt-Uebersicht, nicht nur als Fussnote.
      hint: gmailAvailable ? "Gmail, Outlook oder IMAP" : "Outlook oder IMAP",
      state: "open",
    },
  ];

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:py-14">
      <Helmet>
        <title>Postfach verbinden — UseEasy</title>
        {/* 29.07.2026: „keine Passwörter" ist seit dem IMAP-Pfad (Briefing D) nicht
            mehr wahr. IONOS, Strato, GMX und die anderen bieten kein OAuth an, dort
            speichert UseEasy ein verschlüsseltes Postfach-Passwort. Die Aussage gilt
            nur noch für Google und Microsoft und steht deshalb nicht mehr pauschal da.
            D4.1 (29.07.2026): seit IMAP hier wirklich angeboten wird, wäre „Gmail oder
            Outlook" auch in der Beschreibung eine Untertreibung. */}
        <meta name="description" content="Verbinde dein Postfach mit UseEasy: Gmail und Microsoft 365 per Anmeldung beim Anbieter, IONOS, Strato, GMX, WEB.DE, T-Online und jeder andere Anbieter per IMAP. Jederzeit widerrufbar." />
        <link rel="canonical" href="https://app.useeasy.ai/connect" />
        <meta property="og:url" content="https://app.useeasy.ai/connect" />
        <meta property="og:title" content="Postfach verbinden — UseEasy" />
        <meta property="og:description" content="Verbinde dein Postfach mit UseEasy: Gmail, Microsoft 365 oder jeder Anbieter mit IMAP." />
      </Helmet>

      <div className="mx-auto w-full max-w-lg">
        {/* Markenzeile wie im Login */}
        <div className="flex items-center justify-center gap-2.5 animate-fade-up">
          <img src={logo} alt="UseEasy Logo" className="h-[30px] w-[30px] rounded-lg" />
          <span className="text-[15px] font-semibold tracking-tight">
            Use<span className="text-primary">Easy</span>
          </span>
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] uppercase tracking-[0.06em] text-tx-weak">
            Console
          </span>
        </div>

        <div className="glass-card mt-8 p-6 sm:p-7">
          <header>
            <p className="ue-kicker">Ersteinrichtung</p>
            <h1 className="mt-2 text-[26px] font-semibold leading-[1.12] tracking-[-0.02em] text-foreground">
              Postfach verbinden
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>ca. <span className="tabular">4</span> Minuten</span>
              {stage === "ready" && tenant?.company_name && (
                <>
                  <span className="text-tx-faint">·</span>
                  <span>für <span className="font-medium text-foreground">{tenant.company_name}</span></span>
                </>
              )}
            </p>
          </header>

          {/* ── Die drei Schritte ──────────────────────────────────────── */}
          <ol className="mt-6 space-y-2">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3.5 py-2.5",
                  s.state === "done"
                    ? "border-emerald-surface bg-emerald-surface/40"
                    : s.state === "problem"
                      ? "border-danger/40 bg-danger/5"
                      : "border-line-soft bg-surface",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11.5px] font-semibold tabular",
                    s.state === "done"
                      ? "border-emerald-surface text-emerald-light"
                      : s.state === "problem"
                        ? "border-danger/40 text-danger"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">{s.title}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <Dot tone={STEP_TONE[s.state]} pulse={s.state === "problem"} />
                  {s.hint}
                </span>
              </li>
            ))}
          </ol>

          {/* ── Inhalt je Stage ────────────────────────────────────────── */}
          <div className="mt-6">
            {stage === "loading" && (
              <p className="py-6 text-center text-[13px] text-muted-foreground">Link wird geprüft …</p>
            )}

            {stage === "error" && (
              <div className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/5 px-3.5 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-danger">Verbindung nicht möglich</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{reasonMessage}</p>
                </div>
              </div>
            )}

            {stage === "ready" && (
              <div className="space-y-6">
                <div>
                  <label className="mb-2 block text-[12px] text-muted-foreground">
                    Branche <span className="text-danger">*</span>
                  </label>
                  <Select
                    value={selectedPack}
                    onValueChange={(v) => setSelectedPack(v)}
                    disabled={saving}
                  >
                    <SelectTrigger className="h-[42px] rounded-[10px] border-border bg-muted text-[14px] text-foreground focus:border-primary focus:ring-0 focus:ring-offset-0">
                      <SelectValue placeholder="Branche wählen …" />
                    </SelectTrigger>
                    <SelectContent>
                      {packs.map((p) => (
                        <SelectItem key={p.pack_key} value={p.pack_key}>
                          {p.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                    Steuert, wie UseEasy Ihre E-Mails kategorisiert. Später jederzeit änderbar.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <p className="text-[12px] text-muted-foreground">Postfach per 1-Klick-Anmeldung verbinden:</p>
                  <button
                    type="button"
                    onClick={() => connectMailbox("google")}
                    disabled={saving || !selectedPack || !gmailAvailable}
                    className="w-full rounded-[10px] bg-primary px-4 py-[11px] text-[14px] font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-px hover:shadow-[0_14px_30px_-14px_hsl(var(--emerald)/0.8)] disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                  >
                    {gmailAvailable ? "Gmail / Google Workspace verbinden" : "Gmail folgt in Kürze"}
                  </button>
                  {!gmailAvailable && (
                    <p className="text-center text-[11.5px] leading-relaxed text-amber">
                      Gmail ist vorübergehend nicht verfügbar. Bitte verbinden Sie Ihr Outlook / Microsoft 365
                      Postfach; Gmail wird in Kürze freigeschaltet.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => connectMailbox("outlook")}
                    disabled={saving || !selectedPack}
                    className="w-full rounded-[10px] border border-border bg-muted px-4 py-[11px] text-[13.5px] font-medium text-tx-secondary transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
                  >
                    Outlook / Microsoft 365 verbinden
                  </button>
                  {!selectedPack && (
                    <p className="text-center text-[11.5px] text-muted-foreground">
                      Bitte wählen Sie zuerst Ihre Branche, um fortzufahren.
                    </p>
                  )}
                  <p className="pt-1 text-center text-[11.5px] leading-relaxed text-tx-weak">
                    Google und Microsoft laufen über eine sichere OAuth-2.0-Anmeldung. Den Zugriff
                    können Sie jederzeit widerrufen.
                  </p>
                  {/* D4.1 (Briefing D, 29.07.2026): kein Verweis mehr in die Konsole,
                      sondern der Weg selbst. Die 1-Klick-Anmeldung gibt es nur bei Google
                      und Microsoft; alle anderen Anbieter laufen über IMAP mit Adresse und
                      Passwort, und das ist bei 34 Prozent IONOS gegen 3,8 Prozent Google
                      nicht der Sonderfall, sondern der Regelfall. */}
                  <div className="pt-2">
                    <div className="mb-2 flex items-center gap-3">
                      <span className="h-px flex-1 bg-border" aria-hidden />
                      <span className="text-[11px] uppercase tracking-[0.06em] text-tx-weak">oder</span>
                      <span className="h-px flex-1 bg-border" aria-hidden />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedPack) {
                          toast({
                            title: "Bitte zuerst Branche wählen",
                            description:
                              "Damit UseEasy Ihre E-Mails korrekt kategorisiert, wählen Sie bitte Ihre Branche aus.",
                            variant: "destructive",
                          });
                          return;
                        }
                        void persistPackSelection(selectedPack).then((okPack) => {
                          if (okPack) setImapOpen(true);
                        });
                      }}
                      disabled={saving || !selectedPack}
                      className="w-full rounded-[10px] border border-border bg-muted px-4 py-[11px] text-[13.5px] font-medium text-tx-secondary transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
                    >
                      Anderer Anbieter verbinden (IONOS, Strato, GMX, WEB.DE, T-Online …)
                    </button>
                    <p className="mt-2 text-center text-[11.5px] leading-relaxed text-tx-weak">
                      Diese Anbieter bieten keine 1-Klick-Anmeldung an. UseEasy meldet sich dort
                      mit Adresse und Passwort Ihres Postfachs an, so wie ein E-Mail-Programm.
                      Das Passwort wird verschlüsselt gespeichert und nie angezeigt.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-[11.5px] leading-relaxed text-tx-faint">
          UseEasy erstellt ausschließlich Entwürfe. Es wird nichts versendet, gebucht oder gemeldet,
          bevor Sie freigeben.
        </p>
        <p className="mt-2 text-center text-[11.5px] text-tx-faint">
          Bei Fragen: support@useeasy.ai · Verarbeitung in Frankfurt (eu-central-1)
        </p>
      </div>

      {/* D4.1: derselbe Dialog wie in der Konsole, nur mit dem pre-login-Transportweg.
          invalidateMe={false}, weil es hier noch gar keine ["me"]-Abfrage gibt. */}
      <ImapConnectDialog
        open={imapOpen}
        onOpenChange={setImapOpen}
        initialEmail={tenant?.email ?? ""}
        transport={imapTransport}
        invalidateMe={false}
      />
    </main>
  );
}
