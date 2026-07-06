// ─────────────────────────────────────────────────────────────────────────────
// CapitalReport.tsx — Investoren-Report als druckbares Dokument (Print → PDF).
// "Report auf Knopfdruck": rendert die bereits live vorhandenen Capital-Layer-
// Daten (Health, Kategorien, KPIs mit Provenance, Alerts, Benchmark, Freshness,
// Verifikations-Tier) als Due-Diligence-taugliches Dokument. KEIN Backend-Touch,
// KEINE PDF-Lib: sauberes Print-CSS + window.print() (Nutzer speichert als PDF).
//
// Ehrlichkeit trägt durch: is_illustrative sichtbar, Freshness/Coverage ehrlich,
// Backtest nur mit in-sample-Einordnung, keine zugesagten Renditen.
//
// Zweisprachig: DE (Standard) + EN-Umschalter im Report-Kopf. Report-Rahmen
// (Überschriften, Methodik, Disclaimer) ist übersetzt; KPI-/Quellen-Bezeichner
// und Begründungen stammen aus der Datenbasis (Deutsch) und bleiben unverändert.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { capital } from "@/integrations/capital/client";
import {
  useCapCatalog, useHealthSeries, useCategorySeries, useMetricValues,
  useHealthBenchmark, useFreshness, useVerificationTiers,
} from "@/hooks/use-capital";
import { buildReportModel, type ReportModel, type ReportAlert } from "@/lib/report-model";
import {
  scoreColor, fmtMonth,
  type CapAccount, type HealthPoint, type CategoryPoint, type MetricValue,
  type CapAlert, type FreshnessRow, type VerificationTierKind, type AlertKind,
} from "@/lib/capital";
import {
  Printer, X, FileText, ShieldCheck, TrendingDown, TrendingUp, Minus,
  AlertTriangle, CheckCircle2, Info, Globe,
} from "lucide-react";

type Lang = "de" | "en";

export type CapitalReportData = {
  health: HealthPoint[]; categories: CategoryPoint[]; values: MetricValue[];
  alerts: CapAlert[]; freshness?: FreshnessRow[];
};

// ── i18n (nur der Report-Rahmen; Daten bleiben in ihrer Quellsprache) ─────────
const T: Record<Lang, Record<string, string>> = {
  de: {
    docKind: "Investoren-Report", print: "Drucken / Als PDF", close: "Schließen",
    subtitle: "Firmen-Gesundheit & Frühwarn-Signale (0–100, 100 = gesund)",
    confidential: "Vertraulich", generatedOn: "Erstellt am", dataAsOf: "Datenstand",
    illustrativeTitle: "Illustrations-/Demonstrationsdaten",
    illustrativeBody: "Diese Firma dient der Veranschaulichung der Methodik. Die Werte sind KEINE reale Firmenleistung.",
    secHealth: "Gesamt-Gesundheit", healthScore: "Health-Score", trend: "Trend (6-Monats-Steigung)",
    coverage: "Abdeckung", confidence: "Konfidenz", signalBasis: "Signal-Basis",
    trendFalling: "Fallend", trendRising: "Steigend", trendStable: "Stabil", trendNa: "zu wenig Historie",
    leadNote: "Frühwarn-Signal", monthsBeforeFailure: "Monate vor Ausfall",
    secCategories: "Fünf Hauptkategorien", noData: "keine Daten",
    secKpis: "Kennzahlen & Quellen", colKpi: "Kennzahl", colValue: "Wert", colCoverage: "Abdeckung", colSources: "Quellen",
    method: "Methode", noValue: "kein Wert",
    secAlerts: "Frühwarn-Signale", alertsConfirmed: "Bestätigt", alertsWatch: "Beobachtung", alertsResolved: "Erledigt",
    noAlerts: "Keine offenen Frühwarn-Signale.", confirmedHint: "kritisch und über mehrere Läufe stabil (Debounce)",
    watchHint: "einzelnes Signal — noch nicht über mehrere Läufe bestätigt",
    projection: "Modellierte Projektion (keine Zusage)",
    secBenchmark: "Sektor-Benchmark", benchMedian: "Median", benchAbove: "über Median", benchBelow: "unter Median",
    benchNone: "Zu wenige sichtbare Firmen im Sektor für einen belastbaren Vergleich.",
    secMethod: "Methodik & Grenzen",
    secConsent: "Quellen & Einwilligung", secDisclaimer: "Wichtiger Hinweis",
    footer: "UseEasy Investor-Report", verificationTier: "Verifikation",
    signalSolid: "belastbar", signalYoung: "Historie im Aufbau", signalWeak: "eingeschränkt bewertbar",
    freshFresh: "aktuell", freshStale: "veraltet", freshDead: "Quelle liefert nicht mehr", freshNoSla: "ohne SLA",
    sourcesUsed: "Genutzte Quellen", sourcesMissing: "Noch nicht verbunden", none: "keine",
    langNote: "",
  },
  en: {
    docKind: "Investor Report", print: "Print / Save as PDF", close: "Close",
    subtitle: "Company health & early-warning signals (0–100, 100 = healthy)",
    confidential: "Confidential", generatedOn: "Generated on", dataAsOf: "Data as of",
    illustrativeTitle: "Illustrative / demonstration data",
    illustrativeBody: "This company illustrates the methodology. The values are NOT real company performance.",
    secHealth: "Overall health", healthScore: "Health score", trend: "Trend (6-month slope)",
    coverage: "Coverage", confidence: "Confidence", signalBasis: "Signal basis",
    trendFalling: "Falling", trendRising: "Rising", trendStable: "Stable", trendNa: "insufficient history",
    leadNote: "Early-warning signal", monthsBeforeFailure: "months before failure",
    secCategories: "Five main categories", noData: "no data",
    secKpis: "Metrics & sources", colKpi: "Metric", colValue: "Value", colCoverage: "Coverage", colSources: "Sources",
    method: "Method", noValue: "no value",
    secAlerts: "Early-warning signals", alertsConfirmed: "Confirmed", alertsWatch: "Watch", alertsResolved: "Resolved",
    noAlerts: "No open early-warning signals.", confirmedHint: "critical and stable across several runs (debounce)",
    watchHint: "single signal — not yet confirmed across several runs",
    projection: "Modelled projection (not a commitment)",
    secBenchmark: "Sector benchmark", benchMedian: "Median", benchAbove: "above median", benchBelow: "below median",
    benchNone: "Too few visible companies in the sector for a reliable comparison.",
    secMethod: "Methodology & limits",
    secConsent: "Sources & consent", secDisclaimer: "Important notice",
    footer: "UseEasy Investor Report", verificationTier: "Verification",
    signalSolid: "solid", signalYoung: "building history", signalWeak: "limited assessability",
    freshFresh: "current", freshStale: "outdated", freshDead: "source no longer delivering", freshNoSla: "no SLA",
    sourcesUsed: "Sources used", sourcesMissing: "Not yet connected", none: "none",
    langNote: "Report frame is in English; metric names, source names and rationale are shown in their source-data language (German).",
  },
};

