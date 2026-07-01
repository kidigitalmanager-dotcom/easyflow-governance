/**
 * capital-provenance.ts — macht die `provenance` eines Capital-KPI-Werts
 * menschenlesbar (Investoren-Sicht "Warum dieser Wert?"). Reine Präsentation,
 * kein Backend-Call: die Daten liegen bereits in cap_metric_values.provenance
 * ({ method, sources_used, formula?, input? }). Kurzfassung = Wert + Ein-Satz-
 * Grund + Quelle; der technische `formula`/`input`-Beleg wandert in "Details".
 * Analog zu data/humanize.ts (Operator-Console): Map + defensiver Fallback,
 * nie ein Absturz, nie ein roher Key. Zukunftssicher: unbekannte Methoden
 * (GDELT/Hiring/Stripe/…) werden generisch verständlich gerendert.
 */
import type { CapMetric } from "@/lib/capital";

export type ProvBand = "gesund" | "beobachten" | "kritisch" | "unbekannt";

export interface MetricExplanation {
  title: string;                         // KPI-Name (ohne Quell-Suffix)
  band: ProvBand;
  bandLabel: string;                     // "Gesund" | "Beobachten" | "Kritisch" | "Keine Daten"
  reason: string;                        // Ein-Satz-Begründung (human)
  sources: string[];                     // freundliche Quellnamen
  sourcesLabel: string;                  // "Quelle: X" / "Quellen: X · Y" / ""
  methodLabel: string;                   // freundlicher Methoden-Name
  formula: string | null;                // technischer Beleg (im Details-Aufklapp)
  inputPairs: Array<{ k: string; v: string }>; // technische Eingaben
  hasTechnical: boolean;
}

const BAND_LABEL: Record<ProvBand, string> = {
  gesund: "Gesund", beobachten: "Beobachten", kritisch: "Kritisch", unbekannt: "Keine Daten",
};
const BAND_LEAD: Record<ProvBand, string> = {
  gesund: "Im grünen Bereich",
  beobachten: "Auffällig – beobachten",
  kritisch: "Kritisch niedrig",
  unbekannt: "Noch keine Messwerte",
};

function band(v: number | null | undefined): ProvBand {
  if (v == null || !Number.isFinite(v)) return "unbekannt";
  if (v >= 70) return "gesund";
  if (v >= 50) return "beobachten";
  return "kritisch";
}

