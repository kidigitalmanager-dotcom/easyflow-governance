import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Lock, ShieldCheck, ShieldAlert, Activity, Plug, CreditCard, Landmark, Users, Megaphone, LifeBuoy,
  ChevronRight, ArrowRight, Sparkles, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useMySignals, useCapAccountBySlug, useRecordConsent, useRevokeConsent } from "@/hooks/use-capital";
import { AccountDashboard } from "@/components/capital/AccountDashboard";
import { ReportExportButton } from "@/components/capital/ReportExportButton";
import { IllustrativeBadge, ScoreBadge } from "@/components/capital/CapitalBits";
import { CapitalStatementUpload } from "@/components/capital/CapitalStatementUpload";
import { CapitalBankConnect } from "@/components/capital/CapitalBankConnect";
import { CapitalAccountingConnect } from "@/components/capital/CapitalAccountingConnect";
import { CapitalStripeConnect } from "@/components/capital/CapitalStripeConnect";
import { CapitalShopifyConnect } from "@/components/capital/CapitalShopifyConnect";
import { CapitalMetaAdsConnect } from "@/components/capital/CapitalMetaAdsConnect";
import { CapitalTicketingConnect } from "@/components/capital/CapitalTicketingConnect";
import HubSpotIntegration from "@/components/HubSpotIntegration";
import { RiskShieldCard } from "@/components/capital/RiskShieldCard";
import { ComplianceRadarCard } from "@/components/capital/ComplianceRadarCard";
import { FoerderRadarCard } from "@/components/capital/FoerderRadarCard";
import { JanaChat } from "@/components/capital/JanaChat";
import { WeeklyPriorities } from "@/components/capital/WeeklyPriorities";
import { UpsellSuggestionCard } from "@/components/capital/UpsellSuggestionCard";
import { JanaKnowledgeProposalCard } from "@/components/JanaKnowledgeProposalCard";
import { MorningBriefing } from "@/components/capital/MorningBriefing";
import { RoiSavingsCard } from "@/components/RoiSavingsCard";
import { SignalAmpel } from "@/components/ue/SignalAmpel";
import { ReturnsInsightsCard } from "@/components/ReturnsInsightsCard";
import { MorningBriefingDialog } from "@/components/capital/MorningBriefingDialog";
import { OnboardingCoach } from "@/components/onboarding/OnboardingCoach";
import { useOnboardingRunner } from "@/components/onboarding/OnboardingRunner";

const SELF_SLUG = "self_demo";
const TERMS_VERSION = "v1.0";
const SECTION_STORAGE_KEY = "ue.signale.section";
const SIGNALE_TOUR_DEMO = "signale-verstehen";

type SectionKey = "signale" | "jana" | "risk_shield" | "foerder" | "quellen" | "freigabe";
const SECTION_KEYS: SectionKey[] = ["signale", "jana", "risk_shield", "foerder", "quellen", "freigabe"];
const isSectionKey = (v: string | null): v is SectionKey => !!v && (SECTION_KEYS as string[]).includes(v);

const SECTIONS: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: "signale", label: "Signale & Gesundheit", icon: Activity },
  { key: "jana", label: "Jana fragen", icon: Sparkles },
  { key: "risk_shield", label: "Frühwarnung", icon: ShieldAlert },
  { key: "foerder", label: "Förder-Radar", icon: Landmark },
  { key: "quellen", label: "Datenquellen", icon: Plug },
  { key: "freigabe", label: "Datenfreigabe", icon: ShieldCheck },
];

// ── Datenquellen-Katalog ──────────────────────────────────────────────────────
// Jede Quelle bringt ihre eigene Connect-Karte mit. Die Karten bleiben IMMER
// gemountet (nur per CSS ein-/ausgeblendet), damit ihre OAuth-Callback-Effekte
// (?capital_stripe=callback etc.) und Status-Hooks unverändert laufen.
type SourceDef = {
  key: string;
  label: string;
  sourceKeys: string[]; // provenance.sources_used → "aktiv" wenn eine davon Signale liefert
  manual?: boolean;     // Export-Upload: kein dauerhafter Anschluss → neutral "manuell"
  card: React.ReactNode;
};
type GroupDef = { key: string; label: string; icon: LucideIcon; sources: SourceDef[] };

