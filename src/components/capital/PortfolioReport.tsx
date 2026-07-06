// ─────────────────────────────────────────────────────────────────────────────
// PortfolioReport.tsx — Investor Data-Room (M2) Export ("Beides"):
//   Seite 1: Portfolio-Übersicht (deterministisch gerankte DD-Liste + optional
//            Janas belegte Antwort) als druckbares Due-Diligence-Dokument.
//   Seite 2..N: kompaktes Detail-Profil je Treffer-Firma (reuse buildReportModel).
// Gleiche Print-CSS-Technik wie CapitalReport (eigener Portal-Container, isoliert),
// KEIN Backend-Call, KEINE PDF-Lib: Print-CSS + window.print(). Ehrlichkeit trägt
// durch: is_illustrative sichtbar, Freshness/Coverage ehrlich, keine Renditezusage.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { capital } from "@/integrations/capital/client";
import {
  useCapCatalog, useHealthSeries, useCategorySeries, useMetricValues,
  useHealthBenchmark, useFreshness, useVerificationTiers,
} from "@/hooks/use-capital";
import { buildReportModel, type ReportModel } from "@/lib/report-model";
import {
  scoreColor, scoreLabel, fmtMonth, verticalLabelDe, worstFreshnessLabel, PORTFOLIO_FILTER_LABEL,
  type CapAccount, type CapAlert, type PortfolioHit, type PortfolioFilterKey, type FirmCitation,
  type VerificationTierKind, type AlertKind,
} from "@/lib/capital";
import { Printer, X, FileText, ShieldCheck, TrendingDown, TrendingUp, Minus, Globe, Info, Sparkles } from "lucide-react";

const TIER_LABEL_DE: Record<VerificationTierKind, string> = {
  first_party_verified: "Verifiziert · First-Party", first_party_partial: "Teil-verifiziert",
  first_party_stale: "Verbindung inaktiv", external_proxy: "Öffentliche Signale (Proxy)",
  illustrative: "Illustrationsdaten", unrated: "Nicht eingestuft",
};
const ALERT_KIND_DE: Record<AlertKind, string> = {
  distress_risk: "Distress-Risiko", threshold_breach: "Rot-Schwelle", trend_down: "Abwärtstrend", anomaly: "Einbruch",
};

function fmtDateDe(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}
function pct(x: number | null | undefined): string { return x == null ? "–" : Math.round(x * 100) + "%"; }

// Synthetisiert einen CapAccount aus einem PortfolioHit (für buildReportModel + Hooks).
function hitToAccount(h: PortfolioHit): CapAccount {
  return {
    id: h.id ?? h.slug, name: h.name, slug: h.slug, domain: null, vertical: h.vertical,
    account_type: (h.account_type as CapAccount["account_type"]) ?? "external",
    consent_data_sharing: h.account_type !== "external", consent_at: null,
    status: "active", failure_month: null,
  };
}

