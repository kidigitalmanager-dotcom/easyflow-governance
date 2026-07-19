// Darstellungs-Helfer. Score-Farben und Schwelle kommen aus dem bestehenden
// Design-System (src/lib/capital.ts) - eine Quelle der Wahrheit fuer alle drei
// Frontends. Hier wird nur auf das Band-Vokabular des Contracts uebersetzt.
import { RED_THRESHOLD, scoreColor } from "@/lib/capital";
import type {
  ChangeKind, ChangeSeverity, Direction, FreshnessStatus,
  QualityTier, RiskBand,
} from "./types";

export { RED_THRESHOLD, scoreColor };
export const GREEN_THRESHOLD = 70;

export function bandOf(score: number | null | undefined): RiskBand {
  if (score == null || !Number.isFinite(score)) return "unbekannt";
  if (score >= GREEN_THRESHOLD) return "gesund";
  if (score >= RED_THRESHOLD) return "beobachten";
  return "kritisch";
}

export const BAND_LABEL: Record<RiskBand, string> = {
  gesund: "Gesund",
  beobachten: "Beobachten",
  kritisch: "Kritisch",
  unbekannt: "Keine Daten",
};

export function bandColor(band: RiskBand): string {
  switch (band) {
    case "gesund": return "#10b981";
    case "beobachten": return "#E8A33D";
    case "kritisch": return "#C0392B";
    default: return "#5A6473";
  }
}

// ── Zahlen und Datum ─────────────────────────────────────────────────────────

