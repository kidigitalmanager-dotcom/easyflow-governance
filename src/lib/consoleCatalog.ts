import {
  Bot, MessageSquare, PhoneCall, Wallet, FileSpreadsheet,
  Headphones, Timer, ShieldAlert, Inbox, Gauge, Layers, Phone, Files,
  type LucideIcon,
} from "lucide-react";
import type { BillingEntitlements } from "@/lib/api-client";

/**
 * Produktkatalog der Konsole — EINE Wahrheit fuer Abo-Tab UND Seitenleiste.
 *
 * Warum diese Datei existiert (Upsell-Schnitt 05.08.2026):
 * Vor dem Umbau lagen PLANS/ADDONS direkt in BillingTab.tsx. Die neue
 * "Entdecken"-Gruppe in der Seitenleiste braucht dieselben Daten (Label, Preis,
 * Nutzen, Bedingung, Entitlement-Feld). Haette sie ihre eigene Liste bekommen,
 * gaebe es in der Console ZWEI Preislisten — und im Gesamtsystem eine VIERTE
 * (Server billing_catalog.js, Website pricingCatalog.ts, Console, Sidebar).
 * Deshalb: Daten hier, BillingTab und AppLayout lesen beide daraus.
 *
 * 🔴 Der `key` ist der Stripe-lookup_key MIT `_monthly`-Suffix, und das ist
 * Absicht. `POST /v1/billing/checkout` (billing_console.js) validiert gegen den
 * normalisierten Schluessel, fragt Stripe aber mit dem ROHEN Wert:
 *     priceId = await priceIdByLookupKey(rawKey);
 * In Stripe existiert KEIN Preis unter dem blanken `ue2_accounting` — dort
 * liegen ausschliesslich `_monthly`/`_yearly`. Ein blanker Schluessel kommt also
 * durch die Katalog-Pruefung und stirbt danach mit 404 `price_not_found`.
 * Gegengeprueft am 05.08.2026 gegen die Live-Preise aller 20 Schluessel.
 *
 * Preise: netto pro Monat, am 05.08.2026 gegen die LIVE-Stripe-Preise verifiziert
 * (tax_behavior=exclusive, USt kommt oben drauf). Aenderungen bitte immer
 * zusammen mit consoleCatalog.test.ts anfassen — der Test pinnt die Zahlen
 * absichtlich, damit ein Preis nicht still driftet.
 */

export type Req = "base" | "voice" | "accounting" | null;

/** Wie erkennt man, dass der Kunde die Leistung schon hat? */
type EntKind = "flag" | "count";

export interface ConsoleItem {
  /** Stripe-lookup_key, MIT _monthly-Suffix (siehe Kopf-Kommentar). */
  key: string;
  label: string;
  /** netto/Monat in Euro. Anzeige immer ueber priceLabel(). */
  price_eur: number;
  unit: string;
  kind: "qty" | "flag" | "plan";
  requires: Req;
  min?: number;
  max?: number;
  /** Kurzzeile fuer die Kachel im Abo-Tab. */
  desc: string;
  /** Feld in den Entitlements, das die Leistung belegt. */
  ent_field?: keyof BillingEntitlements;
  ent_kind?: EntKind;
  /** Bereich der Seitenleiste, in dem der Entdecken-Eintrag erscheint. */
  area?: "arbeit" | "geld" | "mitarbeiter" | "signale";
  icon?: LucideIcon;
  /** 2 bis 3 Saetze fuer das "Was ist das?"-Fenster. Kundensprache, kein Jargon. */
  benefit?: string;
  /** In welchen Paketen ist die Leistung ohne Aufpreis dabei?
   *  Quelle: billing_catalog.js PLAN_ENTITLEMENTS (Server-Wahrheit, v4.191.0). */
  in_bundles?: string[];
}

/** Anzeige-Preis. EINE Formatierung, damit nicht jede Stelle ihr eigenes Format erfindet. */
export function priceLabel(price_eur: number): string {
  const hasCents = Math.abs(price_eur - Math.round(price_eur)) > 0.001;
  return `${price_eur.toLocaleString("de-DE", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })} €`;
}

export const PLANS: ConsoleItem[] = [
  {
    key: "ue2_email_starter_monthly", label: "E-Mail Starter", price_eur: 49, unit: "/ Monat · Postfach",
    kind: "plan", requires: null, desc: "1 Postfach · 1.000 Mails/Monat",
  },
  {
    key: "ue2_email_pro_monthly", label: "E-Mail Pro", price_eur: 99, unit: "/ Monat · Postfach",
    kind: "plan", requires: null, desc: "1 Postfach · 3.000 Mails/Monat",
  },
];