// Kompakte, print-sichere SVG-Timeline (kein recharts).
function MiniTimeline({ series }: { series: { period: string; v: number | null }[] }) {
  const W = 620, H = 96, padL = 22, padB = 14, padT = 6;
  const pts = series.filter((s) => s.v != null) as { period: string; v: number }[];
  if (pts.length < 2) return <p style={{ fontSize: 11, color: "#94a3b8" }}>zu wenig Historie</p>;
  const n = series.length;
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - 6);
  const y = (v: number) => padT + (1 - v / 100) * (H - padT - padB);
  const idx = new Map(series.map((s, i) => [s.period, i]));
  const path = pts.map((p) => `${x(idx.get(p.period) ?? 0)},${y(p.v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      <line x1={padL} y1={y(50)} x2={W - 6} y2={y(50)} stroke="#C0392B" strokeDasharray="4 4" strokeWidth={1} opacity={0.5} />
      <text x={2} y={y(50) + 3} fontSize={9} fill="#C0392B">50</text>
      <polyline points={path} fill="none" stroke="#2F6FED" strokeWidth={2} />
      {pts.map((p) => <circle key={p.period} cx={x(idx.get(p.period) ?? 0)} cy={y(p.v)} r={2.2} fill={scoreColor(p.v)} />)}
      <text x={padL} y={H - 2} fontSize={9} fill="#94a3b8">{fmtMonth(series[0].period)}</text>
      <text x={W - 6} y={H - 2} fontSize={9} fill="#94a3b8" textAnchor="end">{fmtMonth(series[series.length - 1].period)}</text>
    </svg>
  );
}

function trendMetaFor(slope: number | null, points: number) {
  if (slope == null || points < 3) return { label: "zu wenig Historie", color: "#64748b", Icon: Minus };
  if (slope <= -1) return { label: "Fallend", color: "#C0392B", Icon: TrendingDown };
  if (slope >= 1) return { label: "Steigend", color: "#10b981", Icon: TrendingUp };
  return { label: "Stabil", color: "#E8A33D", Icon: Minus };
}

// ── Detail-Profil je Firma (lädt eigene Daten, baut ReportModel, rendert kompakt) ──
function PortfolioFirmSection({ account, rank }: { account: CapAccount; rank: number }) {
  const catalog = useCapCatalog();
  const healthHook = useHealthSeries(account.id);
  const catsHook = useCategorySeries(account.id);
  const valuesHook = useMetricValues(account.id);
  const benchmarks = useHealthBenchmark();
  const freshnessHook = useFreshness(account.id);
  const tiers = useVerificationTiers();
  const alertsHook = useQuery({
    enabled: !!account.id,
    queryKey: ["cap", "alerts", "account-all", account.id],
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await capital.from("cap_alert_feed").select("*")
        .eq("account_id", account.id).order("severity_rank", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CapAlert[];
    },
  });

  const tier = (tiers.data?.[account.id]?.verification_tier ?? null) as VerificationTierKind | null;
  const model: ReportModel = useMemo(
    () => buildReportModel({
      account, catalog: catalog.data, health: healthHook.data ?? [], categories: catsHook.data ?? [],
      values: valuesHook.data ?? [], alerts: alertsHook.data ?? [], freshness: freshnessHook.data ?? [],
      benchmarks: benchmarks.data ?? [], tier, variant: "investor",
    }),
    [account, catalog.data, healthHook.data, catsHook.data, valuesHook.data, alertsHook.data, freshnessHook.data, benchmarks.data, tier],
  );

  const trend = trendMetaFor(model.slope, model.points);
  const confirmed = model.alertsConfirmed;
  const watch = model.alertsWatch;

  return (
    <div className="cr-break-before">
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 8px", paddingBottom: 6, borderBottom: "2px solid #e2e8f0" }}>
        {rank}. {account.name}
      </h2>
      <div className="cr-section" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {tier && <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, color: "#fff", background: tier === "first_party_verified" ? "#10b981" : tier === "illustrative" ? "#8B5CF6" : "#5A6473" }}>{TIER_LABEL_DE[tier]}</span>}
        {model.isIllustrative && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#f5f3ff", color: "#6D28D9" }}>⚠ Illustrativ</span>}
        {account.account_type === "external" && <span style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 999, background: "#f1f5f9", color: "#475569" }}>Markt-Index · öffentliche Signale</span>}
        {model.verticalLabel && <span style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 999, background: "#f1f5f9", color: "#475569" }}>{model.verticalLabel}</span>}
      </div>

      <div className="cr-section" style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ textAlign: "center", minWidth: 78 }}>
          <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, color: scoreColor(model.health) }}>{model.health == null ? "–" : Math.round(model.health)}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: scoreColor(model.health) }}>{model.healthLabel}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 18px", fontSize: 11.5, flex: 1, minWidth: 220 }}>
          <div><span style={{ color: "#94a3b8" }}>Trend: </span><span style={{ color: trend.color, fontWeight: 600 }}>{trend.label}{model.slope != null ? ` (${model.slope > 0 ? "+" : ""}${model.slope.toFixed(1)}/Mo)` : ""}</span></div>
          <div><span style={{ color: "#94a3b8" }}>Abdeckung: </span>{pct(model.coverage)}</div>
          <div><span style={{ color: "#94a3b8" }}>Konfidenz: </span>{pct(model.confidence)}</div>
          <div><span style={{ color: "#94a3b8" }}>Datenstand: </span>{model.latestPeriod ? fmtMonth(model.latestPeriod) : "–"}</div>
        </div>
      </div>
      <div className="cr-section" style={{ marginBottom: 10 }}><MiniTimeline series={model.healthSeries} /></div>

      {/* Kategorien */}
      {model.categories.length > 0 && (
        <div className="cr-section" style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
          {model.categories.map((rc) => {
            const w = rc.score == null ? 0 : Math.max(0, Math.min(100, rc.score));
            return (
              <div key={rc.category.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 140, fontSize: 11, color: "#334155" }}>{rc.category.name}</span>
                <div style={{ flex: 1, height: 10, background: "#f1f5f9", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${w}%`, background: scoreColor(rc.score), borderRadius: 5 }} />
                </div>
                <span style={{ width: 40, textAlign: "right", fontSize: 11, fontWeight: 600, color: scoreColor(rc.score) }}>{rc.score == null ? "–" : Math.round(rc.score)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Alerts */}
      {(confirmed.length > 0 || watch.length > 0) ? (
        <div className="cr-section" style={{ marginBottom: 8 }}>
          {confirmed.length > 0 && <p style={{ fontSize: 11.5, fontWeight: 600, color: "#C0392B", margin: "0 0 4px" }}>● Bestätigt <span style={{ color: "#94a3b8", fontWeight: 400 }}>— kritisch + über mehrere Läufe stabil</span></p>}
          {confirmed.slice(0, 4).map((ra) => (
            <div key={`c${ra.alert.id}`} style={{ fontSize: 11.5, color: "#334155", margin: "0 0 3px" }}>
              <strong>{ALERT_KIND_DE[ra.alert.kind]}</strong> · {ra.alert.subject_key} · {fmtMonth(ra.alert.period)} — {ra.alert.message}
            </div>
          ))}
          {watch.length > 0 && <p style={{ fontSize: 11.5, fontWeight: 600, color: "#B45309", margin: "6px 0 4px" }}>● Beobachtung</p>}
          {watch.slice(0, 3).map((ra) => (
            <div key={`w${ra.alert.id}`} style={{ fontSize: 11.5, color: "#334155", margin: "0 0 3px" }}>
              <strong>{ALERT_KIND_DE[ra.alert.kind]}</strong> · {ra.alert.subject_key} · {fmtMonth(ra.alert.period)} — {ra.alert.message}
            </div>
          ))}
        </div>
      ) : <p className="cr-section" style={{ fontSize: 11.5, color: "#64748b", marginBottom: 8 }}>Keine offenen Frühwarn-Signale.</p>}

      {/* Quellen */}
      <div className="cr-section" style={{ fontSize: 11, color: "#475569" }}>
        <strong>Genutzte Quellen:</strong> {model.sourcesUsed.length ? model.sourcesUsed.join(" · ") : "keine"}
        {model.freshness && <> · <strong>Datenstand:</strong> {model.freshness.bySource.map((r) => `${r.source_key}: ${r.status === "fresh" ? "aktuell" : r.status === "stale" ? "veraltet" : r.status === "dead" ? "inaktiv" : "ohne SLA"}`).join(" · ")}</>}
      </div>
    </div>
  );
}