const TIER_LABEL: Record<VerificationTierKind, Record<Lang, string>> = {
  first_party_verified: { de: "Verifiziert · First-Party", en: "Verified · first-party" },
  first_party_partial: { de: "Teil-verifiziert", en: "Partially verified" },
  first_party_stale: { de: "Verbindung inaktiv", en: "Connection inactive" },
  external_proxy: { de: "Öffentliche Signale (Proxy)", en: "Public signals (proxy)" },
  illustrative: { de: "Illustrationsdaten", en: "Illustrative data" },
  unrated: { de: "Nicht eingestuft", en: "Unrated" },
};
const TIER_COLOR: Record<VerificationTierKind, string> = {
  first_party_verified: "#10b981", first_party_partial: "#E8A33D", first_party_stale: "#E8A33D",
  external_proxy: "#5A6473", illustrative: "#8B5CF6", unrated: "#5A6473",
};
const ALERT_KIND_EN: Record<AlertKind, string> = {
  distress_risk: "Distress risk", threshold_breach: "Red threshold", trend_down: "Downtrend", anomaly: "Anomaly",
};
const ALERT_KIND_DE: Record<AlertKind, string> = {
  distress_risk: "Distress-Risiko", threshold_breach: "Rot-Schwelle", trend_down: "Abwärtstrend", anomaly: "Einbruch",
};