export const ADDONS: ConsoleItem[] = [
  {
    key: "ue2_extra_mailbox_monthly", label: "Zusatz-Postfach", price_eur: 35, unit: "/ Monat · Postfach",
    kind: "qty", requires: "base", min: 1, max: 100,
    desc: "Weiteres Postfach am selben Workspace",
    ent_field: "extra_mailboxes", ent_kind: "count", icon: Inbox,
  },
  {
    key: "ue2_volume_pack_monthly", label: "Volumen-Paket", price_eur: 99, unit: "/ Monat",
    kind: "qty", requires: "base", min: 1, max: 10,
    desc: "+3.000 Mails/Monat je Paket",
    ent_field: "volume_packs", ent_kind: "count", icon: Gauge,
  },
  {
    key: "ue2_autopilot_monthly", label: "Autopilot", price_eur: 99, unit: "/ Monat · Postfach",
    kind: "qty", requires: "base", min: 1, max: 100,
    desc: "Automatisches Senden mit Reife-Gate",
    ent_field: "autopilot_mailboxes", ent_kind: "count",
    area: "arbeit", icon: Bot,
    benefit: "Der Autopilot verschickt fertige Entwürfe selbst, sobald er in deinem Postfach nachweislich sicher genug ist. Bis dahin läuft er still mit und du siehst in jedem Vorgang, was er getan hätte. Rechnungen, Verträge und Beschwerden bleiben immer bei dir.",
    in_bundles: ["Business-Komplett", "Business-Komplett + Voice", "Full-Stack", "Business-Komplett Team"],
  },
  {
    key: "ue2_erp_sync_monthly", label: "Excel-/ERP-Live-Sync", price_eur: 79, unit: "/ Monat",
    kind: "qty", requires: "base", min: 1, max: 20,
    desc: "Excel/OneDrive/SharePoint, Live-Abgleich",
    ent_field: "erp_data_sources", ent_kind: "count",
    area: "geld", icon: FileSpreadsheet,
    benefit: "Termine, Adressen und Änderungen aus einer E-Mail landen per Klick in der richtigen Excel-Datei, statt abgetippt zu werden. Formatierung, Formeln und Filter bleiben erhalten. Bei Pivot-Tabellen, Diagrammen oder Makros warnt UseEasy vorher.",
    in_bundles: ["Business-Komplett", "Business-Komplett + Voice", "Full-Stack", "Business-Komplett Team"],
  },
  {
    key: "ue2_branch_pack_monthly", label: "Branchen-Pack", price_eur: 29, unit: "/ Monat",
    kind: "qty", requires: "base", min: 1, max: 13,
    desc: "Branchen-Labels + Antwort-Bausteine",
    ent_field: "branch_packs", ent_kind: "count", icon: Layers,
  },
  {
    key: "ue2_copilot_seat_monthly", label: "Sales Co-Pilot", price_eur: 39, unit: "/ Monat · Sitz",
    kind: "qty", requires: null, min: 1, max: 100,
    desc: "Live-Transkript + Einwand-Hilfen",
    ent_field: "copilot_seats", ent_kind: "count",
    area: "mitarbeiter", icon: Headphones,
    benefit: "Im Verkaufsgespräch läuft ein Live-Transkript mit und schlägt bei Einwänden die passende Antwort vor. Nach dem Gespräch steht die Zusammenfassung fertig da. Je Sitz sind 500 Gesprächsminuten im Monat enthalten.",
    in_bundles: ["Full-Stack", "Business-Komplett Team"],
  },
  {
    key: "ue2_voice_jana_monthly", label: "Voice „Jana“", price_eur: 199, unit: "/ Monat",
    kind: "flag", requires: null,
    desc: "KI-Telefonassistenz · 1.000 Min inkl.",
    ent_field: "voice_enabled", ent_kind: "flag",
    area: "arbeit", icon: PhoneCall,
    benefit: "Jana geht ans Telefon, wenn niemand abnehmen kann, klärt das Anliegen und legt daraus einen Vorgang an. Anrufer bekommen sofort eine Antwort statt einer Mailbox. 1.000 Gesprächsminuten im Monat sind enthalten, darüber 0,18 € je Minute.",
    in_bundles: ["Business-Komplett + Voice", "Full-Stack", "Business-Komplett Team"],
  },
  {
    key: "ue2_phone_local_monthly", label: "Lokale DE-Nummer", price_eur: 2.99, unit: "/ Monat",
    kind: "qty", requires: "voice", min: 1, max: 100,
    desc: "Festnetz-Nummer für Voice",
    ent_field: "phone_local", ent_kind: "count", icon: Phone,
  },
  {
    key: "ue2_phone_mobile_monthly", label: "Mobile DE-Nummer", price_eur: 30, unit: "/ Monat",
    kind: "qty", requires: "voice", min: 1, max: 100,
    desc: "Mobile Nummer für Voice",
    ent_field: "phone_mobile", ent_kind: "count", icon: Phone,
  },
  // v4.190.0 — Website-Chat „Jana“: standalone buchbar (kein E-Mail-Plan noetig).
  // Nach dem Kauf schaltet der Stripe-Webhook frei; eingerichtet wird unter
  // Einstellungen → Integrationen (WebsiteChatCard: Snippet, Vorschau, Versand).
  {
    key: "ue2_webchat_monthly", label: "Website-Chat „Jana“", price_eur: 49, unit: "/ Monat",
    kind: "flag", requires: null,
    desc: "Chat-Widget auf Ihrer Website · Termine + Rückrufe als Aufträge · Einrichtung unter Integrationen",
    ent_field: "webchat_enabled", ent_kind: "flag",
    area: "arbeit", icon: MessageSquare,
    benefit: "Ein Chat-Fenster auf deiner Website, in dem Jana Besucher berät, Termine aufnimmt und Rückrufe entgegennimmt. Jede Anfrage kommt als Vorgang mit Nummer in der Konsole an, nicht als anonymer Chat-Verlauf. Eingebaut wird es mit einer Zeile Code, die UseEasy dir zuschickt.",
    in_bundles: ["Full-Stack", "Business-Komplett Team"],
  },
  // ── Upsell-Schnitt 05.08.2026: diese vier Kacheln fehlten in der Konsole ────
  // Serverseitig sind sie seit v4.104.0 kaufbar (billing_catalog.js ADDON_BY_KEY:
  // ue2_accounting, ue2_accounting_time, ue2_accounting_docpack,
  // ue2_compliance_radar) und auf useeasy.ai/pricing verkauft — im Abo-Tab gab es
  // sie nur nie. Wer sie in der Konsole wollte, konnte sie dort nicht buchen.
  {
    key: "ue2_accounting_monthly", label: "Buchhaltung", price_eur: 34, unit: "/ Monat",
    kind: "flag", requires: "base",
    desc: "Belege lesen, zuordnen, exportieren · 400 Belege/Monat inkl.",
    ent_field: "accounting_enabled", ent_kind: "flag",
    area: "geld", icon: Wallet,
    benefit: "Rechnungen und Belege aus dem Postfach werden gelesen, den richtigen Konten zugeordnet und für die Steuerkanzlei exportiert. Forderungen und Verbindlichkeiten stehen danach als Liste da, statt im Postfach zu liegen. 400 Belege im Monat sind enthalten.",
    in_bundles: ["Full-Stack", "Business-Komplett Team"],
  },
  {
    key: "ue2_accounting_time_monthly", label: "Zeiterfassung & Lohn-Export", price_eur: 5, unit: "/ Monat",
    kind: "flag", requires: "accounting",
    desc: "Arbeitszeiten erfassen + Lohn-Export · benötigt Buchhaltung",
    ent_field: "time_tracking_enabled", ent_kind: "flag",
    area: "mitarbeiter", icon: Timer,
    benefit: "Arbeitszeiten deines Teams werden erfasst und als fertiger Lohn-Export an die Kanzlei übergeben. Läuft auf denselben Daten wie die Buchhaltung, deshalb ist keine zweite Erfassung nötig. Setzt die Buchhaltung voraus.",
    in_bundles: ["Full-Stack", "Business-Komplett Team"],
  },
  {
    key: "ue2_accounting_docpack_monthly", label: "Beleg-Paket", price_eur: 19, unit: "/ Monat",
    kind: "qty", requires: "accounting", min: 1, max: 20,
    desc: "+200 Belege/Monat je Paket · benötigt Buchhaltung",
    ent_field: "doc_packs", ent_kind: "count", icon: Files,
  },
  {
    key: "ue2_compliance_radar_monthly", label: "Compliance-Radar", price_eur: 49, unit: "/ Monat",
    kind: "flag", requires: null,
    desc: "Fristen, Mahn-Eskalation, DSGVO-Frühwarnung aus dem Postfach",
    ent_field: "compliance_radar", ent_kind: "flag",
    area: "signale", icon: ShieldAlert,
    benefit: "UseEasy erkennt im Postfach, wo eine Frist läuft, eine Mahnung eskaliert oder eine DSGVO-Auskunft angefragt wurde, und warnt vorher. Du siehst das Signal mit Belegstelle, bevor daraus ein Problem wird. Ein Hinweis, keine Rechtsberatung.",
    in_bundles: ["Business-Komplett", "Business-Komplett + Voice", "Full-Stack", "Business-Komplett Team"],
  },
];