export function PortfolioReport({ hits, filter, universeSize, question, answer, citations, onClose }: {
  hits: PortfolioHit[]; filter: PortfolioFilterKey | null; universeSize: number;
  question?: string | null; answer?: string | null; citations?: FirmCitation[]; onClose: () => void;
}) {
  const now = new Date();
  const filterLabel = filter ? PORTFOLIO_FILTER_LABEL[filter] : "Höchstes Gesamtrisiko";
  const firmAccounts = useMemo(() => hits.filter((h) => h.id).map((h) => hitToAccount(h)), [hits]);

  useEffect(() => {
    const prev = document.title;
    document.title = `UseEasy Investoren-Portfolio-Report · ${fmtDateDe(now)}`;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.title = prev; window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const footerText = `UseEasy Investoren-Portfolio-Report · ${fmtDateDe(now)} · Vertraulich`;

  const body = (
    <div id="capital-portfolio-report-portal">
      <style>{PORTFOLIO_PRINT_CSS}</style>
      <div className="cr-toolbar no-print">
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <FileText className="w-4 h-4" />
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Investoren-Portfolio-Report</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="cr-btn cr-btn-primary" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Drucken / Als PDF</button>
          <button className="cr-btn" onClick={onClose}><X className="w-3.5 h-3.5" /> Schließen</button>
        </div>
      </div>

      <div className="cr-scroll">
        <div className="cr-page">
          {/* Deckblatt + Übersicht */}
          <div className="cr-section">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div>
                <p style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", margin: 0 }}>UseEasy · Investoren-Portfolio-Report</p>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: "6px 0 2px" }}>Portfolio-Screening</h1>
                <p style={{ fontSize: 12.5, color: "#475569", margin: 0 }}>Reihung: <strong>{filterLabel}</strong> · {hits.length} von {universeSize} Firmen</p>
              </div>
              <div style={{ textAlign: "right", fontSize: 11, color: "#64748b" }}>
                <div>Erstellt am {fmtDateDe(now)}</div>
                <div style={{ marginTop: 4, fontWeight: 700, color: "#C0392B", letterSpacing: 0.5 }}>Vertraulich</div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: "#64748b", margin: "10px 0 0" }}>Firmen-Gesundheit &amp; Frühwarn-Signale (0–100, 100 = gesund). Nur Firmen mit Datenfreigabe oder öffentlichem Markt-Index; illustrativ markierte Firmen sind Demonstrationsdaten.</p>
          </div>

          {/* Janas Antwort (falls Frage gestellt) */}
          {answer && (
            <div className="cr-section" style={{ marginTop: 14, border: "1px solid #dbeafe", background: "#eff6ff", borderRadius: 8, padding: "12px 14px" }}>
              {question && <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#1e40af" }}>Frage: {question}</p>}
              <p style={{ margin: 0, fontSize: 12.5, color: "#0f172a", lineHeight: 1.5 }}>{answer}</p>
              {citations && citations.length > 0 && (
                <p style={{ margin: "6px 0 0", fontSize: 10.5, color: "#64748b" }}>Belegte Firmen: {citations.map((c) => `${c.label || c.key}${c.value != null ? ` (${Math.round(c.value)})` : ""}`).join(" · ")}</p>
              )}
            </div>
          )}

          {/* Rangliste */}
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "22px 0 8px", paddingBottom: 6, borderBottom: "2px solid #e2e8f0" }}>Rangliste</h2>
          <table className="cr-table">
            <thead>
              <tr><th>#</th><th style={{ width: "26%" }}>Firma</th><th>Score</th><th>Trend</th><th>Kritisch</th><th>Daten</th><th>News-Ton</th></tr>
            </thead>
            <tbody>
              {hits.map((h, i) => {
                const trend = trendMetaFor(h.slope6, h.slope6 == null ? 0 : 6);
                return (
                  <tr key={h.slug}>
                    <td style={{ color: "#94a3b8" }}>{i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{h.name}{h.is_illustrative ? " ⚠" : ""}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>
                        {h.vertical ? verticalLabelDe(h.vertical) + " · " : ""}{h.verification_tier ? TIER_LABEL_DE[h.verification_tier] : ""}
                      </div>
                    </td>
                    <td><span style={{ fontWeight: 700, color: scoreColor(h.health) }}>{h.health == null ? "–" : Math.round(h.health)}</span> <span style={{ fontSize: 10, color: "#94a3b8" }}>{scoreLabel(h.health)}</span></td>
                    <td style={{ color: trend.color, fontWeight: 600 }}>{h.slope6 != null ? `${h.slope6 > 0 ? "+" : ""}${h.slope6.toFixed(1)}` : trend.label}</td>
                    <td>{h.critical_alerts > 0 ? <span style={{ color: "#C0392B", fontWeight: 600 }}>{h.critical_alerts}{h.confirmed_alerts > 0 ? ` (${h.confirmed_alerts} best.)` : ""}</span> : <span style={{ color: "#94a3b8" }}>–</span>}</td>
                    <td style={{ color: h.worst_freshness === "dead" ? "#C0392B" : h.worst_freshness === "stale" ? "#B45309" : "#64748b" }}>{worstFreshnessLabel(h.worst_freshness)}</td>
                    <td style={{ color: scoreColor(h.news_tone), fontWeight: 600 }}>{h.news_tone == null ? "–" : Math.round(h.news_tone)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Methodik-Kurzform + Disclaimer */}
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "22px 0 8px", paddingBottom: 6, borderBottom: "2px solid #e2e8f0" }}>Methodik &amp; Grenzen</h2>
          <div className="cr-section" style={{ fontSize: 11.5, color: "#334155", lineHeight: 1.5 }}>
            <p style={{ margin: "0 0 6px" }}><strong>Reihung.</strong> Die Rangliste wird deterministisch aus der Datenbank gebildet (6-Monats-Health-Steigung, Anzahl offener/bestätigter kritischer Signale, Freshness, Nachrichten-Ton). Die Freitext-Antwort formuliert nur; jede genannte Firma ist per Score belegt.</p>
            <p style={{ margin: "0 0 6px" }}><strong>Verifikation.</strong> First-Party = aus verbundenen Operationsdaten berechnet; Proxy = aus öffentlichen Signalen abgeleitet (Web-Präsenz, Such-Nachfrage, Nachrichten-Ton via GDELT, offene Stellen). Nur aggregierte 0–100-Werte, kein PII.</p>
            <p style={{ margin: "0 0 6px" }}><strong>Alert-Qualität.</strong> „Bestätigt“ = kritisch und über mindestens zwei Monatsläufe stabil (Debounce). Alles andere ist „Beobachtung“.</p>
            <p style={{ margin: 0 }}><strong>Backtest-Einordnung (ehrlich).</strong> Kalibrierung ist historisch und in-sample. Strukturelle Mehrjahres-Trends werden gut erkannt, plötzliche Zusammenbrüche nur eingeschränkt. Vergangene Trefferquoten sind keine Garantie künftiger Ergebnisse.</p>
          </div>

          <div className="cr-section" style={{ marginTop: 12, border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 8, padding: "12px 14px", fontSize: 11, color: "#475569", lineHeight: 1.5 }}>
            <Info className="inline w-3.5 h-3.5" style={{ verticalAlign: "-2px", color: "#64748b" }} />{" "}
            Keine Anlageberatung und keine Bilanz- oder Wirtschaftsprüfung. Dieser Report fasst aggregierte Frühwarn-Signale (0–100) zusammen und ist keine Empfehlung zum Kauf, Halten oder Verkauf. Projektionen sind Modellwerte, keine Zusagen. Erstellt von UseEasy; ohne Gewähr.
          </div>

          {/* Detail-Profile je Firma */}
          {firmAccounts.length > 0 && (
            <>
              <h2 className="cr-break-before" style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>Detail-Profile</h2>
              <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 4px" }}>Je Treffer-Firma: Gesundheit, Trend, Kategorien, offene Frühwarn-Signale und Quellen.</p>
              {firmAccounts.map((a, i) => <PortfolioFirmSection key={a.id} account={a} rank={i + 1} />)}
            </>
          )}

          <p style={{ marginTop: 18, fontSize: 10, color: "#94a3b8", textAlign: "center" }}>{footerText}</p>
        </div>
      </div>
      <div className="cr-print-footer">{footerText}</div>
    </div>
  );

  return createPortal(body, document.body);
}

export function PortfolioReportButton({ hits, filter, universeSize, question, answer, citations }: {
  hits: PortfolioHit[]; filter: PortfolioFilterKey | null; universeSize: number;
  question?: string | null; answer?: string | null; citations?: FirmCitation[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border border-primary/40 bg-primary/10 text-primary px-3 py-1.5 transition-colors hover:bg-primary/20"
        title="Portfolio-Report als PDF exportieren (Übersicht + Detail-Profile)"
      >
        <FileText className="w-3.5 h-3.5" /> Portfolio-Report (PDF)
      </button>
      {open && <PortfolioReport hits={hits} filter={filter} universeSize={universeSize} question={question} answer={answer} citations={citations} onClose={() => setOpen(false)} />}
    </>
  );
}

const PORTFOLIO_PRINT_CSS = `
#capital-portfolio-report-portal { position: fixed; inset: 0; z-index: 60; background: rgba(15,23,42,0.6); overflow-y: auto; -webkit-overflow-scrolling: touch; }
#capital-portfolio-report-portal .cr-toolbar { position: sticky; top: 0; z-index: 61; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 14px; background: #0f172a; color: #fff; }
#capital-portfolio-report-portal .cr-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; padding: 6px 11px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); background: transparent; color: #fff; cursor: pointer; }
#capital-portfolio-report-portal .cr-btn:hover { background: rgba(255,255,255,0.1); }
#capital-portfolio-report-portal .cr-btn-primary { background: #2F6FED; border-color: #2F6FED; }
#capital-portfolio-report-portal .cr-btn-primary:hover { background: #2559c9; }
#capital-portfolio-report-portal .cr-scroll { max-width: 880px; margin: 24px auto; padding: 0 16px 56px; }
#capital-portfolio-report-portal .cr-page { background: #fff; color: #0f172a; border-radius: 10px; box-shadow: 0 12px 44px rgba(0,0,0,0.4); padding: 40px 44px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
#capital-portfolio-report-portal .cr-table { width: 100%; border-collapse: collapse; }
#capital-portfolio-report-portal .cr-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #94a3b8; font-weight: 600; padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
#capital-portfolio-report-portal .cr-table td { font-size: 12px; color: #0f172a; padding: 7px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
#capital-portfolio-report-portal .cr-print-footer { display: none; }
@media print {
  html, body { background: #fff !important; }
  body > *:not(#capital-portfolio-report-portal) { display: none !important; }
  #capital-portfolio-report-portal { position: static !important; background: #fff !important; overflow: visible !important; }
  #capital-portfolio-report-portal .cr-toolbar, #capital-portfolio-report-portal .no-print { display: none !important; }
  #capital-portfolio-report-portal .cr-scroll { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  #capital-portfolio-report-portal .cr-page { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; }
  #capital-portfolio-report-portal .cr-print-footer { display: block !important; position: fixed; left: 0; right: 0; bottom: 6mm; text-align: center; font-size: 8.5px; color: #94a3b8; }
  .cr-section { break-inside: avoid; }
  .cr-break-before { break-before: page; }
}
@page { size: A4; margin: 15mm 14mm 18mm; }
`;