export function fmtScore(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "–" : String(Math.round(v));
}
export function fmtPct(v: number | null | undefined, digits = 0): string {
  return v == null || !Number.isFinite(v) ? "–" : (v * 100).toFixed(digits) + " %";
}
/** Signierter Punkt-Delta, immer mit Vorzeichen. */
export function fmtDelta(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const s = v.toFixed(digits);
  return v > 0 ? "+" + s : s;
}
export function fmtExposure(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  if (v >= 1_000_000) return (v / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " Mio. EUR";
  if (v >= 1_000) return Math.round(v / 1_000).toLocaleString("de-DE") + " Tsd. EUR";
  return v.toLocaleString("de-DE") + " EUR";
}
export function fmtCount(v: number | null | undefined): string {
  return v == null ? "–" : v.toLocaleString("de-DE");
}
export function fmtDateDe(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
export function fmtDateTimeDe(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr";
}
/** "vor 28 Stunden" bzw. "vor 3 Tagen". */
export function fmtAge(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return "Alter unbekannt";
  if (hours < 1) return "vor unter einer Stunde";
  if (hours < 48) return `vor ${Math.round(hours)} Stunden`;
  return `vor ${Math.round(hours / 24)} Tagen`;
}
/** Monatserster "2026-07-01" wird zu "Juli 2026". */
export function fmtPeriod(period: string | null | undefined): string {
  if (!period) return "–";
  const d = new Date(period);
  return Number.isNaN(d.getTime()) ? period : d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

// ── Ehrlichkeits-Elemente ────────────────────────────────────────────────────

export const FRESHNESS_META: Record<FreshnessStatus, { label: string; color: string; hint: string }> = {
  fresh:  { label: "Aktuell", color: "#10b981", hint: "Die Quelle hat innerhalb ihres erwarteten Takts geliefert." },
  stale:  { label: "Veraltet", color: "#E8A33D", hint: "Die Quelle hat laenger nicht geliefert als erwartet. Der Wert steht, ist aber aelter als der Takt." },
  dead:   { label: "Abgerissen", color: "#C0392B", hint: "Die Quelle liefert seit laengerem gar nicht mehr. Wert nur noch eingeschraenkt belastbar." },
  no_sla: { label: "Ohne Taktvorgabe", color: "#5A6473", hint: "Fuer diese Quelle ist kein erwarteter Liefertakt hinterlegt." },
};

export const QUALITY_TIER_META: Record<QualityTier, { label: string; short: string; hint: string }> = {
  basis: {
    label: "Basis",
    short: "nur Postfach",
    hint: "Nur die zwoelf Kommunikations-Indizes. Keine Zahlen aus Bank, Buchhaltung oder Shop.",
  },
  erweitert: {
    label: "Erweitert",
    short: "Postfach + Shop/Zahlungen",
    hint: "Zusaetzlich Umsatzdynamik, Churn und Mahnstufen aus Shopify bzw. Stripe.",
  },
  voll: {
    label: "Voll",
    short: "Postfach + Shop + Bank/Buchhaltung",
    hint: "Zusaetzlich Liquiditaet, Runway, Forderungslaufzeit und Forderungsalter.",
  },
};

export const CONNECTED_SOURCE_LABEL: Record<string, string> = {
  comms: "Postfach", shopify: "Shopify", stripe: "Stripe", bank: "Bank-Konto (PSD2)",
  maesn: "Buchhaltung", hubspot: "CRM", einvoice: "E-Rechnungen",
  ticketing: "Ticketing", meta_ads: "Meta Ads",
};
export function connectedSourceLabel(k: string): string {
  return CONNECTED_SOURCE_LABEL[k] ?? k;
}

/** Wie belastbar ist die Konfidenz. Nur drei Stufen, damit sie gelesen wird. */
export function confidenceMeta(c: number | null | undefined): { label: string; color: string; hint: string } {
  if (c == null) return { label: "unbekannt", color: "#5A6473", hint: "Zu dieser Bewertung liegt keine Konfidenz vor." };
  if (c >= 0.75) return { label: "belastbar", color: "#10b981", hint: "Breite Datenbasis, Quellen liefern im erwarteten Takt." };
  if (c >= 0.5) return { label: "eingeschraenkt", color: "#E8A33D", hint: "Datenbasis traegt, ist aber duenner oder aelter als der Regelfall." };
  return { label: "schwach", color: "#C0392B", hint: "Zu wenige oder zu alte Signale. Der Wert ersetzt keine eigene Pruefung." };
}

// ── Veraenderungen ───────────────────────────────────────────────────────────

export const SEVERITY_META: Record<ChangeSeverity, { label: string; color: string }> = {
  critical: { label: "Kritisch", color: "#C0392B" },
  warning:  { label: "Warnung", color: "#E8A33D" },
  info:     { label: "Hinweis", color: "#5A6473" },
};

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  threshold_breach: "Schwellwert-Durchbruch",
  distress_risk: "Distress-Risiko",
  trend_down: "Verschlechterung",
  anomaly: "Einbruch",
};

export function directionArrow(d: Direction): string {
  return d === "up" ? "▲" : d === "down" ? "▼" : "▬";
}
/** Bei Scores ist "hoch" immer gut: steigend gruen, fallend rot. */
export function directionColor(d: Direction): string {
  return d === "up" ? "#10b981" : d === "down" ? "#C0392B" : "#5A6473";
}

export function verticalLabel(v: string | null | undefined): string {
  if (!v) return "–";
  const m: Record<string, string> = {
    bau: "Bau", ecom: "E-Commerce", real_estate: "Immobilien", saas: "SaaS",
    finance: "Finanzen", insurance: "Versicherung", b2b_sales: "B2B-Vertrieb",
    platform: "Plattform", global: "Allgemein",
  };
  return m[v] ?? v;
}

// ── Methoden-Bezeichnungen: nichts wird ungeprueft angezeigt ─────────────────
//
// Die Fixtures liefern `provenance.method_label` als fertigen Anzeigetext.
// Darin steckte "Kemaris-Basislinie" - eine interne Abkuerzung fuer unsere
// eigene 8-Wochen-Eigenbaseline, die aber der Name eines Wettbewerbers ist.
// So etwas darf nie in einer Kundenoberflaeche stehen. Deshalb geht jede
// Methodenbezeichnung durch diese Uebersetzung, statt roh gerendert zu werden.

/** Namen, die in keiner Oberflaeche und keinem Export auftauchen duerfen. */
export const FORBIDDEN_VENDOR_TOKENS = ["kemaris"];

const METHOD_LABEL_MAP: Record<string, string> = {
  "kemaris-basislinie (eigene kommunikations-historie)":
    "Eigenbaseline aus der Kommunikations-Historie (8 Wochen)",
  "shopify (bestellungen, read-only)": "Shop-Anbindung (Bestellungen, nur lesend)",
  "bank-konto (psd2, read-only)": "Bankkonto ueber PSD2 (nur lesend)",
  "buchhaltung (read-only)": "Buchhaltung (nur lesend)",
};

/**
 * Uebersetzt eine Methodenbezeichnung in den freigegebenen Anzeigetext.
 * Unbekannte Bezeichnungen werden durchgelassen - aber nur, wenn kein
 * gesperrter Name darin vorkommt. Sonst greift ein neutraler Ersatztext und
 * es gibt eine Meldung in der Konsole, damit der Fall auffaellt.
 */
export function methodLabel(raw: string | null | undefined): string {
  if (!raw) return "Methode nicht hinterlegt";
  const mapped = METHOD_LABEL_MAP[raw.trim().toLowerCase()];
  if (mapped) return mapped;
  const lower = raw.toLowerCase();
  const hit = FORBIDDEN_VENDOR_TOKENS.find((t) => lower.includes(t));
  if (hit) {
    console.error(
      `[risk] Gesperrter Name "${hit}" in einer Methodenbezeichnung: "${raw}". ` +
      "Ersetzt durch einen neutralen Text. Quelle muss korrigiert werden."
    );
    return "Eigene Berechnung auf Basis der angeschlossenen Quellen";
  }
  return raw;
}