/** Alle Positionen, in der Reihenfolge der Anzeige. */
export function allConsoleItems(): ConsoleItem[] {
  return [...PLANS, ...ADDONS];
}

export function hasBase(e?: BillingEntitlements | null): boolean {
  return !!(e && e.base_plan);
}

/**
 * Hat der Kunde die Leistung schon?
 *
 * Bewusst NICHT dasselbe wie der "Aktiv"-Zustand einer Kachel: ein zweites
 * Postfach darf man dazubuchen, obwohl schon eines da ist. Diese Funktion
 * beantwortet nur die Upsell-Frage "fehlt dem Kunden diese Faehigkeit?".
 */
export function isBooked(it: ConsoleItem, e?: BillingEntitlements | null): boolean {
  if (!e || !it.ent_field) return false;
  const raw = e[it.ent_field];
  if (it.ent_kind === "flag") return raw === true;
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0;
}

/**
 * Kauf-Bedingung. Spiegelt catalog.canPurchase() aus billing_catalog.js.
 *
 * 🔴 Die Reihenfolge ist nicht beliebig: der Server prueft bei
 * REQUIRES_ACCOUNTING_KEYS ZUERST den Basis-Plan und danach die Buchhaltung
 * (requires_base_plan vor requires_accounting). Wer hier nur "Benoetigt
 * Buchhaltung" anzeigt, schickt einen Kunden ohne Basis-Plan in einen 403,
 * dessen Grund er vorher nicht lesen konnte.
 */
