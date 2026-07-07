// ─────────────────────────────────────────────────────────────────────────────
// foerder-report-model.ts — reine, testbare Aufbereitung des Foerder-Radars fuer
// den teilbaren "Latentes-Kapital"-Report (Print -> PDF). Spiegelt das Muster von
// report-model.ts: KEIN React, KEIN Fetch, nur Datentransformation. Nimmt die
// bereits geladene FoerderRadar-Antwort (kpi/programs/conditional/profile) und
// erzeugt das Report-Sichtmodell: latentes Kapital als Bandbreite mit Methode,
// Top-Matches mit belegter Begruendung, Zaehler, Quellen.
//
// Ehrlichkeit: Zahlen IMMER als Schaetzung mit Bandbreite; KEINE Bewilligungs-
// quoten; Auto-importierte (ungepruefte) Programme fliessen NICHT in die
// Kopfzahl und nicht in die Top-Matches ein.
// ─────────────────────────────────────────────────────────────────────────────
import {
  BUNDESLAENDER, fmtEur,
  type FoerderRadar, type FoerderProgram, type GrantStatusClass,
} from "@/lib/capital";

export type FoerderReportMatch = {
  program_key: string;
  name: string;
  traeger: string;               // Provider bzw. Ebene (Traeger des Programms)
  level: string | null;
  region: string | null;
  amountLabel: string;           // "X bis Y" | "bis Y" | "individuell"
  amount_min_eur: number | null;
  amount_max_eur: number | null;
  status_class: GrantStatusClass;
  statusLabel: string;           // web-verifiziert | Status pruefen | pausiert
  isStartup: boolean;
  fitLabel: string;              // Passung (Kurz-Badge)
  reason: string;                // deterministische, belegte Begruendung
  conditionalNote: string | null;
  source: string | null;
};

export type FoerderReportModel = {
  companyName: string;
  vertical: string | null;
  verticalLabel: string;
  profile: { founding_year: number | null; city: string | null; region: string | null; employee_count: number | null } | null;
  regionLabel: string | null;
  companyAge: number | null;
  // Latentes Kapital als Bandbreite (Schaetzung):
  latentLow: number;
  latentHigh: number;
  latentIsRange: boolean;
  verifiedMax: number;
  verifiedCount: number;
  grantCount: number;
  conditionalCount: number;
  financingCount: number;
  // Programme:
  topMatches: FoerderReportMatch[];
  moreMatchCount: number;        // passende Zuschuesse ueber die Tabelle hinaus
  conditionalMatches: FoerderReportMatch[];
  // Quellen / Transparenz:
  sources: string[];
  autoExcludedCount: number;     // ungeprueft, NICHT in der Kopfzahl
  generatedAtIso: string;
};

const STATUS_LABEL: Record<GrantStatusClass, string> = {
  verified: "web-verifiziert",
  verify: "Status pruefen",
  paused: "pausiert",
};
const GRANT_CLASS_LABEL: Record<string, string> = {
  zuschuss: "Zuschuss",
  stipendium: "Stipendium",
  kredit: "Kredit",
  gemischt: "gemischt",
  finanzierung: "Finanzierung",
};

const MAX_TOP_MATCHES = 12;
const MAX_CONDITIONAL = 6;

export function foerderAmountLabel(min: number | null | undefined, max: number | null | undefined): string {
  const hi = max ?? 0;
  if (hi <= 0) return "individuell";
  if (min != null && min > 0 && min !== hi) return `${fmtEur(min)} bis ${fmtEur(hi)}`;
  return `bis ${fmtEur(hi)}`;
}

// Deterministische, ausschliesslich aus belegten Katalog-Feldern zusammengesetzte
// Begruendung. Fabriziert nichts: nimmt Eignung/Beschreibung/Foerderart, sonst
// Traeger. Bei konditionalen Programmen die Klartext-Bedingung.
function deterministicReason(p: FoerderProgram): string {
  if (p.match_status === "conditional" && p.match_reason) {
    return `Greift, sobald erfuellt: ${clip(p.match_reason, 200)}`;
  }
  const who = clip(p.eligibility ?? "", 200);
  if (who) return who;
  const desc = clip(p.description ?? "", 200);
  if (desc) return desc;
  const ft = clip(p.funding_type ?? "", 160);
  if (ft) return ft;
  return [p.level, p.provider].filter(Boolean).join(" · ") || "Belege im Programm-Detail.";
}

function fitLabelFor(p: FoerderProgram, verticalLabel: string): string {
  if (p.match_status === "conditional") return "Bedingt relevant";
  return `Passt zu Ihrem Profil (${verticalLabel})`;
}

