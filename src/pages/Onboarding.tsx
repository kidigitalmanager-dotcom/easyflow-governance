import {
  Activity, ListChecks, Tag, FileSpreadsheet, Brain, Bot, Sparkles, Play, RotateCcw,
  Check, Clock, Plug, MailCheck, Send, type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { DEMOS, DEMO_ORDER, COPY, type Demo } from "@/data/onboarding-content";
import { useOnboardingProgress, useOnboardingState } from "@/hooks/use-onboarding";
import { useMe } from "@/hooks/use-api";
import { useOnboardingRunner } from "@/components/onboarding/OnboardingRunner";
import { demoDone, demosDoneCount } from "@/lib/onboarding";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, SectionCard, Dot, type DotTone } from "@/components/ue/primitives";
import type { MailboxHealth } from "@/lib/api-client";

/* Onboarding — Redesign 27.07.2026.

   Zwei Bereiche, beide als nummerierte Schritte mit Statuspunkt:

   1. "Ersteinrichtung" — die drei Schritte aus dem Entwurf (ca. 4 Minuten). Der
      Status kommt ausschliesslich aus echten Server-Fakten (useOnboardingState:
      /me, /stats, my-signals) — nichts wird geschaetzt, offene Schritte bleiben
      grau statt vorschnell gruen.

      ⚠ Der Entwurf zeigt an dieser Stelle zusaetzlich einen DNS-Check je Domain.
      Dafuer gibt es im Backend KEINEN Endpoint (kein SPF/DKIM/DMARC/MX-Check im
      gesamten Client). Ein erfundener gruener Haken waere hier das Gegenteil von
      Vertrauen — deshalb steht stattdessen die echte, vorhandene Pruefung:
      der Poller-Health je verbundenem Postfach (mailbox_health[]). Meldet der
      Server dort "error", wird Schritt 1 rot statt gruen.

   2. Der Demo-Katalog — dieselben wiederholbaren Durchlaeufe wie bisher, nur als
      nummerierte Liste statt als Kachel-Raster. Keine Demo, kein Start-Knopf und
      keine Fortschritts-Anzeige ist entfallen. */

// Icon-Namen aus dem Demo-Katalog -> lucide-Komponenten (statische Zuordnung, kein dynamic import).
const ICONS: Record<string, LucideIcon> = {
  Activity, ListChecks, Tag, FileSpreadsheet, Brain, Bot,
};

/** Ein Schritt der Ersteinrichtung: erledigt = emerald, Problem = danger, offen = muted. */
type StepState = "done" | "problem" | "open";
const STEP_TONE: Record<StepState, DotTone> = { done: "emerald", problem: "danger", open: "muted" };

type SetupStep = {
  key: string;
  title: string;
  body: string;
  state: StepState;
  icon: LucideIcon;
  href: string;
  cta: string;
};

function StepRow({ index, step }: { index: number; step: SetupStep }) {
  const Icon = step.icon;
  return (
    <li className="flex items-start gap-3.5 px-4 py-3.5">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11.5px] font-semibold tabular",
          step.state === "done"
            ? "border-emerald-surface bg-emerald-surface text-emerald-light"
            : step.state === "problem"
              ? "border-danger/40 text-danger"
              : "border-border text-muted-foreground",
        )}
      >
        {step.state === "done" ? <Check className="h-3.5 w-3.5" /> : index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <Dot tone={STEP_TONE[step.state]} pulse={step.state === "problem"} />
          {step.title}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{step.body}</p>
      </div>
      {step.state === "done" ? null : (
        <Link
          to={step.href}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-border px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Icon className="h-3.5 w-3.5" /> {step.cta}
        </Link>
      )}
    </li>
  );
}

function DemoRow({
  index,
  demo,
  done,
  onStart,
}: {
  index: number;
  demo: Demo;
  done: boolean;
  onStart: () => void;
}) {
  const Icon = ICONS[demo.icon] ?? Sparkles;
  return (
    <li className="flex flex-wrap items-center gap-x-3.5 gap-y-3 px-4 py-3.5 transition-colors hover:bg-surface-hover">
      <span className="w-5 shrink-0 text-right text-[12px] font-semibold tabular text-tx-weak">{index}</span>
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
          done ? "border-emerald-surface bg-emerald-surface/60" : "border-border bg-muted",
        )}
      >
        <Icon className={cn("h-4 w-4", done ? "text-emerald-light" : "text-primary")} />
      </span>
      <div className="min-w-0 flex-1 basis-64">
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium leading-tight text-foreground">
          <Dot tone={done ? "emerald" : "muted"} />
          {demo.title}
          {done && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-surface bg-emerald-surface/70 px-2 py-0.5 text-[10px] font-medium text-emerald-light">
              <Check className="h-3 w-3" /> {COPY.demoDoneChip}
            </span>
          )}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{demo.summary}</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Clock className="h-3.5 w-3.5" /> ca. <span className="tabular">{demo.durationMin}</span> Min
      </span>
      <button
        type="button"
        onClick={onStart}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
          done
            ? "border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {done ? <><RotateCcw className="h-3.5 w-3.5" /> {COPY.demoRestart}</> : <><Play className="h-3.5 w-3.5" /> {COPY.demoStart}</>}
      </button>
    </li>
  );
}