export function gate(it: ConsoleItem, e?: BillingEntitlements | null): { ok: boolean; hint?: string } {
  if (it.requires === "base") {
    return hasBase(e) ? { ok: true } : { ok: false, hint: "Benötigt einen E-Mail-Plan" };
  }
  if (it.requires === "voice") {
    return e?.voice_enabled ? { ok: true } : { ok: false, hint: "Benötigt Voice „Jana“" };
  }
  if (it.requires === "accounting") {
    if (!hasBase(e)) return { ok: false, hint: "Benötigt einen E-Mail-Plan" };
    return e?.accounting_enabled ? { ok: true } : { ok: false, hint: "Benötigt Buchhaltung" };
  }
  return { ok: true };
}

/**
 * Die "Entdecken"-Eintraege eines Bereichs: alles, was der Kunde NICHT hat.
 *
 * Gebucht = weg. Wer Full-Stack oder Team fährt, hat alles und sieht die Gruppe
 * damit gar nicht mehr — es gibt dort nichts zu verkaufen. Solange die
 * Entitlements noch laden, ist `ent` undefined; dann gibt diese Funktion eine
 * leere Liste zurueck, damit nichts flackert und nichts faelschlich grau wird.
 */
export function discoverForArea(areaKey: string, e?: BillingEntitlements | null): ConsoleItem[] {
  if (!e) return [];
  return ADDONS.filter((it) => it.area === areaKey && !isBooked(it, e));
}

/** Deep-Link auf die Kachel im Abo-Tab. */
export function addonDeepLink(it: ConsoleItem): string {
  return `/einstellungen?tab=billing&addon=${encodeURIComponent(it.key)}`;
}

/**
 * Was Jana ueber den Buchungsstand wissen darf (Console-Chat, jana-chat).
 *
 * Bewusst die ROHEN Entitlement-Felder und nicht unsere `key`s: die
 * Edge-Function hat ihren eigenen Produkt-Schluesselraum (`voice`, `autopilot`)
 * und bildet selbst ab. Wuerden wir hier schon uebersetzen, gaebe es zwei
 * Uebersetzungstabellen, die auseinanderlaufen koennen.
 *
 * Keine PII: nur Buchungsstand und Mengen, keine Namen, Mails oder Nummern.
 * Die Daten liegen im react-query-Cache von `billing-summary` — kein neuer
 * Request nur fuer den Chat.
 */
export function entitlementContext(e?: BillingEntitlements | null): Record<string, unknown> | null {
  if (!e) return null;
  return {
    base_plan: e.base_plan ?? null,
    voice_enabled: !!e.voice_enabled,
    webchat_enabled: !!e.webchat_enabled,
    compliance_radar: !!e.compliance_radar,
    accounting_enabled: !!e.accounting_enabled,
    time_tracking_enabled: !!e.time_tracking_enabled,
    unlimited_mailboxes: !!e.unlimited_mailboxes,
    autopilot_mailboxes: Number(e.autopilot_mailboxes ?? 0),
    erp_data_sources: Number(e.erp_data_sources ?? 0),
    copilot_seats: Number(e.copilot_seats ?? 0),
    branch_packs: Number(e.branch_packs ?? 0),
    extra_mailboxes: Number(e.extra_mailboxes ?? 0),
    volume_packs: Number(e.volume_packs ?? 0),
    phone_local: Number(e.phone_local ?? 0),
    phone_mobile: Number(e.phone_mobile ?? 0),
    doc_packs: Number(e.doc_packs ?? 0),
  };
}