const GROUPS: GroupDef[] = [
  {
    key: "umsatz", label: "Umsatz", icon: CreditCard,
    sources: [
      { key: "stripe", label: "Stripe", sourceKeys: ["stripe"], card: <CapitalStripeConnect /> },
      { key: "shopify", label: "Shopify", sourceKeys: ["shopify"], card: <CapitalShopifyConnect /> },
    ],
  },
  {
    key: "finanzen", label: "Finanzen", icon: Landmark,
    sources: [
      { key: "bank", label: "Bank-Konto (finAPI)", sourceKeys: ["finapi", "bank_psp"], card: <CapitalBankConnect /> },
      { key: "buchhaltung", label: "Buchhaltung (Maesn)", sourceKeys: ["maesn"], card: <CapitalAccountingConnect /> },
      { key: "export", label: "Bank-/DATEV-Export", sourceKeys: [], manual: true, card: <CapitalStatementUpload /> },
    ],
  },
  {
    key: "crm", label: "CRM", icon: Users,
    sources: [
      { key: "hubspot", label: "HubSpot", sourceKeys: ["hubspot_crm"], card: <HubSpotIntegration /> },
    ],
  },
  {
    key: "marketing", label: "Marketing", icon: Megaphone,
    sources: [
      { key: "meta_ads", label: "Meta Ads", sourceKeys: ["meta_ads"], card: <CapitalMetaAdsConnect /> },
    ],
  },
  {
    key: "support", label: "Support/Service", icon: LifeBuoy,
    sources: [
      { key: "ticketing", label: "Ticketing (HubSpot/Zendesk/Freshdesk)", sourceKeys: ["ticketing"], card: <CapitalTicketingConnect /> },
    ],
  },
];

// cap_metrics.connect_source → passende Gruppe/Quelle in der Datenquellen-Sub-Sidebar.
// Deep-Link aus einer "nicht verbunden"-KPI springt genau dorthin.
const CONNECT_TARGET: Record<string, { group: string; source: string }> = {
  stripe: { group: "umsatz", source: "stripe" },
  shopify: { group: "umsatz", source: "shopify" },
  bank: { group: "finanzen", source: "bank" },
  maesn: { group: "finanzen", source: "buchhaltung" },
  hubspot: { group: "crm", source: "hubspot" },
  meta_ads: { group: "marketing", source: "meta_ads" },
  ticketing: { group: "support", source: "ticketing" },
};

// Kommt der Nutzer von einem OAuth-Redirect zurück, springt er direkt in die
// richtige Gruppe/Quelle. Wird EINMAL beim ersten Render gelesen (bevor eine
// Karte window.location.search per replaceState aufräumt).
function readCallbackTarget(): { section: SectionKey; group: string; source: string } | null {
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("capital_stripe") === "callback") return { section: "quellen", group: "umsatz", source: "stripe" };
    if (sp.get("capital_shopify") === "callback") return { section: "quellen", group: "umsatz", source: "shopify" };
    if (sp.get("capital_bank") === "callback") return { section: "quellen", group: "finanzen", source: "bank" };
    if (sp.get("capital_acct") === "callback") return { section: "quellen", group: "finanzen", source: "buchhaltung" };
    if (sp.get("capital_meta_ads") === "callback") return { section: "quellen", group: "marketing", source: "meta_ads" };
    if (sp.get("hubspot")) return { section: "quellen", group: "crm", source: "hubspot" };
  } catch {
    /* ignore */
  }
  return null;
}

function StatusChip({ state }: { state: "active" | "idle" | "manual" }) {
  if (state === "manual")
    return (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-muted text-muted-foreground border-border">
        manuell
      </span>
    );
  const active = state === "active";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border",
        active
          ? "bg-emerald-surface/70 text-emerald-light border-emerald-surface"
          : "bg-muted text-muted-foreground border-border",
      )}
    >
      {/* Token statt Rohfarbe (Design-Vertrag): bg-emerald-500 kannte das Theme nicht. */}
      <span className={cn("w-1.5 h-1.5 rounded-full", active ? "bg-primary" : "bg-muted-foreground/40")} />
      {active ? "aktiv" : "keine Signale"}
    </span>
  );
}