export default function Onboarding() {
  const progressQ = useOnboardingProgress();
  const { startDemo } = useOnboardingRunner();
  // Ersteinrichtung: dieselben abgeleiteten Fakten, die auch die Nudges auf "Heute"
  // benutzen — eine Wahrheit, kein zweiter Rechenweg.
  const st = useOnboardingState();
  const me = useMe();

  const prog = progressQ.data ?? {};
  const doneCount = demosDoneCount(prog, DEMO_ORDER);
  const total = DEMOS.length;
  const allDone = total > 0 && doneCount === total;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  // Echte Postfach-Pruefung statt erfundenem DNS-Check: meldet der Poller fuer ein
  // verbundenes Postfach "error", ist Schritt 1 ein Problem und kein Haken.
  const mailboxError = ((me.data?.mailbox_health ?? []) as MailboxHealth[]).some((h) => h.status === "error");

  const steps: SetupStep[] = [
    {
      key: "mailbox",
      title: "Postfach verbinden",
      body: mailboxError
        ? "Ein verbundenes Postfach meldet einen Verbindungsfehler. Bitte die Verbindung erneuern, sonst liest UseEasy nichts mehr."
        : "Gmail oder Outlook per OAuth verbinden. UseEasy liest mit, sendet aber nichts.",
      state: mailboxError ? "problem" : st.facts.mailboxConnected ? "done" : "open",
      icon: Plug,
      href: "/einstellungen?tab=integrations",
      cta: mailboxError ? "Verbindung prüfen" : "Verbinden",
    },
    {
      key: "first_classification",
      title: "Erste E-Mail einordnen lassen",
      body: "Sobald die erste Mail eingeht, sortiert UseEasy sie ein und legt bei Bedarf einen Entwurf an.",
      state: st.facts.firstClassification ? "done" : "open",
      icon: MailCheck,
      href: "/review",
      cta: "Zu den Freigaben",
    },
    {
      key: "draft_approved",
      title: "Ersten Entwurf freigeben",
      body: "Der eigentliche Moment: du liest den Entwurf, gibst ihn frei — gesendet wird immer erst durch dich.",
      state: st.facts.draftApproved ? "done" : "open",
      icon: Send,
      href: "/review",
      cta: "Entwürfe ansehen",
    },
  ];

  const setupDone = steps.filter((s) => s.state === "done").length;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Einrichtung & Training"
        title={COPY.onboardingTitle}
        subtitle={COPY.onboardingSubtitle}
      />

      {/* ── Ersteinrichtung: 3 Schritte ─────────────────────────────────── */}
      <SectionCard
        title="Ersteinrichtung"
        subtitle="Drei Schritte, bis UseEasy für dich arbeitet."
        bodyClassName="p-0"
        action={
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> ca. <span className="tabular">4</span> Minuten
          </span>
        }
      >
        {me.isError ? (
          <div className="p-4">
            {/* Fehler ≠ leer: ohne /me stuenden hier sonst drei graue "offen"-Punkte,
                obwohl das Postfach laengst verbunden sein kann. */}
            <QueryErrorNotice
              label="Der Einrichtungs-Status konnte nicht geladen werden."
              onRetry={() => me.refetch()}
              retrying={me.isFetching}
            />
          </div>
        ) : st.loading ? (
          /* Waehrend des Ladens KEINE Schritte als "offen" behaupten. */
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-line-soft">
              {steps.map((s, i) => (
                <StepRow key={s.key} index={i + 1} step={s} />
              ))}
            </ul>
            <p className="border-t border-line-soft px-4 py-2.5 text-[11.5px] text-muted-foreground">
              <span className="tabular">{setupDone}</span> von <span className="tabular">{steps.length}</span> Schritten
              erledigt. Der Status kommt aus deinem Konto — nichts davon musst du selbst abhaken.
            </p>
          </>
        )}
      </SectionCard>

      {/* ── Fortschritt über alle Durchläufe ────────────────────────────── */}
      <SectionCard
        title="Geführte Durchläufe"
        subtitle={COPY.onboardingRestartHint}
        action={
          !progressQ.isError ? (
            <div className="hidden items-center gap-2 sm:flex">
              <div className="h-2 w-40 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-[1200ms] ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="tabular text-[11.5px] font-medium text-muted-foreground">{pct} %</span>
            </div>
          ) : null
        }
        bodyClassName="p-0"
      >
        {progressQ.isError ? (
          <div className="p-4">
            {/* Fehler ≠ leer: ohne Fortschritt saehe jeder Durchlauf unerledigt aus.
                Die Durchlaeufe selbst bleiben startbar. */}
            <QueryErrorNotice
              label="Dein Fortschritt konnte nicht geladen werden."
              onRetry={() => progressQ.refetch()}
              retrying={progressQ.isFetching}
            />
          </div>
        ) : (
          <p className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5 text-[12.5px] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
            {allDone
              ? COPY.onboardingCatalogDone
              : <>
                  <span className="tabular">{doneCount}</span> von <span className="tabular">{total}</span> Durchläufen
                  abgeschlossen
                </>}
          </p>
        )}
        <ul className="divide-y divide-line-soft">
          {DEMOS.map((demo, i) => (
            <DemoRow
              key={demo.slug}
              index={i + 1}
              demo={demo}
              done={demoDone(prog, demo.slug)}
              onStart={() => startDemo(demo.slug)}
            />
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
