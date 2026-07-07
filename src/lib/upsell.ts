// ---------------------------------------------------------------------------
// M1 Jana-Upsell-Motor - reine Vorschlags-Regel (KEIN DB-/Netz-Touch).
//
// Jana erkennt aus vorhandenen Signalen, wann ein Tenant von einem BESTEHENDEN
// Add-on profitiert, und schlaegt es MIT konkretem Beleg vor. Kein Auto-Kauf,
// kein Dark-Pattern: der Vorschlag oeffnet nur den bestehenden Billing-Kaufweg.
//
// Zwei transparente Regeln (Leon-Entscheid 2026-07-07):
//   1) Haeufung offener Mahn-/Rechts-/Frist-Signale (cap_compliance_alerts, via
//      compliance-radar) -> Branchen-Pack (ue2_branch_pack_monthly, 29 EUR):
//      priorisiert diese Faelle + liefert passende Antwort-Bausteine.
//   2) Hohes Entwurfs-Volumen/Woche (drafts_created_week aus dem bestehenden
//      /stats-Read) -> Autopilot (ue2_autopilot_monthly, 99 EUR): bereitet die
//      Entwuerfe automatisch vor (Reife-Gate, kein Blind-Send).
//
// Ehrlichkeit: JEDER Vorschlag traegt den konkreten Ist-Beleg (Zaehler), nie
// "du solltest upgraden". Schwellen konservativ + hier dokumentiert (robuste,
// deterministische Variante ohne Netz-Kopplung, Muster wie alert-quality.ts).
// Es wird IMMER hoechstens EIN Vorschlag gezeigt (dezent, kein Spam) und nur
// fuer echte Firmen-Konten (nicht das Demo-Profil).
//
// Diese Keys sind mit der Whitelist der `upsell`-Edge-Function identisch.
// ---------------------------------------------------------------------------

export type UpsellKey = "compliance_addon" | "autopilot_addon";

// Subtypes aus cap_compliance_alerts, die das Branchen-Pack (Antwort-Bausteine
// + Priorisierung wiederkehrender Kategorien) tatsaechlich adressiert. DSAR
// (einmalige gesetzliche Frist) zaehlt bewusst NICHT in diesen Cluster.
export const COMPLIANCE_CLUSTER: readonly string[] = [
  "dunning_escalation",
  "legal_signal",
  "deadline_overdue",
];

// --- Schwellen (konservativ, dokumentiert) ---------------------------------
// Ab so vielen offenen Cluster-Signalen schlagen wir das Branchen-Pack vor ...
export const COMPLIANCE_SIGNAL_MIN = 5;
// ... oder sofort, sobald mindestens ein Signal "bestaetigt" (rot) ist.
// Ab so vielen erstellten Entwuerfen/Woche schlagen wir Autopilot vor.
export const DRAFTS_WEEK_MIN = 25;

export type UpsellComplianceItem = { subtype: string; severity: string; count: number | null };

export type UpsellInput = {
  hasTenant: boolean;                       // echtes Firmen-Konto (kein Demo) -> sonst kein Vorschlag
  complianceItems: UpsellComplianceItem[];  // compliance-radar list.items
  draftsCreatedWeek: number;                // /stats drafts_created_week
  dismissed: readonly string[];             // upsell status.dismissed (weggeklickt)
};

export type UpsellSuggestion = {
  key: UpsellKey;
  addonLookupKey: string;   // Stripe lookup_key im bestehenden BillingTab
  addonLabel: string;
  priceLabel: string;
  tier: "info" | "urgent";
  evidenceCount: number;    // der konkrete Ist-Beleg (Zaehler)
  headline: string;         // belegte Kernaussage
  body: string;             // was das Add-on dafuer tut
  basisNote: string;        // transparente Herkunft des Belegs
};

function toCount(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Summe der Ist-Zaehler ueber den Mahn-/Rechts-/Frist-Cluster. */
export function complianceSignalCount(items: UpsellComplianceItem[]): number {
  let sum = 0;
  for (const it of items ?? []) if (COMPLIANCE_CLUSTER.includes(it.subtype)) sum += toCount(it.count);
  return sum;
}

/** Anzahl "bestaetigter" (roter) Cluster-Signale. */
export function complianceConfirmedCount(items: UpsellComplianceItem[]): number {
  let n = 0;
  for (const it of items ?? []) if (COMPLIANCE_CLUSTER.includes(it.subtype) && it.severity === "red") n += 1;
  return n;
}

/**
 * Wertet die Regeln aus und liefert HOECHSTENS EINEN belegten Vorschlag (oder
 * null). Deterministisch, seiteneffektfrei, voll testbar.
 */
export function evaluateUpsell(input: UpsellInput): UpsellSuggestion | null {
  if (!input || !input.hasTenant) return null;
  const dismissed = new Set(input.dismissed ?? []);
  const candidates: UpsellSuggestion[] = [];

  // Regel 1: Compliance-Haeufung -> Branchen-Pack
  if (!dismissed.has("compliance_addon")) {
    const signalCount = complianceSignalCount(input.complianceItems ?? []);
    const confirmed = complianceConfirmedCount(input.complianceItems ?? []);
    if (signalCount >= COMPLIANCE_SIGNAL_MIN || confirmed >= 1) {
      const evidence = signalCount > 0 ? signalCount : confirmed;
      const headline =
        signalCount > 0
          ? `Aktuell ${signalCount} offene Mahn-/Rechts-/Frist-Signal${signalCount === 1 ? "" : "e"} in deiner Compliance-Lage.`
          : `${confirmed} bestätigte${confirmed === 1 ? "s" : ""} Rechts-/Compliance-Signal${confirmed === 1 ? "" : "e"} erkannt.`;
      candidates.push({
        key: "compliance_addon",
        addonLookupKey: "ue2_branch_pack_monthly",
        addonLabel: "Branchen-Pack",
        priceLabel: "29 EUR / Monat",
        tier: confirmed >= 1 ? "urgent" : "info",
        evidenceCount: evidence,
        headline,
        body: "Das Branchen-Pack priorisiert diese Fälle und liefert passende Antwort-Bausteine dafür.",
        basisNote: "Grundlage: offene Signale aus deiner Rechts- und Compliance-Lage.",
      });
    }
  }

  // Regel 2: hohes Entwurfs-Volumen -> Autopilot
  if (!dismissed.has("autopilot_addon")) {
    const drafts = toCount(input.draftsCreatedWeek);
    if (drafts >= DRAFTS_WEEK_MIN) {
      candidates.push({
        key: "autopilot_addon",
        addonLookupKey: "ue2_autopilot_monthly",
        addonLabel: "Autopilot",
        priceLabel: "99 EUR / Monat",
        tier: "info",
        evidenceCount: drafts,
        headline: `Diese Woche ${drafts} Entwürfe erstellt.`,
        body: "Mit Autopilot würden diese automatisch vorbereitet (Reife-Gate, kein Blind-Send).",
        basisNote: "Grundlage: erstellte Entwürfe dieser Woche (Übersicht).",
      });
    }
  }

  if (candidates.length === 0) return null;

  // Nur EINEN Vorschlag zeigen: dringliche (bestaetigte Compliance) zuerst,
  // sonst feste Reihenfolge Compliance -> Autopilot.
  candidates.sort((a, b) => {
    const ua = a.tier === "urgent" ? 0 : 1;
    const ub = b.tier === "urgent" ? 0 : 1;
    if (ua !== ub) return ua - ub;
    const order: UpsellKey[] = ["compliance_addon", "autopilot_addon"];
    return order.indexOf(a.key) - order.indexOf(b.key);
  });
  return candidates[0];
}