function clip(s: string, n: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

function toMatch(p: FoerderProgram, verticalLabel: string): FoerderReportMatch {
  return {
    program_key: p.program_key,
    name: p.name,
    traeger: p.provider ?? p.level ?? "-",
    level: p.level,
    region: p.region,
    amountLabel: foerderAmountLabel(p.amount_min_eur, p.amount_max_eur),
    amount_min_eur: p.amount_min_eur,
    amount_max_eur: p.amount_max_eur,
    status_class: p.status_class,
    statusLabel: STATUS_LABEL[p.status_class] ?? "Status pruefen",
    isStartup: !!p.is_startup_program,
    fitLabel: fitLabelFor(p, verticalLabel),
    reason: deterministicReason(p),
    conditionalNote: p.conditional_note ?? null,
    source: p.source ?? null,
  };
}

const isCuratedGrant = (p: FoerderProgram): boolean =>
  (p.grant_class === "zuschuss" || p.grant_class === "stipendium") &&
  (p.amount_max_eur ?? 0) > 0 &&
  p.source_type !== "auto";

// verifiziert zuerst, dann Foerderhoehe absteigend (stabile, deterministische Ordnung).
function rankGrants(a: FoerderProgram, b: FoerderProgram): number {
  const av = a.status_class === "verified" ? 1 : 0;
  const bv = b.status_class === "verified" ? 1 : 0;
  if (av !== bv) return bv - av;
  return (b.amount_max_eur ?? 0) - (a.amount_max_eur ?? 0);
}

export function buildFoerderReportModel(
  radar: FoerderRadar,
  opts?: { blurbs?: Record<string, string> | null; nowIso?: string },
): FoerderReportModel {
  const verticalLabel = radar.vertical_label ?? radar.vertical ?? "Allgemein";
  const programs = radar.programs ?? [];
  const conditional = radar.conditional_programs ?? [];
  const kpi = radar.kpi;

  const curatedGrants = programs.filter(isCuratedGrant).slice().sort(rankGrants);
  const condGrants = conditional.filter((p) => isCuratedGrant(p) || (p.grant_class === "zuschuss" || p.grant_class === "stipendium")).slice().sort(rankGrants);
  const autoExcludedCount = programs.filter((p) => p.source_type === "auto").length;

  const topMatches = curatedGrants.slice(0, MAX_TOP_MATCHES).map((p) => toMatch(p, verticalLabel));
  const conditionalMatches = condGrants.slice(0, MAX_CONDITIONAL).map((p) => toMatch(p, verticalLabel));

  // Optionale LLM-Textbausteine (belegt, zitat-treu) je Programm ueberlagern die
  // deterministische Begruendung; fehlt/leert der Baustein, bleibt die belegte
  // Fallback-Begruendung stehen.
  const blurbs = opts?.blurbs ?? null;
  if (blurbs) {
    for (const m of topMatches) {
      const b = (blurbs[m.program_key] ?? "").trim();
      if (b) m.reason = clip(b, 320);
    }
  }

  const verifiedMax = kpi?.latent_verified_max ?? 0;
  const verifiedCount = kpi?.verified_count ?? 0;
  const totalMax = kpi?.latent_total_max ?? 0;
  const totalMin = kpi?.latent_total_min ?? 0;
  const latentHigh = totalMax;
  const latentLow = verifiedCount > 0 && verifiedMax > 0 ? verifiedMax : totalMin;
  const latentIsRange = latentLow > 0 && latentLow < latentHigh;

  const region = radar.profile?.region ?? null;
  const regionLabel = region ? (BUNDESLAENDER.find((b) => b.key === region)?.label ?? region) : null;
  const founding = radar.profile?.founding_year ?? null;
  const companyAge = founding && founding > 1900 ? Math.max(0, new Date().getFullYear() - founding) : null;

  const sources = Array.from(new Set(curatedGrants.map((p) => p.source).filter((s): s is string => !!s))).slice(0, 12);

  return {
    companyName: radar.account_name ?? "Ihr Unternehmen",
    vertical: radar.vertical,
    verticalLabel,
    profile: radar.profile
      ? { founding_year: radar.profile.founding_year, city: radar.profile.city, region: radar.profile.region, employee_count: radar.profile.employee_count }
      : null,
    regionLabel,
    companyAge,
    latentLow,
    latentHigh,
    latentIsRange,
    verifiedMax,
    verifiedCount,
    grantCount: kpi?.grant_count ?? curatedGrants.length,
    conditionalCount: kpi?.conditional_count ?? conditionalMatches.length,
    financingCount: kpi?.financing_count ?? 0,
    topMatches,
    moreMatchCount: Math.max(0, curatedGrants.length - topMatches.length),
    conditionalMatches,
    sources,
    autoExcludedCount,
    generatedAtIso: opts?.nowIso ?? new Date().toISOString(),
  };
}
