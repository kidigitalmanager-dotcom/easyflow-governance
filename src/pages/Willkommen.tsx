import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dot, type DotTone } from "@/components/ue/primitives";
import logo from "@/assets/useeasy-logo.jpg";

/**
 * Stripe-Erfolgsseite (Self-Serve). URL: app.useeasy.ai/willkommen?session_id={CHECKOUT_SESSION_ID}
 *
 * Holt direkt nach dem Kauf den Connect-Link über GET /v1/onboarding/connect/by-session,
 * sodass der Kunde SOFORT „Postfach verbinden" kann — unabhängig davon, ob die
 * SES-Onboarding-Mail schon angekommen ist (die bleibt als Backup). Solange der
 * Stripe-Webhook den Tenant noch anlegt (status:"pending"), wird kurz gepollt.
 *
 * PRE-LOGIN: kein Auth, direkter fetch zu api.useeasy.ai (wie /connect).
 *
 * Redesign 27.07.2026: Läuft AUSSERHALB des AppLayout und behält deshalb den eigenen
 * zentrierten Rahmen — in der Sprache des neuen Login (dunkler Grund, .glass-card,
 * Emerald-CTA). Der Fortschritt steht als dieselben drei nummerierten Schritte da wie
 * auf /connect, damit der Kunde über beide Seiten hinweg sieht, wo er gerade ist.
 * Der Status ist abgeleitet, nichts wird behauptet: Schritt 2 wird erst grün, wenn
 * der Server den Connect-Link tatsächlich geliefert hat.
 */

const API_BASE = "https://api.useeasy.ai";
const POLL_INTERVAL_MS = 3000;
const POLL_MAX = 10; // ~30 s, dann freundlicher Mail-Hinweis

type Stage = "loading" | "ready" | "pending" | "fallback";

/** Statuspunkt je Schritt: erledigt = emerald, offen = muted. */
type StepState = "done" | "open";
const STEP_TONE: Record<StepState, DotTone> = { done: "emerald", open: "muted" };

export default function Willkommen() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id") || "";
  const [stage, setStage] = useState<Stage>("loading");
  const [connectUrl, setConnectUrl] = useState<string>("");
  const [company, setCompany] = useState<string | null>(null);
  const tries = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) { setStage("fallback"); return; }

    async function poll() {
      tries.current += 1;
      try {
        const res = await fetch(
          `${API_BASE}/v1/onboarding/connect/by-session?session_id=${encodeURIComponent(sessionId)}`,
        );
        const j = await res.json();
        if (cancelled) return;
        if (j.ok && j.status === "ready" && j.connect_url) {
          setConnectUrl(j.connect_url);
          setCompany(j.company_name || null);
          setStage("ready");
          return;
        }
        // status:"pending" → Webhook legt den Tenant noch an → erneut versuchen
        if (j.status === "pending" && tries.current < POLL_MAX) {
          setStage("pending");
          timer.current = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }
        setStage("fallback");
      } catch {
        if (cancelled) return;
        if (tries.current < POLL_MAX) {
          setStage("pending");
          timer.current = setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          setStage("fallback");
        }
      }
    }
    poll();
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [sessionId]);

  const busy = stage === "loading" || stage === "pending";

  /* Dieselben drei Schritte wie auf /connect — hier ist Schritt 1 (Kauf) bereits
     erledigt, Schritt 2 haengt am Webhook-Status, Schritt 3 wartet auf den Kunden. */
  const steps: Array<{ title: string; hint: string; state: StepState }> = [
    { title: "Kauf abgeschlossen", hint: "bestätigt", state: "done" },
    {
      title: "Konto einrichten",
      hint: stage === "ready" ? "fertig" : busy ? "läuft …" : "Mail ist unterwegs",
      state: stage === "ready" ? "done" : "open",
    },
    { title: "Postfach verbinden", hint: stage === "ready" ? "jetzt dran" : "danach", state: "open" },
  ];

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:py-14">
      <Helmet>
        <title>Willkommen bei UseEasy</title>
        <meta name="robots" content="noindex" />
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
            <p className="ue-kicker">Willkommen</p>
            <h1 className="mt-2 text-[26px] font-semibold leading-[1.12] tracking-[-0.02em] text-foreground">
              Vielen Dank für Ihren Kauf
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {busy
                ? <>Ihr UseEasy-Konto wird gerade eingerichtet{company ? ` für ${company}` : ""} — das dauert nur wenige Sekunden.</>
                : stage === "ready"
                  ? <>Ihr Konto ist bereit{company ? <> für <span className="font-medium text-foreground">{company}</span></> : ""}. Verbinden Sie jetzt Ihr Postfach, dann legt UseEasy sofort los.</>
                  : <>Ihr Kauf ist eingegangen. Den Zugang schicken wir Ihnen per E-Mail.</>}
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
                    : "border-line-soft bg-surface",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11.5px] font-semibold tabular",
                    s.state === "done" ? "border-emerald-surface text-emerald-light" : "border-border text-muted-foreground",
                  )}
                >
                  {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">{s.title}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  {s.title === "Konto einrichten" && busy ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : (
                    <Dot tone={STEP_TONE[s.state]} />
                  )}
                  {s.hint}
                </span>
              </li>
            ))}
          </ol>

          {/* ── Inhalt je Stage ────────────────────────────────────────── */}
          <div className="mt-6 space-y-4">
            {busy && (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Einen Moment bitte — sobald Ihr Konto steht, erscheint hier der Knopf zum
                Verbinden. Sie müssen die Seite nicht neu laden.
              </p>
            )}

            {stage === "ready" && (
              <>
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Es wird nichts automatisch versendet</span> — die
                  Sende-Entscheidung bleibt immer bei Ihnen.
                </p>
                <a
                  href={connectUrl}
                  className="sheen block w-full rounded-[10px] bg-primary px-4 py-[11px] text-center text-[14px] font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-px hover:shadow-[0_14px_30px_-14px_hsl(var(--emerald)/0.8)]"
                >
                  Postfach verbinden
                </a>
                <p className="text-[11.5px] leading-relaxed text-tx-weak">
                  Sie haben außerdem eine E-Mail mit diesem Link und Ihren Unterlagen (Quickstart, AVV,
                  Rechnung) erhalten.
                </p>
              </>
            )}

            {stage === "fallback" && (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Wir haben Ihnen soeben eine E-Mail <span className="font-medium text-foreground">„Postfach
                verbinden“</span> geschickt (bitte ggf. auch den Spam-Ordner prüfen). Über den Button in
                dieser Mail verbinden Sie Ihr Postfach. Falls nichts ankommt, melden Sie sich gern unter{" "}
                <a href="mailto:support@useeasy.ai" className="text-primary underline-offset-4 hover:underline">
                  support@useeasy.ai
                </a>.
              </p>
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
    </main>
  );
}