function prettify(raw: string): string {
  return String(raw || "").replace(/_/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function capFirst(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function stripSourceSuffix(name: string): string { return String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim(); }

/** Kurz-Beschreibung, was der KPI misst — bevorzugt aus dem Katalog (measures). */
function measuresClause(metric: CapMetric): string {
  const m = (metric.measures || "").trim();
  if (m) {
    // erste Sinneinheit reicht für die Kurzfassung
    const first = m.split(/[;.]/)[0].trim();
    return first || m;
  }
  return stripSourceSuffix(metric.name) || metric.name;
}

/** Technische Methode → freundlicher Name (prefix/substring-robust für künftige Methoden). */
function methodLabel(method: string): string {
  const m = (method || "").toLowerCase();
  if (!m) return "Aggregiertes Signal";
  if (m.includes("kemaris")) return "Kemaris-Basislinie (eigene Kommunikations-Historie)";
  if (m.includes("external_proxy")) return "Externer Proxy (öffentliche Signale)";
  if (m.includes("gdelt") || m.includes("news_tone") || m.includes("news")) return "GDELT (globale Nachrichten)";
  if (m.includes("hiring") || m.includes("ats") || m.includes("greenhouse") || m.includes("lever") || m.includes("personio") || m.includes("ashby") || m.includes("recruitee")) return "Karriere-Board (offene Stellen)";
  if (m.includes("stripe")) return "Stripe (Umsatz, read-only)";
  if (m.includes("shopify")) return "Shopify (Bestellungen, read-only)";
  if (m.includes("finapi") || m.includes("bank")) return "Bank-Konto (PSD2, read-only)";
  if (m.includes("maesn") || m.includes("accounting") || m.includes("datev")) return "Buchhaltung (read-only)";
  if (m.includes("hubspot") || m.includes("crm")) return "CRM (HubSpot)";
  return prettify(method);
}

function toNum(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (x != null && x !== "" && !Number.isNaN(Number(x))) return Number(x);
  return null;
}
function fmtVal(v: unknown): string {
  if (v == null) return "–";
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
}

/** Optionale Klartext-Anreicherung aus bekannten input-Feldern (defensiv). */
function inputEnrichment(metricKey: string, method: string, prov: any): string {
  const input = prov && typeof prov.input === "object" && prov.input ? prov.input : prov;
  if (!input || typeof input !== "object") return "";
  const k = (metricKey || "").toLowerCase();
  const m = (method || "").toLowerCase();

  if (k.includes("news_tone") || m.includes("gdelt") || m.includes("news_tone")) {
    const t = toNum(input.avg_tone ?? input.tone ?? input.mean_tone);
    const d = toNum(input.window_days ?? input.days);
    if (t != null) return `Ø-Nachrichtenton ${t.toFixed(1)}${d ? ` über ${d} Tage` : ""}.`;
  }
  if (k.includes("news_volume")) {
    const n = toNum(input.articles ?? input.count ?? input.n ?? input.volume);
    if (n != null) return `${n} Nachrichten-Treffer im Zeitfenster.`;
  }
  if (k.includes("hiring") || m.includes("hiring") || m.includes("ats")) {
    const r = toNum(input.open_roles ?? input.roles ?? input.n ?? input.count);
    const tr = input.trend ?? input.direction;
    if (r != null) return `${r} offene Stelle${r === 1 ? "" : "n"}${tr ? `, Tendenz ${String(tr)}` : ""}.`;
  }
  const wk = toNum(prov?.window_weeks ?? input.window_weeks);
  if (m.includes("kemaris") && wk != null) return `Gemessen an der eigenen ${wk}-Wochen-Basislinie.`;
  return "";
}

const STD_KEYS = new Set(["method", "sources_used", "formula", "input"]);

/**
 * Hauptfunktion: baut die menschenlesbare Erklärung für EINEN KPI-Wert.
 * @param sourceName  Katalog-Lookup key→Klartext (cap_sources.name); Fallback prettify.
 */
export function humanizeMetricValue(
  metric: CapMetric,
  value: number | null | undefined,
  provenance: any,
  sourceName?: (key: string) => string,
): MetricExplanation {
  const prov = provenance && typeof provenance === "object" ? provenance : {};
  const method = String(prov.method || "");
  const b = band(value);
  const nameFor = sourceName ?? ((s: string) => prettify(s));

  // sources
  const usedKeys: string[] = Array.isArray(prov.sources_used) ? prov.sources_used : [];
  const sources = usedKeys.map((s) => nameFor(s)).filter(Boolean);
  const sourcesLabel = sources.length === 0 ? ""
    : sources.length === 1 ? `Quelle: ${sources[0]}`
    : `Quellen: ${sources.join(" · ")}`;

  // reason
  const lead = BAND_LEAD[b];
  const clause = capFirst(measuresClause(metric));
  let reason = value == null ? `${lead}. ${clause}.` : `${lead} (${Math.round(value)}/100). ${clause}.`;
  const enrich = inputEnrichment(metric.key, method, prov);
  if (enrich) reason += ` ${enrich}`;

  // technical
  const formula: string | null = typeof prov.formula === "string" && prov.formula.trim() ? prov.formula.trim() : null;
  const inputPairs: Array<{ k: string; v: string }> = [];
  const inputObj = prov && typeof prov.input === "object" && prov.input ? prov.input : null;
  if (inputObj) {
    for (const [key, val] of Object.entries(inputObj)) inputPairs.push({ k: key, v: fmtVal(val) });
  } else {
    for (const [key, val] of Object.entries(prov)) {
      if (!STD_KEYS.has(key)) inputPairs.push({ k: key, v: fmtVal(val) });
    }
  }
  const hasTechnical = !!formula || inputPairs.length > 0 || !!method;

  return {
    title: stripSourceSuffix(metric.name) || metric.name,
    band: b,
    bandLabel: BAND_LABEL[b],
    reason,
    sources,
    sourcesLabel,
    methodLabel: methodLabel(method),
    formula,
    inputPairs,
    hasTechnical,
  };
}