export default function Signale() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Own signals via the authenticated my-signals edge function (tenant sees its OWN data even
  // without consent). Fall back to the demo account only when the user owns no cap_account.
  const mine = useMySignals();
  const hasOwn = !!mine.data?.has_own_account;
  const fallback = useCapAccountBySlug(SELF_SLUG, { enabled: !mine.isLoading && !hasOwn });
  const record = useRecordConsent();
  const revoke = useRevokeConsent();
  const [agree, setAgree] = useState(false);

  const account = hasOwn ? mine.data!.account : (fallback.data ?? null);
  const dash = hasOwn ? (mine.data!.dash ?? undefined) : undefined;
  const slug = account?.slug ?? SELF_SLUG;
  const isLoading = mine.isLoading || (!hasOwn && fallback.isLoading);
  const consented = !!account?.consent_data_sharing;
  const consentDate = account?.consent_at ? new Date(account.consent_at).toLocaleDateString("de-DE") : null;

  const runner = useOnboardingRunner();
  const [searchParams] = useSearchParams();

  // Initial UI state: ?sec= (Onboarding-Durchlauf) > OAuth-Rücksprung > gemerkter Bereich > Default.
  const boot = useMemo(() => {
    const cb = readCallbackTarget();
    let stored: SectionKey | null = null;
    try {
      const s = localStorage.getItem(SECTION_STORAGE_KEY);
      if (s === "signale" || s === "quellen" || s === "freigabe") stored = s;
    } catch {
      /* ignore */
    }
    let secParam: SectionKey | null = null;
    try {
      const s = new URLSearchParams(window.location.search).get("sec");
      if (isSectionKey(s)) secParam = s;
    } catch {
      /* ignore */
    }
    return {
      section: (secParam ?? cb?.section ?? stored ?? "signale") as SectionKey,
      groups: cb ? [cb.group] : [],
      sources: cb ? [cb.source] : [],
    };
  }, []);

  const [section, setSection] = useState<SectionKey>(boot.section);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(boot.groups));
  const [openSources, setOpenSources] = useState<Set<string>>(() => new Set(boot.sources));

  // Onboarding-Durchlauf schaltet die /signale-Sektion per ?sec= (Szenario-Runner).
  // Wir strippen den Param NICHT (race-frei); Sidebar-Klicks ändern nur den State, nicht die URL.
  useEffect(() => {
    const sec = searchParams.get("sec");
    if (isSectionKey(sec)) setSection(sec);
  }, [searchParams]);

  useEffect(() => {
    try {
      localStorage.setItem(SECTION_STORAGE_KEY, section);
    } catch {
      /* ignore */
    }
  }, [section]);

  const toggleGroup = (k: string) =>
    setOpenGroups((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const toggleSource = (k: string) =>
    setOpenSources((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // Deep-Link aus einer "nicht verbunden"-KPI → passende Gruppe/Quelle aufklappen.
  const goConnect = (cs: string) => {
    const t = CONNECT_TARGET[cs];
    setSection("quellen");
    if (t) {
      setOpenGroups((prev) => new Set(prev).add(t.group));
      setOpenSources((prev) => new Set(prev).add(t.source));
    }
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ }
  };

  // Welche Quellen liefern gerade Signale? Rein aus den bereits geladenen
  // Metric-Values (provenance.sources_used) — keine zusätzlichen Hooks.
  const statusKnown = !!dash;
  const usedSources = useMemo(() => {
    const s = new Set<string>();
    for (const v of dash?.values ?? []) for (const k of (v.provenance?.sources_used ?? []) as string[]) s.add(String(k));
    return s;
  }, [dash]);
  const isActive = (sd: SourceDef) => sd.sourceKeys.some((k) => usedSources.has(k));
  const groupCount = (g: GroupDef) => {
    const conn = g.sources.filter((s) => !s.manual);
    return { active: conn.filter(isActive).length, total: conn.length };
  };
  let overallActive = 0;
  let overallTotal = 0;
  for (const g of GROUPS) {
    const c = groupCount(g);
    overallActive += c.active;
    overallTotal += c.total;
  }
  const anyIdle = statusKnown && GROUPS.some((g) => g.sources.some((s) => !s.manual && !isActive(s)));

  const latestHealth = dash?.health?.length ? dash.health[dash.health.length - 1].health_score : null;
  const title = !account
    ? "Signale"
    : account.account_type === "demo"
      ? "Signale — Demo-Profil"
      : account.name || "Signale";

  const confirm = () => {
    record.mutate(
      { slug, email: user?.email ?? "unknown", version: TERMS_VERSION },
      {
        onSuccess: () =>
          toast({ title: "Datenfreigabe gespeichert", description: "Dein Profil ist jetzt für die Investorenseite freigegeben." }),
        onError: (e: unknown) =>
          toast({
            title: "Fehler",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          }),
      },
    );
  };
  const doRevoke = () =>
    revoke.mutate({ slug }, { onSuccess: () => { setAgree(false); toast({ title: "Freigabe widerrufen" }); } });

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (!account) {
    return (
      <Card className="glass-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Kein Profil gefunden.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <MorningBriefingDialog />
      {/* ── Sticky Kontext-Header: Firma + Health + Freigabe-Status ── */}
      <div data-tour="header" className="sticky top-0 z-20 -mx-8 -mt-8 px-8 py-3 bg-background/85 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="ue-kicker leading-none">Signale · Gesundheit &amp; Frühwarnung</p>
              <h1 className="text-base font-semibold tracking-tight text-foreground truncate leading-tight mt-0.5">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => runner.startDemo(SIGNALE_TOUR_DEMO)}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border border-primary/25 bg-primary/5 text-primary hover:bg-primary/10"
              title="Geführte Tour"
            >
              <Sparkles className="w-3 h-3" /> Tour
            </button>
            {latestHealth != null && (
              <div className="hidden sm:flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Health</span>
                <ScoreBadge value={latestHealth} size="sm" />
              </div>
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border",
                consented
                  ? "bg-emerald-surface/70 text-emerald-light border-emerald-surface"
                  : "bg-muted text-muted-foreground border-border",
              )}
            >
              <ShieldCheck className="w-3 h-3" /> {consented ? "Freigegeben" : "Privat"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Sub-Sidebar (links, ~208px) + Inhalt. Auf Mobile: Segmented oben. ── */}
      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible lg:w-52 lg:flex-shrink-0 -mx-1 px-1 lg:mx-0 lg:px-0 scrollbar-none">
          {SECTIONS.map((s) => {
            const activeSec = section === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                aria-current={activeSec ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap lg:w-full text-left",
                  activeSec ? "bg-emerald-surface/60 text-emerald-light border border-emerald-surface" : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-surface-hover",
                )}
              >
                <s.icon className="w-[18px] h-[18px] shrink-0" />
                <span className="flex-1 truncate">{s.label}</span>
                {s.key === "quellen" && statusKnown && overallTotal > 0 && (
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full border tabular-nums",
                      overallActive > 0
                        ? "bg-emerald-surface/70 text-emerald-light border-emerald-surface"
                        : "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {overallActive}/{overallTotal}
                  </span>
                )}
                {s.key === "freigabe" && (
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", consented ? "bg-primary" : "bg-tx-weak")} />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0">
          {/* ══ Bereich 1: Signale & Gesundheit (nur Auswertung) ══ */}
          <section className={cn("space-y-4", section !== "signale" && "hidden")}>
            <OnboardingCoach setSection={setSection} onStartTour={() => runner.startDemo(SIGNALE_TOUR_DEMO)} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium text-muted-foreground">
                  {consented ? "Dein freigegebenes Profil" : "Vorschau deines Profils (noch nicht freigegeben)"}
                </h2>
                {account.account_type === "demo" && <IllustrativeBadge />}
              </div>
              <ReportExportButton account={account} data={dash} variant="tenant" />
            </div>
            <MorningBriefing />
            <RoiSavingsCard />
            <div data-tour="weekly"><WeeklyPriorities /></div>
            <UpsellSuggestionCard />
            <JanaKnowledgeProposalCard />
            <AccountDashboard account={account} data={dash} variant="tenant" onConnectSource={goConnect} />
            <ReturnsInsightsCard />
            {anyIdle && (
              <button
                onClick={() => setSection("quellen")}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10"
              >
                <span className="flex items-center gap-2.5 text-sm text-foreground">
                  <Plug className="w-4 h-4 text-primary shrink-0" />
                  Für belastbarere Signale weitere Datenquellen verbinden.
                </span>
                <span className="flex items-center gap-1 text-sm font-medium text-primary shrink-0">
                  Datenquellen <ArrowRight className="w-4 h-4" />
                </span>
              </button>
            )}
          </section>

          {/* ══ Bereich 1b: Fruehwarnung ══
              Redesign 27.07.2026: /signale und /fruehwarnung sind zusammengefuehrt —
              der Entwurf kennt nur EINEN Ort fuer "was warnt". /fruehwarnung leitet
              hierher; der Sidebar-Punkt bleibt bestehen und zeigt auf ?sec=risk_shield.
              Es faellt nichts weg: Risk Shield und Compliance-Radar sind dieselben
              Karten, die vorher auf /fruehwarnung standen. */}
          <section className={cn("space-y-4", section !== "risk_shield" && "hidden")}>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Frühwarnung</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Alles, was warnt, an einem Ort: Partner-Watchlist und eigene Rechts- und
                Compliance-Lage. Eine Ampel-Sprache: Bestätigt · Beobachtung · Stabil.
              </p>
            </div>
            {/* 27.07.2026: die EINE Ampel + die Signal-Tabelle aus dem Entwurf.
                Beides fehlte; die Seite war bis dahin nur eine Komposition der
                alten Karten. Die Einordnung bestaetigt/beobachtung ist die
                bestehende, aus zwei Backtests kalibrierte Regel. */}
            <SignalAmpel alerts={dash?.alerts} loading={mine.isLoading} />
            <RiskShieldCard />
            <ComplianceRadarCard />
            <p className="text-xs text-tx-weak leading-relaxed">
              Bewertung nur aus öffentlichen Signalen bzw. dem eigenen Postfach. Keine
              Rechtsberatung. Investoren sehen ausschließlich aggregierte Indizes, nie
              Einzel-Signale.
            </p>
          </section>

          {/* ══ Bereich 1c: Jana fragen (read-only Chat ueber die eigenen Signale) ══ */}
          <section data-tour="jana" className={cn(section !== "jana" && "hidden")}>
            <JanaChat account={account} />
          </section>

          {/* ══ Bereich 1c: Förder-Radar (latentes Kapital) ══ */}
          <section className={cn(section !== "foerder" && "hidden")}>
            <FoerderRadarCard />
          </section>

          {/* ══ Bereich 2: Datenquellen verbinden (2 Aufklapp-Ebenen) ══ */}
          <section data-tour="quellen" className={cn(section !== "quellen" && "hidden")}>
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">Datenquellen verbinden</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Je mehr Quellen verbunden sind, desto belastbarer die Signale. Es verlassen nur aggregierte 0–100-Werte
                das System — nie Rohdaten. Gruppe aufklappen → Quelle wählen → verbinden.
              </p>
            </div>

            <div className="space-y-3">
              {GROUPS.map((g) => {
                const c = groupCount(g);
                const gOpen = openGroups.has(g.key);
                const GIcon = g.icon;
                return (
                  <div key={g.key} className="rounded-xl border border-border bg-card/40 overflow-hidden">
                    {/* Ebene 1: Gruppe mit Zähler */}
                    <button
                      onClick={() => toggleGroup(g.key)}
                      aria-expanded={gOpen}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                        <GIcon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <span className="flex-1 text-sm font-medium text-foreground">{g.label}</span>
                      {statusKnown && (
                        <span
                          className={cn(
                            "text-[11px] font-medium px-2 py-0.5 rounded-full border tabular-nums",
                            // Tokens statt Rohfarben — gleiche Optik wie der StatusChip oben.
                            c.active > 0
                              ? "bg-emerald-surface/70 text-emerald-light border-emerald-surface"
                              : "bg-muted text-muted-foreground border-border",
                          )}
                        >
                          {c.active}/{c.total} aktiv
                        </span>
                      )}
                      <ChevronRight
                        className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", gOpen && "rotate-90")}
                      />
                    </button>

                    {/* Ebene 2: Quellen-Zeilen mit Einzel-Chips (immer gemountet, nur ausgeblendet) */}
                    <div className={cn("border-t border-border divide-y divide-border", !gOpen && "hidden")}>
                      {g.sources.map((sd) => {
                        const sOpen = openSources.has(sd.key);
                        const chip: "active" | "idle" | "manual" = sd.manual ? "manual" : isActive(sd) ? "active" : "idle";
                        return (
                          <div key={sd.key}>
                            <button
                              onClick={() => toggleSource(sd.key)}
                              aria-expanded={sOpen}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/30"
                            >
                              <span className="flex-1 text-sm text-foreground">{sd.label}</span>
                              {(sd.manual || statusKnown) && <StatusChip state={chip} />}
                              <ChevronRight
                                className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", sOpen && "rotate-90")}
                              />
                            </button>
                            {/* Ebene 3: die eigentliche Connect-Karte */}
                            <div className={cn("px-3 pb-3", !sOpen && "hidden")}>{sd.card}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground mt-4">
              Weitere Quellen (Dateien, Kanäle) findest du unter{" "}
              <a href="/einstellungen" className="text-primary hover:underline">Einstellungen → Integrationen</a>.
            </p>
          </section>

          {/* ══ Bereich 3: Datenfreigabe (Consent) ══ */}
          <section data-tour="freigabe" className={cn(section !== "freigabe" && "hidden")}>
            {!consented ? (
              <Card className="glass-card border-primary/20">
                <CardContent className="pt-6">
                  <div className="max-w-xl mx-auto space-y-4">
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Lock className="w-7 h-7 text-primary" />
                      </div>
                      <h2 className="text-lg font-semibold text-foreground">Einmalige Datenfreigabe</h2>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Read-only, PII-minimiert, EU/Frankfurt. Es verlassen <span className="text-foreground font-medium">nur aggregierte
                        0–100-Werte</span> das System — niemals Mail-Inhalte. Einmal bestätigt, dauerhaft gespeichert &amp; jederzeit widerrufbar.
                      </p>
                    </div>
                    <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 cursor-pointer">
                      <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
                      <span className="text-sm text-foreground leading-relaxed">
                        Ich bestätige, dass ich berechtigt bin, diese Unternehmensdaten zu <span className="font-medium">teilen und zu speichern</span>,
                        und stimme der Weitergabe der aggregierten 0–100-Kennzahlen an die Investorenseite zu. <span className="text-muted-foreground">(AGB {TERMS_VERSION})</span>
                      </span>
                    </label>
                    <div className="flex justify-center">
                      <Button onClick={confirm} disabled={!agree || record.isPending} className="h-11 px-6 gap-2">
                        <ShieldCheck className="w-4 h-4" /> {record.isPending ? "Wird gespeichert…" : "Bestätigen & freigeben"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* Tokens statt Rohfarben: emerald-500/400 kamen aus der Tailwind-Palette,
                 nicht aus dem Theme — im dunklen Konsolen-Look ein Fremdkoerper. */
              <Card className="glass-card border-emerald-surface">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="w-5 h-5 text-emerald-light mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-foreground">An Investoren freigegeben</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Einmalige Freigabe gespeichert{consentDate ? ` am ${consentDate}` : ""} (AGB {TERMS_VERSION}). Dein Profil erscheint auf der Investorenseite.
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={doRevoke} disabled={revoke.isPending} className="text-muted-foreground hover:text-destructive">
                      Widerrufen
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