function pct(x: number | null | undefined): string { return x == null ? "–" : Math.round(x * 100) + "%"; }
function fmtDate(d: Date, lang: Lang): string {
  return lang === "de"
    ? `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── kleine Print-sichere SVG-Timeline (kein recharts, druckt sauber) ──────────
function ReportTimeline({ series, failureMonth }: { series: { period: string; v: number | null }[]; failureMonth?: string | null }) {
  const W = 720, H = 130, padL = 26, padB = 16, padT = 8;
  const pts = series.filter((s) => s.v != null) as { period: string; v: number }[];
  if (pts.length < 2) return <p style={{ fontSize: 12, color: "#64748b" }}>—</p>;
  const n = series.length;
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - 6);
  const y = (v: number) => padT + (1 - v / 100) * (H - padT - padB);
  const idxByPeriod = new Map(series.map((s, i) => [s.period, i]));
  const path = pts.map((p) => `${x(idxByPeriod.get(p.period) ?? 0)},${y(p.v)}`).join(" ");
  const y50 = y(50);
  const failIdx = failureMonth ? series.findIndex((s) => s.period.slice(0, 7) === failureMonth.slice(0, 7)) : -1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      <line x1={padL} y1={y50} x2={W - 6} y2={y50} stroke="#C0392B" strokeDasharray="4 4" strokeWidth={1} opacity={0.5} />
      <text x={2} y={y50 + 3} fontSize={9} fill="#C0392B">50</text>
      <text x={2} y={y(100) + 8} fontSize={9} fill="#94a3b8">100</text>
      <polyline points={path} fill="none" stroke="#2F6FED" strokeWidth={2} />
      {pts.map((p) => {
        const i = idxByPeriod.get(p.period) ?? 0;
        return <circle key={p.period} cx={x(i)} cy={y(p.v)} r={2.4} fill={scoreColor(p.v)} />;
      })}
      {failIdx >= 0 && <line x1={x(failIdx)} y1={padT} x2={x(failIdx)} y2={H - padB} stroke="#C0392B" strokeWidth={1.4} opacity={0.7} />}
      {series.length > 1 && (
        <>
          <text x={padL} y={H - 3} fontSize={9} fill="#94a3b8">{fmtMonth(series[0].period)}</text>
          <text x={W - 6} y={H - 3} fontSize={9} fill="#94a3b8" textAnchor="end">{fmtMonth(series[series.length - 1].period)}</text>
        </>
      )}
    </svg>
  );
}

function SectionTitle({ children, breakBefore }: { children: ReactNode; breakBefore?: boolean }) {
  return (
    <h2 className={breakBefore ? "cr-break-before" : ""} style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "26px 0 10px", paddingBottom: 6, borderBottom: "2px solid #e2e8f0" }}>
      {children}
    </h2>
  );
}

function AlertList({ items, t, lang, tone }: { items: ReportAlert[]; t: Record<string, string>; lang: Lang; tone: "confirmed" | "watch" | "resolved" }) {
  const kindLabel = (k: AlertKind) => (lang === "de" ? ALERT_KIND_DE[k] : ALERT_KIND_EN[k]);
  const dot = tone === "confirmed" ? "#C0392B" : tone === "watch" ? "#E8A33D" : "#10b981";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((ra) => {
        const a = ra.alert;
        return (
          <div key={`${a.id}-${a.subject_key}`} className="cr-avoid" style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, display: "inline-block" }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{kindLabel(a.kind)}</span>
              <span style={{ fontSize: 11, color: "#64748b" }}>· {a.subject_key} · {fmtMonth(a.period)}</span>
              {tone !== "resolved" && <span style={{ fontSize: 10, color: "#64748b", marginLeft: "auto" }}>{ra.quality.heldLabelDe}</span>}
            </div>
            <p style={{ fontSize: 12, color: "#334155", margin: "4px 0 0" }}>{a.message}</p>
            {a.projection?.projected_value != null && (
              <p style={{ fontSize: 10.5, color: "#64748b", margin: "3px 0 0", fontStyle: "italic" }}>
                {t.projection}: {Math.round(a.projection.projected_value)}{a.projection.horizon_months ? ` (${a.projection.horizon_months} Mo)` : ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CapitalReport({ account, data, variant = "investor", onClose }: {
  account: CapAccount; data?: CapitalReportData; variant?: "tenant" | "investor"; onClose: () => void;
}) {
  const [lang, setLang] = useState<Lang>("de");
  const t = T[lang];
  const injected = !!data;

  const catalog = useCapCatalog();
  const healthHook = useHealthSeries(injected ? undefined : account.id);
  const catsHook = useCategorySeries(injected ? undefined : account.id);
  const valuesHook = useMetricValues(injected ? undefined : account.id);
  const benchmarks = useHealthBenchmark();
  const freshnessHook = useFreshness(injected ? undefined : account.id);
  const tiers = useVerificationTiers();

  // Investoren-Pfad: Alerts inkl. resolved (cap_alert_feed, RLS-gated wie das Dashboard).
  const alertsAllHook = useQuery({
    enabled: !injected && !!account.id,
    queryKey: ["cap", "alerts", "account-all", account.id],
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: rows, error } = await capital.from("cap_alert_feed").select("*")
        .eq("account_id", account.id).order("severity_rank", { ascending: false });
      if (error) throw error;
      return (rows ?? []) as CapAlert[];
    },
  });

  const health = data?.health ?? healthHook.data ?? [];
  const categories = data?.categories ?? catsHook.data ?? [];
  const values = data?.values ?? valuesHook.data ?? [];
  const alerts = injected ? (data?.alerts ?? []) : (alertsAllHook.data ?? []);
  const freshness = injected ? (data?.freshness ?? []) : (freshnessHook.data ?? []);
  const tier = (tiers.data?.[account.id]?.verification_tier ?? null) as VerificationTierKind | null;

  const loading = catalog.isLoading || (!injected && (healthHook.isLoading || catsHook.isLoading || valuesHook.isLoading));

  const model: ReportModel = useMemo(
    () => buildReportModel({ account, catalog: catalog.data, health, categories, values, alerts, freshness, benchmarks: benchmarks.data ?? [], tier, variant }),
    [account, catalog.data, health, categories, values, alerts, freshness, benchmarks.data, tier, variant],
  );

  const now = new Date();
  // Dateiname des PDF = document.title beim Drucken.
  useEffect(() => {
    const prev = document.title;
    document.title = `UseEasy ${T.de.docKind} · ${account.name} · ${fmtDate(now, "de")}`;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.title = prev; window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.name, onClose]);

  const tierLabel = tier ? TIER_LABEL[tier][lang] : null;
  const tierColor = tier ? TIER_COLOR[tier] : "#5A6473";

  const trendMeta = (() => {
    if (model.slope == null || model.points < 3) return { label: t.trendNa, color: "#64748b", Icon: Minus };
    if (model.slope <= -1) return { label: t.trendFalling, color: "#C0392B", Icon: TrendingDown };
    if (model.slope >= 1) return { label: t.trendRising, color: "#10b981", Icon: TrendingUp };
    return { label: t.trendStable, color: "#E8A33D", Icon: Minus };
  })();

  const sig = model.signal;
  const sigSolid = sig.nSignals12 >= 2;
  const sigYoung = !sigSolid && sig.maxMonths < 12;
  const sigLabel = sigSolid ? `${t.signalSolid} · ${sig.nSignals12} × ≥12 Mo` : sigYoung ? `${t.signalYoung} (${sig.maxMonths} Mo · ${sig.nSignals})` : t.signalWeak;
  const sigColor = sigSolid ? "#10b981" : sigYoung ? "#64748b" : "#E8A33D";

  const freshLabel = (s: string) => (s === "fresh" ? t.freshFresh : s === "stale" ? t.freshStale : s === "dead" ? t.freshDead : t.freshNoSla);

  const footerText = `${t.footer} · ${account.name} · ${fmtDate(now, lang)} · ${t.confidential}`;

  const body = (
    <div id="capital-report-portal">
      <style>{PRINT_CSS}</style>

      {/* Toolbar (nicht gedruckt) */}
      <div className="cr-toolbar no-print">
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <FileText className="w-4 h-4" />
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.docKind} · {account.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="cr-langtoggle">
            <button onClick={() => setLang("de")} className={lang === "de" ? "on" : ""}>DE</button>
            <button onClick={() => setLang("en")} className={lang === "en" ? "on" : ""}>EN</button>
          </div>
          <button className="cr-btn cr-btn-primary" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> {t.print}</button>
          <button className="cr-btn" onClick={onClose}><X className="w-3.5 h-3.5" /> {t.close}</button>
        </div>
      </div>

      <div className="cr-scroll">
        <div className="cr-page">
          {loading ? (
            <p style={{ fontSize: 13, color: "#64748b", padding: "40px 0" }}>…</p>
          ) : (
            <>
              {/* ── Deckblatt ── */}
              <div className="cr-section">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <p style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", margin: 0 }}>UseEasy · {t.docKind}</p>
                    <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: "6px 0 2px" }}>{account.name}</h1>
                    <p style={{ fontSize: 12.5, color: "#475569", margin: 0 }}>
                      {account.domain ?? "—"}{model.verticalLabel ? ` · ${model.verticalLabel}` : ""}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, color: "#64748b" }}>
                    <div>{t.generatedOn} {fmtDate(now, lang)}</div>
                    {model.latestPeriod && <div>{t.dataAsOf} {fmtMonth(model.latestPeriod)}</div>}
                    <div style={{ marginTop: 4, fontWeight: 700, color: "#C0392B", letterSpacing: 0.5 }}>{t.confidential}</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  {tierLabel && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, color: "#fff", background: tierColor }}>
                      <ShieldCheck className="w-3 h-3" /> {t.verificationTier}: {tierLabel}
                    </span>
                  )}
                  {account.account_type === "external" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 9px", borderRadius: 999, background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" }}>
                      <Globe className="w-3 h-3" /> {lang === "de" ? "Markt-Index · öffentliche Signale" : "Market index · public signals"}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "#64748b", margin: "10px 0 0" }}>{t.subtitle}</p>

                {model.isIllustrative && (
                  <div style={{ marginTop: 12, border: "1px solid #ede9fe", background: "#f5f3ff", borderRadius: 8, padding: "10px 12px" }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#6D28D9" }}>⚠ {t.illustrativeTitle}</p>
                    <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#5b21b6" }}>{t.illustrativeBody}</p>
                  </div>
                )}
                {lang === "en" && t.langNote && (
                  <p style={{ marginTop: 10, fontSize: 10.5, color: "#94a3b8", fontStyle: "italic" }}>{t.langNote}</p>
                )}
              </div>

              {/* ── Gesamt-Gesundheit ── */}
              <SectionTitle>{t.secHealth}</SectionTitle>
              <div className="cr-section" style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ textAlign: "center", minWidth: 96 }}>
                  <div style={{ fontSize: 46, fontWeight: 800, lineHeight: 1, color: scoreColor(model.health) }}>{model.health == null ? "–" : Math.round(model.health)}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: scoreColor(model.health) }}>{model.healthLabel}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>/ 100</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", fontSize: 12, flex: 1, minWidth: 220 }}>
                  <Metric label={t.trend} value={<span style={{ color: trendMeta.color, fontWeight: 600 }}><trendMeta.Icon className="inline w-3.5 h-3.5" style={{ verticalAlign: "-2px" }} /> {trendMeta.label}{model.slope != null ? ` (${model.slope > 0 ? "+" : ""}${model.slope.toFixed(1)}/Mo)` : ""}</span>} />
                  <Metric label={t.coverage} value={pct(model.coverage)} />
                  <Metric label={t.confidence} value={pct(model.confidence)} />
                  <Metric label={t.signalBasis} value={<span style={{ color: sigColor, fontWeight: 600 }}>{sigLabel}</span>} />
                </div>
              </div>

              {model.lead != null && model.lead > 0 && (
                <p style={{ marginTop: 10, fontSize: 12, color: "#C0392B", fontWeight: 600 }}>
                  <TrendingDown className="inline w-3.5 h-3.5" style={{ verticalAlign: "-2px" }} /> {t.leadNote}: {model.lead} {t.monthsBeforeFailure} ({fmtMonth(account.failure_month)})
                </p>
              )}

              <div style={{ marginTop: 14 }} className="cr-section">
                <ReportTimeline series={model.healthSeries} failureMonth={account.failure_month} />
              </div>

              {/* ── Fünf Hauptkategorien ── */}
              <SectionTitle>{t.secCategories}</SectionTitle>
              <div className="cr-section" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {model.categories.map((rc) => {
                  const w = rc.score == null ? 0 : Math.max(0, Math.min(100, rc.score));
                  return (
                    <div key={rc.category.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 150, fontSize: 12, color: "#334155" }}>{rc.category.name}</span>
                      <div style={{ flex: 1, height: 12, background: "#f1f5f9", borderRadius: 6, overflow: "hidden", position: "relative" }}>
                        <div style={{ height: "100%", width: `${w}%`, background: scoreColor(rc.score), borderRadius: 6 }} />
                      </div>
                      <span style={{ width: 62, textAlign: "right", fontSize: 12, fontWeight: 600, color: scoreColor(rc.score) }}>
                        {rc.score == null ? t.noData : Math.round(rc.score)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* ── Kennzahlen & Quellen (je Kategorie) ── */}
              <SectionTitle breakBefore>{t.secKpis}</SectionTitle>
              {model.categories.map((rc) => (
                <div key={rc.category.key} className="cr-section" style={{ marginBottom: 14 }}>
                  <h3 style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a", margin: "10px 0 4px" }}>
                    {rc.category.name} <span style={{ color: scoreColor(rc.score), fontWeight: 700 }}>· {rc.score == null ? t.noData : Math.round(rc.score)}</span>
                  </h3>
                  <table className="cr-table">
                    <thead>
                      <tr><th style={{ width: "48%" }}>{t.colKpi}</th><th>{t.colValue}</th><th>{t.colCoverage}</th><th style={{ width: "26%" }}>{t.colSources}</th></tr>
                    </thead>
                    <tbody>
                      {rc.kpis.map((k) => (
                        <tr key={k.metric.key}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span className="cr-code">{k.metric.short_code ?? k.metric.key}</span>
                              <span style={{ fontSize: 12 }}>{k.metric.name}</span>
                              {k.metric.is_predictive && <TrendingUp className="w-3 h-3" style={{ color: "#2F6FED" }} />}
                              {k.isIllustrative && <span className="cr-illus">demo</span>}
                            </div>
                            <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 1 }}>{t.method}: {k.explanation.methodLabel}</div>
                          </td>
                          <td>
                            {k.isLive
                              ? <span style={{ fontWeight: 700, color: scoreColor(k.value) }}>{k.value == null ? "–" : Math.round(k.value)}</span>
                              : <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>{k.stateLabel || t.noValue}</span>}
                          </td>
                          <td style={{ fontSize: 11.5, color: "#475569" }}>{pct(k.coverage)}</td>
                          <td>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                              {k.sources.length ? k.sources.map((s) => <span key={s} className="cr-src">{s}</span>) : <span style={{ fontSize: 11, color: "#94a3b8" }}>–</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              {/* ── Frühwarn-Signale ── */}
              <SectionTitle breakBefore>{t.secAlerts}</SectionTitle>
              {model.alertsConfirmed.length === 0 && model.alertsWatch.length === 0 && model.alertsResolved.length === 0 ? (
                <p style={{ fontSize: 12, color: "#64748b" }}>{t.noAlerts}</p>
              ) : (
                <div className="cr-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {model.alertsConfirmed.length > 0 && (
                    <div>
                      <p className="cr-alertsub" style={{ color: "#C0392B" }}>● {t.alertsConfirmed} <span style={{ color: "#94a3b8", fontWeight: 400 }}>— {t.confirmedHint}</span></p>
                      <AlertList items={model.alertsConfirmed} t={t} lang={lang} tone="confirmed" />
                    </div>
                  )}
                  {model.alertsWatch.length > 0 && (
                    <div>
                      <p className="cr-alertsub" style={{ color: "#B45309" }}>● {t.alertsWatch} <span style={{ color: "#94a3b8", fontWeight: 400 }}>— {t.watchHint}</span></p>
                      <AlertList items={model.alertsWatch} t={t} lang={lang} tone="watch" />
                    </div>
                  )}
                  {model.alertsResolved.length > 0 && (
                    <div>
                      <p className="cr-alertsub" style={{ color: "#047857" }}>● {t.alertsResolved}</p>
                      <AlertList items={model.alertsResolved} t={t} lang={lang} tone="resolved" />
                    </div>
                  )}
                </div>
              )}

              {/* ── Sektor-Benchmark ── */}
              <SectionTitle>{t.secBenchmark}</SectionTitle>
              <div className="cr-section">
                {model.benchmark ? (
                  <BenchmarkPrint bm={model.benchmark} value={model.health} vertical={model.verticalLabel} t={t} />
                ) : (
                  <p style={{ fontSize: 12, color: "#64748b" }}><AlertTriangle className="inline w-3.5 h-3.5" style={{ verticalAlign: "-2px" }} /> {t.benchNone}</p>
                )}
              </div>

              {/* ── Methodik & Grenzen ── */}
              <SectionTitle breakBefore>{t.secMethod}</SectionTitle>
              <MethodologySection lang={lang} freshLabel={freshLabel} model={model} t={t} />

              {/* ── Quellen & Einwilligung ── */}
              <SectionTitle>{t.secConsent}</SectionTitle>
              <div className="cr-section" style={{ fontSize: 11.5, color: "#334155" }}>
                <p style={{ margin: "0 0 4px" }}><strong>{t.sourcesUsed}:</strong> {model.sourcesUsed.length ? model.sourcesUsed.join(" · ") : t.none}</p>
                <p style={{ margin: "0 0 4px" }}><strong>{t.sourcesMissing}:</strong> {model.sourcesMissing.length ? model.sourcesMissing.join(" · ") : t.none}</p>
                {model.freshness && (
                  <p style={{ margin: "0 0 4px" }}><strong>{t.dataAsOf}:</strong> {model.freshness.bySource.map((r) => `${r.source_key}: ${freshLabel(r.status)}`).join(" · ")}</p>
                )}
                <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                  {lang === "de"
                    ? (account.consent_data_sharing ? "Diese Firma hat der Datenfreigabe zugestimmt. Es werden nur aggregierte 0–100-Werte gezeigt, kein PII." : account.account_type === "external" ? "Aus öffentlichen Signalen abgeleitet — ohne Zutun der Firma, keine Datenfreigabe. Nur aggregierte 0–100-Werte, kein PII." : "Nur aggregierte 0–100-Werte, kein PII.")
                    : (account.consent_data_sharing ? "This company consented to data sharing. Only aggregated 0–100 values are shown, no PII." : account.account_type === "external" ? "Derived from public signals — without the company's involvement, no data sharing. Only aggregated 0–100 values, no PII." : "Only aggregated 0–100 values, no PII.")}
                </p>
              </div>

              {/* ── Disclaimer ── */}
              <SectionTitle>{t.secDisclaimer}</SectionTitle>
              <div className="cr-section" style={{ border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 8, padding: "12px 14px", fontSize: 11, color: "#475569", lineHeight: 1.5 }}>
                <Info className="inline w-3.5 h-3.5" style={{ verticalAlign: "-2px", color: "#64748b" }} />{" "}
                {lang === "de"
                  ? "Keine Anlageberatung und keine Bilanz- oder Wirtschaftsprüfung. Dieser Report fasst aggregierte Frühwarn-Signale (0–100) zusammen und stellt keine Empfehlung zum Kauf, Halten oder Verkauf dar. Projektionen sind Modellwerte, keine Zusagen; künftige Ergebnisse sind nicht garantiert. Backtest-Kennzahlen sind historisch und in-sample kalibriert. Erstellt von UseEasy; ohne Gewähr."
                  : "Not investment advice and not an audit or financial statement review. This report summarises aggregated early-warning signals (0–100) and is not a recommendation to buy, hold or sell. Projections are modelled values, not commitments; future results are not guaranteed. Backtest figures are historical and in-sample calibrated. Prepared by UseEasy; no warranty."}
              </div>

              <p style={{ marginTop: 18, fontSize: 10, color: "#94a3b8", textAlign: "center" }}>{footerText}</p>
            </>
          )}
        </div>
      </div>

      <div className="cr-print-footer">{footerText}</div>
    </div>
  );

  return createPortal(body, document.body);
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, color: "#94a3b8" }}>{label}</div>
      <div style={{ fontSize: 12.5, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

function BenchmarkPrint({ bm, value, vertical, t }: { bm: NonNullable<ReportModel["benchmark"]>; value: number | null; vertical: string; t: Record<string, string> }) {
  const clamp = (x: number) => Math.max(0, Math.min(100, x));
  const lo = clamp(bm.p25 ?? bm.median ?? 0), hi = clamp(bm.p75 ?? bm.median ?? 0), med = clamp(bm.median ?? 0);
  const above = (bm.delta ?? 0) >= 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 6 }}>
        <span style={{ color: "#64748b" }}>{vertical ? `${vertical} · ` : ""}{t.benchMedian} {bm.median == null ? "–" : Math.round(bm.median)} · n={bm.n}</span>
        <span style={{ fontWeight: 600, color: above ? "#10b981" : "#C0392B" }}>{above ? "+" : ""}{bm.delta} {above ? t.benchAbove : t.benchBelow}</span>
      </div>
      <div style={{ position: "relative", height: 12, background: "#f1f5f9", borderRadius: 999 }}>
        <div style={{ position: "absolute", top: 0, height: "100%", left: `${lo}%`, width: `${Math.max(0, hi - lo)}%`, background: "rgba(47,111,237,0.22)", borderRadius: 999 }} />
        <div style={{ position: "absolute", top: -2, height: 16, width: 2, background: "#64748b", left: `${med}%` }} />
        {value != null && <div style={{ position: "absolute", top: -3, width: 9, height: 18, borderRadius: 3, background: scoreColor(value), left: `calc(${clamp(value)}% - 4px)` }} />}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#94a3b8", marginTop: 3 }}><span>0</span><span>50</span><span>100</span></div>
    </div>
  );
}

function MethodologySection({ lang, t, model, freshLabel }: { lang: Lang; t: Record<string, string>; model: ReportModel; freshLabel: (s: string) => string }) {
  const items = lang === "de" ? [
    ["Was der Score misst", "Ein Composite von 0–100 (100 = gesund) aus fünf Hauptkategorien. Einzelne Kennzahlen sind vorlaufende Frühindikatoren; der Verlauf zählt mehr als der Momentwert."],
    ["Quellen", "First-Party-Operationsdaten (Postfach, Bank/PSD2, Buchhaltung, CRM, Stripe/Shopify) und öffentliche Proxies (Web-Präsenz, Such-Nachfrage, Nachrichten-Ton via GDELT, offene Stellen). Es werden ausschließlich aggregierte Werte gebildet, kein PII."],
    ["Verifikation", "Das Verifikations-Tier trennt aus verbundenen Operationsdaten berechnete Werte (First-Party) von aus öffentlichen Signalen abgeleiteten Näherungen (Proxy)."],
    ["Alert-Qualität", "Ein Alarm gilt erst als „Bestätigt“, wenn er kritisch ist und über mindestens zwei aufeinanderfolgende Monatsläufe stabil bleibt (Debounce). Alles andere ist „Beobachtung“. Diese Konsumenten-Regel senkte im historischen Backtest die Fehlalarme deutlich."],
    ["Datenstand & Belastbarkeit", "Coverage und Datenstand werden ehrlich ausgewiesen. Unter zwei Signalen mit mindestens zwölf Monaten Historie sind Score-Alarme nicht belastbar — das System zeigt dann „Historie im Aufbau“ statt zu raten."],
    ["Backtest-Einordnung (ehrlich)", "Die Kalibrierung beruht auf historischen Rückrechnungen und ist in-sample. Das System erkennt strukturellen Mehrjahres-Niedergang gut, plötzliche Zusammenbrüche oder Betrug nur eingeschränkt. Vergangene Trefferquoten sind keine Garantie künftiger Ergebnisse."],
    ["Referenz", "Ausführliche Herleitung: „UseEasy Capital-Layer — Methodologie v1“ (liegt zweisprachig DE/EN vor)."],
  ] : [
    ["What the score measures", "A 0–100 composite (100 = healthy) across five main categories. Individual metrics are leading early indicators; the trajectory matters more than the point value."],
    ["Sources", "First-party operational data (inbox, bank/PSD2, accounting, CRM, Stripe/Shopify) and public proxies (web presence, search demand, news tone via GDELT, open roles). Only aggregated values are formed, no PII."],
    ["Verification", "The verification tier separates values computed from connected operational data (first-party) from approximations derived from public signals (proxy)."],
    ["Alert quality", "An alert only counts as “Confirmed” when it is critical and remains stable across at least two consecutive monthly runs (debounce). Everything else is “Watch”. In the historical backtest this consumer rule cut false positives substantially."],
    ["Data recency & reliability", "Coverage and data recency are shown honestly. Below two signals with at least twelve months of history, score alerts are not reliable — the system then shows “building history” instead of guessing."],
    ["Backtest framing (honest)", "Calibration relies on historical backtesting and is in-sample. The system detects structural multi-year decline well, sudden collapse or fraud only to a limited extent. Past hit rates do not guarantee future results."],
    ["Reference", "Full derivation: “UseEasy Capital-Layer — Methodology v1” (available bilingually DE/EN)."],
  ];
  return (
    <div className="cr-section" style={{ fontSize: 11.5, color: "#334155", lineHeight: 1.5 }}>
      {items.map(([h, b]) => (
        <p key={h} style={{ margin: "0 0 7px" }}><strong style={{ color: "#0f172a" }}>{h}.</strong> {b}</p>
      ))}
    </div>
  );
}

const PRINT_CSS = `
#capital-report-portal { position: fixed; inset: 0; z-index: 60; background: rgba(15,23,42,0.6); overflow-y: auto; -webkit-overflow-scrolling: touch; }
#capital-report-portal .cr-toolbar { position: sticky; top: 0; z-index: 61; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 14px; background: #0f172a; color: #fff; }
#capital-report-portal .cr-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; padding: 6px 11px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); background: transparent; color: #fff; cursor: pointer; }
#capital-report-portal .cr-btn:hover { background: rgba(255,255,255,0.1); }
#capital-report-portal .cr-btn-primary { background: #2F6FED; border-color: #2F6FED; }
#capital-report-portal .cr-btn-primary:hover { background: #2559c9; }
#capital-report-portal .cr-langtoggle { display: inline-flex; border: 1px solid rgba(255,255,255,0.25); border-radius: 8px; overflow: hidden; }
#capital-report-portal .cr-langtoggle button { font-size: 11px; font-weight: 600; padding: 5px 9px; background: transparent; color: #cbd5e1; border: none; cursor: pointer; }
#capital-report-portal .cr-langtoggle button.on { background: #2F6FED; color: #fff; }
#capital-report-portal .cr-scroll { max-width: 880px; margin: 24px auto; padding: 0 16px 56px; }
#capital-report-portal .cr-page { background: #fff; color: #0f172a; border-radius: 10px; box-shadow: 0 12px 44px rgba(0,0,0,0.4); padding: 40px 44px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
#capital-report-portal .cr-table { width: 100%; border-collapse: collapse; }
#capital-report-portal .cr-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #94a3b8; font-weight: 600; padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
#capital-report-portal .cr-table td { font-size: 12px; color: #0f172a; padding: 7px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
#capital-report-portal .cr-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; padding: 1px 5px; border-radius: 4px; background: #f1f5f9; color: #475569; }
#capital-report-portal .cr-src { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #f1f5f9; color: #475569; }
#capital-report-portal .cr-illus { font-size: 9px; padding: 1px 5px; border-radius: 4px; background: #f5f3ff; color: #6D28D9; font-weight: 600; }
#capital-report-portal .cr-alertsub { font-size: 12px; font-weight: 600; margin: 0 0 5px; }
#capital-report-portal .cr-print-footer { display: none; }
@media print {
  html, body { background: #fff !important; }
  body > *:not(#capital-report-portal) { display: none !important; }
  #capital-report-portal { position: static !important; background: #fff !important; overflow: visible !important; }
  #capital-report-portal .cr-toolbar, #capital-report-portal .no-print { display: none !important; }
  #capital-report-portal .cr-scroll { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  #capital-report-portal .cr-page { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; }
  #capital-report-portal .cr-print-footer { display: block !important; position: fixed; left: 0; right: 0; bottom: 6mm; text-align: center; font-size: 8.5px; color: #94a3b8; }
  .cr-avoid { break-inside: avoid; }
  .cr-section { break-inside: avoid; }
  .cr-break-before { break-before: page; }
}
@page { size: A4; margin: 15mm 14mm 18mm; }
`;
