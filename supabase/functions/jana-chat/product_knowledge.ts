// jana-chat/product_knowledge.ts — reines, seiteneffektfreies Produktwissen.
// Deno-frei + Netzwerk-frei (testbar mit `node --experimental-strip-types`).
//
// Zweck: Jana kann UseEasy-Produkte, Preise, Bundles und Limits KORREKT erklaeren
// und situativ passende Features vorschlagen (kein Auto-Kauf, nur erklaeren +
// auf die Buchung verweisen). EINE Quelle der Wahrheit fuer den Produktkatalog
// (Preisstruktur 2.0, Excel/Stripe-verifiziert 10./11.06.2026).
//
// Regeln: Preise/Fakten kommen NUR aus diesem Katalog. Der Renderer ist
// deterministisch, die Zitat-/Preis-Validierung verwirft erfundene Angaben.

import { parseLLMJson, redactPII } from "./core.ts";

// ── Buchungsziel (Deep-Link in die Konsole) ──────────────────────────────────
export const BOOKING_PATH = "/einstellungen?tab=billing";
export const BOOKING_LABEL = "Einstellungen → Abo & Zusatz"; // "Einstellungen -> Abo & Zusatz"
export const BUY_DEEPLINK = { label: "Zu Abo & Zusatz", path: BOOKING_PATH };

/**
 * Deep-Link auf EINE Kachel im Abo-Tab (v24, 05.08.2026).
 *
 * Der Abo-Tab liest `?addon=<lookup_key>`, scrollt zur Kachel und hebt sie kurz
 * hervor. Ohne konkretes Produkt bleibt es beim allgemeinen Link — nie raten:
 * ein falscher lookup_key wuerde still ins Leere zeigen.
 */
export function buyDeepLinkFor(items: ProductItem[]): { label: string; path: string } {
  const mit = items.filter((i) => i.lookup_key);
  if (mit.length !== 1) return BUY_DEEPLINK;
  const it = mit[0];
  return { label: `${it.name} ansehen`, path: `${BOOKING_PATH}&addon=${it.lookup_key}` };
}

// ── Katalog-Typen ────────────────────────────────────────────────────────────
export type ProductItem = {
  key: string;              // stabile ID, wird zitiert
  name: string;
  price_eur: number | null; // netto/Monat (bzw. je Einheit); null nur bei reinen Fakten
  unit: string;             // menschliche Einheit, z.B. "/Postfach/Monat"
  includes?: string;        // Inklusiv-Menge, z.B. "1.000 Mails/Monat"
  overage?: string;         // Overage-Regel, z.B. "0,18 Euro/Min"
  yearly_eur?: number;      // fixe Jahres-Gesamtsumme (nur Bundles)
  standalone?: boolean;     // standalone buchbar?
  requires_base?: boolean;  // braucht Basis-Plan (ab Starter)
  note?: string;
  benefit: string;          // 1-Satz-Nutzen
  /**
   * Stripe-lookup_key MIT `_monthly`-Suffix, fuer den Deep-Link in den Abo-Tab.
   * 🔴 Das Suffix ist Pflicht: billing_console.js fragt Stripe mit dem ROHEN
   * Wert, und ein blanker Schluessel wie `ue2_accounting` existiert dort nicht
   * (404 price_not_found). Identisch mit src/lib/consoleCatalog.ts der Konsole.
   * Fehlt bei allem, was man nicht direkt in der Konsole kauft.
   */
  lookup_key?: string;
  /**
   * Entitlement-Feld, das belegt, dass der Kunde die Leistung HAT.
   * Quelle: governance.tenant_entitlements bzw. billing_catalog.js FLAG_FIELDS /
   * NUMERIC_FIELDS. Wird gegen `TenantCtx.ent` gehalten, damit Jana nicht
   * anbietet, was schon bezahlt ist.
   */
  ent_field?: string;
  ent_kind?: "flag" | "count";
  /** Katalog-Keys der enthaltenen Leistungen (nur Bundles), fuer den Listenwert. */
  includes_keys?: string[];
};

export type ProductCatalog = {
  plans: ProductItem[];
  addons: ProductItem[];
  bundles: ProductItem[];
  numbers: ProductItem[];
  /** Ohne Aufpreis in JEDEM Paket dabei — nichts zu verkaufen, aber erklaerbar. */
  included: ProductItem[];
  overage: { label: string; value: string }[];
  discounts: string[];
  facts: string[];
  booking: string;
};

// ── Produktkatalog (Preisstruktur 2.0, netto/Monat) ──────────────────────────
export const PRODUCT_CATALOG: ProductCatalog = {
  plans: [
    { key: "starter", name: "E-Mail Starter", price_eur: 49, unit: "/Postfach/Monat", includes: "1.000 Mails/Monat", standalone: true,
      lookup_key: "ue2_email_starter_monthly",
      benefit: "Automatische E-Mail-Klassifikation, Inbox-Organisation und Antwort-Entwuerfe fuer ein Postfach." },
    { key: "pro", name: "E-Mail Pro", price_eur: 99, unit: "/Postfach/Monat", includes: "3.000 Mails/Monat", standalone: true,
      lookup_key: "ue2_email_pro_monthly",
      benefit: "Wie Starter, mit groesserem Mail-Kontingent (3.000 Mails)." },
  ],
  addons: [
    { key: "voice", name: "Voice „Jana“", price_eur: 199, unit: "/Monat", includes: "1.000 Minuten", overage: "0,18 Euro/Min", standalone: true,
      lookup_key: "ue2_voice_jana_monthly", ent_field: "voice_enabled", ent_kind: "flag",
      benefit: "Jana nimmt Anrufe an, klaert Anliegen und ruft zurueck (Telefonie)." },
    { key: "copilot", name: "Sales Co-Pilot", price_eur: 39, unit: "/Sitz/Monat", includes: "500 Minuten/Sitz", standalone: true,
      lookup_key: "ue2_copilot_seat_monthly", ent_field: "copilot_seats", ent_kind: "count",
      benefit: "Live-Gespraechsassistenz fuer Vertriebsteams (Einwand-Hilfe, Skript, Notizen)." },
    { key: "erp_sync", name: "Excel-/ERP-Live-Sync", price_eur: 79, unit: "/Monat", requires_base: true,
      lookup_key: "ue2_erp_sync_monthly", ent_field: "erp_data_sources", ent_kind: "count",
      benefit: "Termine und Aenderungen aus E-Mails per Klick in die richtige Excel-/ERP-Datei; Formatierung bleibt erhalten (Style-Preservation), Warn-Badge bei Pivots/Charts/Makros." },
    { key: "autopilot", name: "Autopilot", price_eur: 99, unit: "/Postfach/Monat", requires_base: true,
      lookup_key: "ue2_autopilot_monthly", ent_field: "autopilot_mailboxes", ent_kind: "count",
      benefit: "Sendet Entwuerfe assistiert oder autonom mit Reife-Gate; Rechnungen, Vertraege und Beschwerden nie automatisch." },
    { key: "branchen_pack", name: "Branchen-Pack", price_eur: 29, unit: "/Pack/Monat", requires_base: true,
      lookup_key: "ue2_branch_pack_monthly", ent_field: "branch_packs", ent_kind: "count",
      benefit: "Branchenspezifische Klassifikations-Regeln (z.B. Hausverwaltung)." },
    { key: "zusatz_postfach", name: "Zusatz-Postfach", price_eur: 35, unit: "/Postfach/Monat", requires_base: true,
      lookup_key: "ue2_extra_mailbox_monthly", ent_field: "extra_mailboxes", ent_kind: "count",
      benefit: "Ein weiteres Postfach (z.B. info@ zusaetzlich zu schaden@)." },
    { key: "compliance_radar", name: "Compliance-Radar", price_eur: 49, unit: "/Monat", standalone: true,
      lookup_key: "ue2_compliance_radar_monthly", ent_field: "compliance_radar", ent_kind: "flag",
      benefit: "Warnt aus dem Postfach vor der eigenen Rechtslage: Fristen, Mahn-Eskalation, DSGVO-Fruehwarnung. Signal, keine Rechtsberatung. In allen Bundles enthalten." },
    { key: "volumen_paket", name: "Volumen-Paket", price_eur: 99, unit: "/Monat", includes: "+3.000 Mails", requires_base: true,
      lookup_key: "ue2_volume_pack_monthly", ent_field: "volume_packs", ent_kind: "count",
      benefit: "Zusaetzliches Mail-Kontingent von 3.000 Mails/Monat." },
    // ── v24 (05.08.2026): vier Produkte, die Jana bis dahin NICHT kannte. ────
    // Serverseitig seit v4.104.0 bzw. v4.190.0 kaufbar (billing_catalog.js
    // ADDON_BY_KEY) und auf useeasy.ai/pricing verkauft. Preise am 05.08.2026
    // gegen die LIVE-Stripe-Preise geprueft.
    { key: "webchat", name: "Website-Chat „Jana“", price_eur: 49, unit: "/Monat", standalone: true,
      lookup_key: "ue2_webchat_monthly", ent_field: "webchat_enabled", ent_kind: "flag",
      note: "in Full-Stack und Business-Komplett Team enthalten",
      benefit: "Chat-Fenster auf der eigenen Website: Jana beraet Besucher, nimmt Termine und Rueckrufe auf und legt daraus einen Vorgang mit Nummer an. Einbau mit einer Zeile Code, Einrichtung unter Einstellungen -> Integrationen." },
    { key: "accounting", name: "Buchhaltung", price_eur: 34, unit: "/Monat", includes: "400 Belege/Monat", requires_base: true,
      lookup_key: "ue2_accounting_monthly", ent_field: "accounting_enabled", ent_kind: "flag",
      note: "in Full-Stack und Business-Komplett Team enthalten",
      benefit: "Liest Rechnungen und Belege aus dem Postfach, ordnet sie den Konten zu und exportiert sie fuer die Steuerkanzlei; Forderungen und Verbindlichkeiten stehen danach als Liste da." },
    { key: "accounting_time", name: "Zeiterfassung & Lohn-Export", price_eur: 5, unit: "/Monat",
      lookup_key: "ue2_accounting_time_monthly", ent_field: "time_tracking_enabled", ent_kind: "flag",
      note: "setzt die Buchhaltung voraus; in Full-Stack und Business-Komplett Team enthalten",
      benefit: "Arbeitszeiten erfassen und als fertigen Lohn-Export an die Kanzlei geben, auf denselben Daten wie die Buchhaltung." },
    { key: "beleg_paket", name: "Beleg-Paket", price_eur: 19, unit: "/Paket/Monat", includes: "+200 Belege",
      lookup_key: "ue2_accounting_docpack_monthly", ent_field: "doc_packs", ent_kind: "count",
      note: "setzt die Buchhaltung voraus",
      benefit: "Zusaetzliches Beleg-Kontingent von 200 Belegen/Monat je Paket." },
  ],
  bundles: [
    { key: "bundle_hv", name: "Business-Komplett", price_eur: 235, unit: "/Monat", yearly_eur: 2256, includes: "E-Mail Pro + Excel-/ERP-Live-Sync + Autopilot + Branchen-Pack + Compliance-Radar",
      lookup_key: "ue2_bundle_hv_monthly",
      includes_keys: ["pro", "erp_sync", "autopilot", "branchen_pack", "compliance_radar"],
      benefit: "Das Branchen-Komplettpaket (inkl. Branchen-Pack); Kombi-Rabatt bereits eingerechnet. Compliance-Radar inklusive." },
    { key: "bundle_hv_voice", name: "Business-Komplett + Voice", price_eur: 380, unit: "/Monat", yearly_eur: 3648, includes: "Business-Komplett (inkl. Branchen-Pack) + Voice „Jana“ (1.000 Min) + Mobil-Rufnummer",
      lookup_key: "ue2_bundle_hv_voice_monthly",
      includes_keys: ["pro", "erp_sync", "autopilot", "branchen_pack", "compliance_radar", "voice"],
      benefit: "Business-Komplett plus Telefonie; Kombi-Rabatt bereits eingerechnet. Compliance-Radar inklusive." },
    // 🔴 Korrektur v24: Full-Stack enthaelt laut billing_catalog.js
    // PLAN_ENTITLEMENTS.fullstack AUCH Buchhaltung, Zeiterfassung und den
    // Website-Chat (accounting_enabled / time_tracking_enabled / webchat_enabled).
    // Bis v23 stand das nicht im Katalog, Jana hat es also verschwiegen.
    { key: "bundle_fullstack", name: "Full-Stack", price_eur: 499, unit: "/Monat", yearly_eur: 4790.40, includes: "E-Mail Pro + Excel-/ERP-Live-Sync + Autopilot + Voice + 3 Co-Pilot-Sitze + Branchen-Pack + Compliance-Radar + Buchhaltung + Zeiterfassung + Website-Chat",
      lookup_key: "ue2_bundle_fullstack_monthly",
      includes_keys: ["pro", "erp_sync", "autopilot", "voice", "copilot", "branchen_pack", "compliance_radar", "accounting", "accounting_time", "webchat"],
      benefit: "Festpreis fuer den gesamten Stack; Kombi-Rabatt bereits eingerechnet." },
    // Business-Komplett Team (799): bis v23 kannte Jana dieses Paket gar nicht.
    // Bewusst OHNE includes_keys: der Mehrwert sind unbegrenzte Postfaecher,
    // 10.000 Mails, 4 Co-Pilot-Sitze und 3 Branchen-Packs — ein Listenwert daraus
    // waere gerechnet und nicht belegt. Lieber keine Zahl als eine erfundene.
    { key: "bundle_team", name: "Business-Komplett Team", price_eur: 799, unit: "/Monat", yearly_eur: 7670.40, includes: "unbegrenzt viele Postfaecher + 10.000 Mails/Monat + Excel-/ERP-Live-Sync + Autopilot + Voice „Jana“ + Lokal-Rufnummer + 4 Co-Pilot-Sitze + 3 Branchen-Packs + Compliance-Radar + Buchhaltung + Zeiterfassung + Website-Chat",
      lookup_key: "ue2_bundle_team_monthly",
      benefit: "Das groesste Paket, fuer Betriebe mit mehreren Postfaechern und einem Vertriebsteam: Postfaecher sind unbegrenzt, alles andere ist enthalten." },
  ],
  numbers: [
    { key: "nummer_lokal", name: "Lokale Rufnummer", price_eur: 2.99, unit: "/Nummer/Monat", note: "nur mit Voice buchbar",
      lookup_key: "ue2_phone_local_monthly", ent_field: "phone_local", ent_kind: "count",
      benefit: "Deutsche Festnetz-/Lokalnummer je Rufnummer." },
    { key: "nummer_mobil", name: "Mobile Rufnummer", price_eur: 30, unit: "/Nummer/Monat", note: "in den Voice-Bundles bereits enthalten",
      lookup_key: "ue2_phone_mobile_monthly", ent_field: "phone_mobile", ent_kind: "count",
      benefit: "Deutsche Mobilnummer je Rufnummer." },
  ],
  // ── Ohne Aufpreis dabei (Leon-Entscheid 03.08.2026) ─────────────────────────
  // Der Kapital-Layer ist fuer Firmenkunden in JEDEM Paket enthalten, schon ab
  // E-Mail Starter. Er steht auf useeasy.ai/pricing nicht drauf und war bis v23
  // auch bei Jana nicht hinterlegt — auf die Frage "was kann UseEasy alles?"
  // fehlte damit genau der Teil, den Jana selbst bedient. price_eur: null,
  // damit daraus keine Preis-Zahl und kein Kaufhinweis entsteht.
  included: [
    { key: "signale", name: "Signale & Gesundheit", price_eur: null, unit: "", note: "ohne Aufpreis in jedem Paket",
      benefit: "Ein Gesundheitswert von 0 bis 100 aus den eigenen Daten, mit Verlauf und Begruendung je Kennzahl; jede Aussage traegt ihre Quelle." },
    { key: "risk_shield", name: "Fruehwarnung (Risk Shield)", price_eur: null, unit: "", note: "ohne Aufpreis in jedem Paket",
      benefit: "Meldet Verschlechterungen und Abweichungen, bevor sie im Tagesgeschaeft auffallen, mit Belegstelle und empfohlener Handlung." },
    { key: "chancen", name: "Chancen & Foerder-Radar", price_eur: null, unit: "", note: "ohne Aufpreis in jedem Paket",
      benefit: "Passende Foerderprogramme und Chancen zum eigenen Profil, statt selbst zu suchen." },
    { key: "jana_konsole", name: "Jana in der Konsole", price_eur: null, unit: "", note: "ohne Aufpreis in jedem Paket",
      benefit: "Diese Beratung hier: erklaert Kennzahlen, Signale und Produkte und belegt jede Zahl mit ihrer Quelle." },
  ],
  overage: [
    { label: "E-Mail ueber Kontingent", value: "0,04 Euro/Mail" },
    { label: "Voice ueber 1.000 Min", value: "0,18 Euro/Min" },
    { label: "Co-Pilot ueber 500 Min", value: "0,05 Euro/Min" },
  ],
  discounts: [
    "Kombi-Rabatt: 2 Module 10 %, 3 Module 15 %, 4 oder mehr Module 20 %.",
    "Jahreszahlung: minus 20 %.",
  ],
  facts: [
    "Kein Auto-Send im Standard: UseEasy erstellt Entwuerfe, die Sende-Entscheidung trifft der Kunde (Compliance/DSGVO). Nur der Autopilot kann mit Reife-Gate senden, kritische Faelle nie.",
    "Verarbeitung in Frankfurt (AWS eu-central-1), EU-Hosting.",
    "PII-Pseudonymisierung vor dem LLM (Namen, Mails, Nummern werden vor der KI entfernt).",
    "193 Klassifikations-Regeln in 13 Branchen-Packs (aktuelle Liste live via GET https://api.useeasy.ai/v1/onboarding/packs).",
    "Outlook-Add-in und Chrome-Extension fuer die Bedienung direkt im Postfach.",
    "24h-Initial-Backfill: beim Verbinden eines Postfachs werden die letzten 24 Stunden nachgeholt.",
    "Postfach-Wechsel: 1 Wechsel frei, danach 30 Tage Sperre.",
    "Der Kapital-Layer (Signale, Fruehwarnung, Chancen/Foerder-Radar, Jana in der Konsole) ist fuer Firmenkunden im Grundpreis enthalten — in JEDEM Paket und schon ab E-Mail Starter, ohne Aufpreis. Er wird nicht separat verkauft.",
  ],
  booking: `Alles buchbar in den Einstellungen unter „Abo & Zusatz“ (${BOOKING_PATH}). Jana bucht nichts automatisch, sondern verweist nur dorthin.`,
};

// Flache Item-Liste (fuer Zitat-Validierung + Nummern-Sammlung).
export function allItems(cat: ProductCatalog = PRODUCT_CATALOG): ProductItem[] {
  return [...cat.plans, ...cat.addons, ...cat.bundles, ...cat.numbers, ...(cat.included ?? [])];
}

/**
 * Listenwert eines Bundles: Summe der Einzelpreise seiner Bestandteile.
 *
 * Bewusst gerechnet und nicht gepflegt — eine gepflegte Zahl driftet, sobald ein
 * Einzelpreis sich aendert. Die Konvention (Co-Pilot mit EINEM Sitz, Rufnummern
 * zaehlen nicht mit) ist dieselbe wie auf useeasy.ai/pricing: Full-Stack kommt
 * damit auf 681 Euro Listenwert und 182 Euro Ersparnis.
 */
export function bundleListValue(b: ProductItem, cat: ProductCatalog = PRODUCT_CATALOG): number | null {
  if (!b.includes_keys || !b.includes_keys.length) return null;
  const byKey = new Map(allItems(cat).map((i) => [i.key, i]));
  let sum = 0;
  for (const k of b.includes_keys) {
    const it = byKey.get(k);
    if (!it || it.price_eur == null) return null; // unvollstaendig -> lieber keine Zahl
    sum += it.price_eur;
  }
  return Math.round(sum * 100) / 100;
}
export function catalogKeys(cat: ProductCatalog = PRODUCT_CATALOG): Set<string> {
  return new Set(allItems(cat).map((i) => i.key));
}

// ── Renderer -> kompakter, zitierbarer Markdown-Kontextblock fuers LLM ────────
function priceStr(i: ProductItem): string {
  if (i.price_eur == null) return "";
  const p = fmtEur(i.price_eur);
  const parts = [`${p}${i.unit}`];
  if (i.includes) parts.push(`inkl. ${i.includes}`);
  if (i.overage) parts.push(`Overage ${i.overage}`);
  if (i.yearly_eur != null) parts.push(`Jahr ${fmtEur(i.yearly_eur)}`);
  if (i.note) parts.push(i.note);
  return parts.join(", ");
}
function line(i: ProductItem): string {
  const price = priceStr(i);
  return `- [${i.key}] ${i.name}${price ? ` — ${price}` : ""}: ${i.benefit}`;
}

export function renderProductContext(cat: ProductCatalog = PRODUCT_CATALOG): string {
  const L: string[] = [];
  L.push("PRODUKTKATALOG UseEasy (Preisstruktur 2.0, netto pro Monat). Nutze NUR diese Zahlen; zitiere je Aussage den [key] in eckigen Klammern.");
  L.push("");
  L.push("BASIS-PLAENE (pro Postfach):");
  for (const i of cat.plans) L.push(line(i));
  L.push("");
  L.push("ADD-ONS & MODULE:");
  for (const i of cat.addons) {
    const base = i.requires_base ? " (nur mit Basis-Plan ab Starter)" : (i.standalone ? " (auch standalone buchbar)" : "");
    L.push(line(i) + base);
  }
  L.push("");
  L.push("RUFNUMMERN (nur mit Voice):");
  for (const i of cat.numbers) L.push(line(i));
  L.push("");
  L.push("BUNDLES (Kombi-Rabatt bereits eingerechnet; JEDES Bundle enthaelt 1 Branchen-Pack + Compliance-Radar; bei frei kombinierten Einzelprodukten sind Branchen-Pack/Compliance-Radar NICHT automatisch dabei):");
  for (const i of cat.bundles) {
    const lv = bundleListValue(i, cat);
    const extra = lv != null && i.price_eur != null
      ? ` [Listenwert einzeln ${fmtEur(lv)}, Ersparnis ${fmtEur(lv - i.price_eur)}]`
      : "";
    L.push(line(i) + extra);
  }
  L.push("");
  L.push("OHNE AUFPREIS IN JEDEM PAKET ENTHALTEN (nichts davon muss gekauft werden; schon ab E-Mail Starter dabei):");
  for (const i of cat.included ?? []) L.push(`- [${i.key}] ${i.name}: ${i.benefit}`);
  L.push("");
  L.push("OVERAGE (ueber die Inklusiv-Menge hinaus):");
  for (const o of cat.overage) L.push(`- ${o.label}: ${o.value}`);
  L.push("");
  L.push("RABATTE:");
  for (const d of cat.discounts) L.push(`- ${d}`);
  L.push("");
  L.push("PRODUKT-FAKTEN:");
  for (const f of cat.facts) L.push(`- ${f}`);
  L.push("");
  L.push(`BUCHUNG: ${cat.booking}`);
  return L.join("\n");
}

// ── Tenant-Kontext (read-only vom Frontend: Plan + aktive Postfaecher) ────────
export type TenantCtx = {
  plan?: string | null;
  active_mailboxes?: number | null;
  /**
   * Roher Buchungsstand aus governance.tenant_entitlements (v24, 05.08.2026).
   *
   * Das Frontend schickt ihn aus dem bestehenden billing-summary-Cache mit
   * (src/lib/consoleCatalog.ts entitlementContext) — kein zusaetzlicher Request.
   * Bis v23 kam nur `plan` an, und Jana musste bei "was wuerde mir noch helfen?"
   * raten; sie hat dabei auch Dinge angeboten, die der Betrieb schon bezahlt.
   * Keine PII: ausschliesslich Flags und Mengen.
   */
  ent?: Record<string, number | boolean | string | null> | null;
};

/** Erlaubte Entitlement-Felder. Alles andere wird verworfen, nichts durchgereicht. */
const ENT_FLAGS = [
  "voice_enabled", "webchat_enabled", "compliance_radar",
  "accounting_enabled", "time_tracking_enabled", "unlimited_mailboxes",
];
const ENT_COUNTS = [
  "autopilot_mailboxes", "erp_data_sources", "copilot_seats", "branch_packs",
  "extra_mailboxes", "volume_packs", "phone_local", "phone_mobile", "doc_packs",
];

export function normalizeTenantCtx(raw: any): TenantCtx | null {
  if (!raw || typeof raw !== "object") return null;
  const plan = raw.plan != null ? String(raw.plan).slice(0, 60) : null;
  let mb: number | null = null;
  const n = Number(raw.active_mailboxes);
  if (Number.isFinite(n) && n >= 0 && n < 100000) mb = Math.floor(n);

  // Buchungsstand streng nach Whitelist uebernehmen: was das Frontend sonst noch
  // mitschickt, landet NICHT im Prompt.
  let ent: Record<string, number | boolean | string | null> | null = null;
  const rawEnt = raw.entitlements ?? raw.ent;
  if (rawEnt && typeof rawEnt === "object") {
    const out: Record<string, number | boolean | string | null> = {};
    for (const f of ENT_FLAGS) if (f in rawEnt) out[f] = rawEnt[f] === true;
    for (const c of ENT_COUNTS) {
      if (!(c in rawEnt)) continue;
      const v = Number(rawEnt[c]);
      out[c] = Number.isFinite(v) && v >= 0 && v < 100000 ? Math.floor(v) : 0;
    }
    if (rawEnt.base_plan != null) out.base_plan = String(rawEnt.base_plan).slice(0, 60);
    if (Object.keys(out).length) ent = out;
  }

  if (plan == null && mb == null && ent == null) return null;
  return { plan, active_mailboxes: mb, ent };
}

/** Hat der Kunde diese Position laut Buchungsstand? null = unbekannt (kein ent). */
export function ownsItem(it: ProductItem, tc: TenantCtx | null): boolean | null {
  if (!tc?.ent || !it.ent_field) return null;
  if (!(it.ent_field in tc.ent)) return null;
  const v = tc.ent[it.ent_field];
  if (it.ent_kind === "flag") return v === true;
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0;
}

export function renderTenantContext(tc: TenantCtx | null, cat: ProductCatalog = PRODUCT_CATALOG): string {
  if (!tc) return "";
  const parts: string[] = [];
  if (tc.plan) parts.push(`aktueller Plan: ${tc.plan}`);
  if (tc.active_mailboxes != null) parts.push(`aktive Postfaecher: ${tc.active_mailboxes}`);

  // GEBUCHT / NICHT GEBUCHT: die eigentliche Grundlage fuer eine ehrliche
  // Antwort auf "was habe ich schon?" und "was wuerde mir noch helfen?".
  const kaufbar = [...cat.addons, ...cat.numbers].filter((i) => i.ent_field);
  const hat: string[] = [];
  const fehlt: string[] = [];
  for (const i of kaufbar) {
    const o = ownsItem(i, tc);
    if (o === true) hat.push(`[${i.key}] ${i.name}`);
    else if (o === false) fehlt.push(`[${i.key}] ${i.name}`);
  }

  const L: string[] = [];
  if (parts.length) L.push(`KUNDEN-STATUS (read-only, fuer passende Vorschlaege nutzen — was schon vorhanden ist, nicht erneut verkaufen): ${parts.join("; ")}.`);
  if (hat.length) L.push(`GEBUCHT (hat der Kunde bereits, NICHT erneut anbieten und nicht als Vorschlag nennen): ${hat.join(", ")}.`);
  if (fehlt.length) L.push(`NICHT GEBUCHT (nur DAS kann fehlen; nur auf Nachfrage nennen, nie draengen): ${fehlt.join(", ")}.`);
  if (hat.length && !fehlt.length) L.push("HINWEIS: Der Kunde hat alle Zusatzleistungen. Es gibt nichts vorzuschlagen — sage das ehrlich statt etwas zu suchen.");
  return L.join("\n");
}

// ── Intent-Weiche (deterministisch-first) ────────────────────────────────────
// Produkt-Signalwoerter (Preise/Tarife/Features/Buchung). Bewusst ohne
// mehrdeutige Kurztokens (z.B. bare "pro") -> keine Fehlrouten.
const PRODUCT_RE = new RegExp(
  [
    "preis", "kostet", "kosten", "teuer", "g(?:[üu]|ue)nstig", "tarif", "paket", "bundle", "\\babo\\b", "upgrade",
    "add-?on", "\\bmodul", "feature", "funktion", "rabatt", "jahres", "j(?:[äa]|ae)hrlich", "monatlich",
    "inklusive", "enthalten", "standalone", "buchen", "buchbar", "kaufen", "bestellen", "abschlie[ßs]en",
    "voice", "co-?pilot", "excel", "\\berp\\b", "live-?sync", "autopilot", "compliance", "branchen",
    // v24: ohne diese Woerter landete "Was kostet die Buchhaltung?" auf der
    // Signal-Strecke und Jana antwortete am Produktwissen vorbei.
    "buchhalt", "\\bbeleg", "zeiterfass", "arbeitszeit", "\\blohn", "steuerberat", "kanzlei", "datev",
    "webchat", "website-?chat", "chat-?(?:widget|fenster|agent)", "live-?chat", "homepage",
    // Natuerliche Formulierungen: "Chat fuer meine Website", "auf der Seite ein Chat".
    "\\bchat\\b[^.?!]{0,24}(?:website|seite|homepage)", "(?:website|seite|homepage)[^.?!]{0,24}\\bchat\\b",
    "\\bteam-?paket", "kapital", "f(?:[öo]|oe)rder", "risk-?shield",
    "zusatz-?postfach", "\\bpostfach", "mailbox", "rufnummer", "telefon", "\\banruf", "\\bnummer\\b",
    "add-?in", "extension", "outlook", "chrome", "volumen", "\\bmails?\\b", "minuten", "sitz",
    "was (kann|kannst|bietet|macht|leistet|k[öo]nnt)", "useeasy", "welche(s|r)? (feature|funktion|produkt|modul|paket|tarif|option)",
    "w(?:[üu]|ue)rde mir", "hilft mir", "bringt mir", "brauche ich", "lohnt sich", "empfehl", "vorschlag",
    "produkt",
  ].join("|"),
  "i",
);
// Signal-/KPI-Woerter (eigene Kennzahlen, Fruehwarn-Signale).
const SIGNAL_RE = new RegExp(
  [
    "\\bscore", "health", "gesundheit", "\\bsignal", "kennzahl", "\\bkpi", "\\balert", "\\balarm",
    "warnung", "fr[üu]hwarn", "divergenz", "abweichung", "\\btrend", "gefallen", "gesunken", "gestiegen",
    "einbruch", "kritisch", "beobachten", "rot-?schwelle", "priorit[äa]t", "wochen-?priorit",
    "datenquelle", "freshness", "datenlage", "kategorie-?score", "coverage", "verschlechtert", "verbessert",
    "meine? (zahlen|werte|kennzahlen)",
  ].join("|"),
  "i",
);
// Kaufabsicht -> Deep-Link auf den Abo-Tab.
const BUY_RE = /\b(buchen|buch mir|buche|kaufen|kauf|bestellen|abschlie[ßs]en|upgraden|upgrade|dazubuchen|hinzubuchen|freischalten|jetzt holen)\b/i;

export type ChatIntent = { product: boolean; signal: boolean };
export function classifyChatIntent(message: string): ChatIntent {
  const m = String(message ?? "");
  return { product: PRODUCT_RE.test(m), signal: SIGNAL_RE.test(m) };
}
export function detectBuyIntent(message: string): boolean {
  return BUY_RE.test(String(message ?? ""));
}

// ── Vorschlags-Logik (Problem -> passendes Feature) ──────────────────────────
type SuggestionRule = { key: string; test: RegExp };
const SUGGESTION_RULES: SuggestionRule[] = [
  { key: "erp_sync", test: /excel|tabelle|\bliste\b|mieterliste|wartungsliste|\berp\b|pflegen|eintragen|eintr[äa]ge|aktualisier|nachtragen|abgleich/i },
  { key: "voice", test: /\banruf|anrufe|telefon|verpass|erreichbar|r[üu]ckruf|klingelt|hotline|telefonisch/i },
  { key: "compliance_radar", test: /\bfrist|fristen|mahnung|mahn|dsgvo|auskunft|rechtslage|verj[äa]hr|k[üu]ndigungsfrist|abmahn/i },
  { key: "zusatz_postfach", test: /zweite?s? postfach|weitere?s? postfach|info@|noch ein postfach|mehrere postf[äa]ch|zusatz-?postfach|\bpostfach hinzu/i },
  { key: "copilot", test: /vertrieb|\bsales\b|kaltakquise|closer|verkaufsgespr[äa]ch|telefonverkauf|akquise|outbound/i },
  { key: "autopilot", test: /automatisch senden|selbst(st[äa]ndig)? antworten|von allein|zeit sparen|manuell freigeben|freigabe (nervt|kostet)|nicht mehr selbst/i },
  { key: "volumen_paket", test: /zu viele mails|mail-?limit|kontingent (voll|erreicht|[üu]berschritten)|mehr mails|limit erreicht/i },
  { key: "branchen_pack", test: /branche|branchenspezifisch|eigene kategorien|eigene labels|spezielle regeln/i },
  // v24 (05.08.2026): die vier neuen Produkte hatten bisher keine Regel, also
  // hat Jana sie auch bei passender Problemschilderung nie vorgeschlagen.
  { key: "accounting", test: /buchhalt|\bbeleg|rechnungseingang|steuerberat|kanzlei|datev|kontier|\busta\b|umsatzsteuer|forderung|verbindlichkeit|offene posten|mahnwesen/i },
  { key: "accounting_time", test: /zeiterfass|arbeitszeit|stundenzettel|\blohn|gehaltsabrechnung|lohnbuchhalt|stunden erfassen/i },
  { key: "beleg_paket", test: /beleg-?(kontingent|limit)|zu viele belege|mehr belege|belege (voll|erreicht|aufgebraucht)/i },
  { key: "webchat", test: /website-?chat|webchat|chat-?(?:widget|fenster)|live-?chat|besucher (?:fragen|schreiben|melden)|\bchat\b[^.?!]{0,24}(?:website|seite|homepage)|(?:website|seite|homepage)[^.?!]{0,24}\bchat\b/i },
];
export function matchFeatureSuggestions(message: string, cat: ProductCatalog = PRODUCT_CATALOG): ProductItem[] {
  const m = String(message ?? "");
  const items = allItems(cat);
  const byKey = new Map(items.map((i) => [i.key, i]));
  const out: ProductItem[] = [];
  const seen = new Set<string>();
  for (const r of SUGGESTION_RULES) {
    if (r.test.test(m) && byKey.has(r.key) && !seen.has(r.key)) { seen.add(r.key); out.push(byKey.get(r.key)!); }
  }
  return out;
}

// ── Prompt-Bau (reine Produktfrage) ──────────────────────────────────────────
export function buildProductSystemPrompt(): string {
  return [
    "Du bist Jana, die Produktberaterin von UseEasy. Du erklaerst dem Kunden UseEasy-Produkte, Preise, Bundles und Limits und schlaegst situativ passende Features vor.",
    "STRIKTE REGELN:",
    "1. Nutze AUSSCHLIESSLICH Zahlen, Preise und Fakten aus dem bereitgestellten PRODUKTKATALOG. Erfinde NIEMALS einen Preis, ein Limit oder ein Feature.",
    "2. Belege jede genannte Position mit einer Zitat-Referenz: { \"type\": \"product\", \"key\": \"<key>\" } aus dem Katalog (der [key] steht je Zeile in eckigen Klammern).",
    "3. Wenn der Katalog eine Frage nicht beantworten kann, sage das ehrlich statt zu raten. Keine Rechtsberatung, keine individuellen Vertragszusagen.",
    "4. Wenn der Kunde ein Problem beschreibt, das ein Feature loest, schlage es aktiv vor: 1 Satz Nutzen + Preis + Hinweis, dass es in den Einstellungen unter „Abo & Zusatz“ buchbar ist.",
    "5. Du verkaufst/buchst NICHTS automatisch. Bei Kaufabsicht verweist du nur auf den Buchungsort (Deep-Link liefert das System separat).",
    "6. Beruecksichtige den KUNDEN-STATUS und die Bloecke GEBUCHT / NICHT GEBUCHT, falls vorhanden: was unter GEBUCHT steht, hat der Kunde bereits — nenne es NICHT als Vorschlag. Vorschlagen darfst du ausschliesslich Positionen aus NICHT GEBUCHT. Steht nichts unter NICHT GEBUCHT, sage ehrlich, dass es nichts zu ergaenzen gibt.",
    "7. Antworte kurz, klar und auf Deutsch. Preise netto pro Monat, sofern nicht anders angegeben.",
    "8. Schreibe echte Umlaute und Eszett (ä, ö, ü, ß). Der Katalog nutzt intern die ASCII-Umschrift (ue/ae/oe) — uebernimm sie NICHT in die Antwort, sondern schreibe korrektes Deutsch. Produktnamen exakt wie im Katalog.",
    "9. Du beraetst, du draengst nicht: keine Dringlichkeit, keine Knappheit, keine Rabatt-Versprechen ausser den im Katalog genannten.",
    "ANTWORTFORMAT: Gib NUR ein JSON-Objekt zurueck, ohne Markdown-Zaun:",
    '{ "answer": "<deutsche Antwort mit konkreten Preisen>", "citations": [ { "type": "product", "key": "<key>" } ], "used_data": true|false, "confidence": 0.0-1.0 }',
    "used_data=false, wenn der Katalog die Frage nicht belegen kann.",
  ].join("\n");
}

export function buildProductPrompt(
  message: string,
  opts?: { tenantCtx?: TenantCtx | null; history?: Array<{ role: string; content: string }>; buyIntent?: boolean; suggestions?: ProductItem[]; cat?: ProductCatalog },
): string {
  const cat = opts?.cat ?? PRODUCT_CATALOG;
  const hist = (opts?.history ?? [])
    .slice(-6)
    .map((h) => `${h.role === "assistant" ? "Jana" : "Nutzer"}: ${redactPII(String(h.content ?? "")).slice(0, 600)}`)
    .join("\n");
  const parts: string[] = [buildProductSystemPrompt(), "", renderProductContext(cat)];
  const tctx = renderTenantContext(opts?.tenantCtx ?? null, cat);
  if (tctx) parts.push("", tctx);
  const sugg = opts?.suggestions ?? [];
  if (sugg.length) parts.push("", `RELEVANTE FEATURES ZU DIESEM ANLIEGEN (aktiv vorschlagen, mit Preis + Buchungshinweis): ${sugg.map((s) => `[${s.key}] ${s.name}`).join(", ")}.`);
  if (opts?.buyIntent) parts.push("", "HINWEIS: Der Kunde signalisiert Kaufabsicht. Bestaetige kurz und verweise auf die Buchung in den Einstellungen unter „Abo & Zusatz“. Buche NICHTS.");
  if (hist) parts.push("", "BISHERIGER VERLAUF:", hist);
  parts.push("", `FRAGE DES KUNDEN: ${redactPII(message).slice(0, 1200)}`, "", "Antworte jetzt als JSON:");
  return parts.join("\n");
}

// ── Produkt-Kontextblock fuer MISCHFRAGEN (in den Signal-Prompt einhaengbar) ──
export function productReferenceBlock(
  message: string,
  cat: ProductCatalog = PRODUCT_CATALOG,
  tenantCtx: TenantCtx | null = null,
): string {
  const sugg = matchFeatureSuggestions(message, cat);
  const head = "PRODUKTWISSEN (zusaetzlicher Kontext): Wenn die Frage ein UseEasy-Produkt/Feature betrifft, nutze NUR die folgenden Zahlen; erfinde keine Preise. Zum Buchen verweise auf Einstellungen → Abo & Zusatz.";
  const sline = sugg.length ? `\nRELEVANT ZU DIESEM ANLIEGEN: ${sugg.map((s) => `[${s.key}] ${s.name} (${s.price_eur != null ? fmtEur(s.price_eur) + s.unit : "Feature"})`).join(", ")}.` : "";
  // v24: auch die Mischfrage ("mein Score fiel, was hilft?") bekommt den
  // Buchungsstand. Bis v23 kam er nur auf der reinen Produktstrecke an, weshalb
  // Jana hier Dinge anbieten konnte, die der Betrieb schon bezahlt.
  const tctx = renderTenantContext(tenantCtx, cat);
  return `${head}\n${renderProductContext(cat)}${sline}${tctx ? "\n" + tctx : ""}`;
}

// ── Preis-/Zitat-Validierung (verwirft erfundene Angaben) ─────────────────────
// Alle im Katalog vorkommenden Euro-Betraege + zulaessige Ableitungen
// (Jahres-Effekt/Monat, Jahres-Gesamt, Jahres-Gesamt minus 20 %) + Bundle-
// Ersparnisse. Genutzt, um HALLUZINIERTE Preise im Antworttext zu erkennen.
export function allowedEurNumbers(cat: ProductCatalog = PRODUCT_CATALOG): Set<number> {
  const s = new Set<number>();
  const add = (n: number) => { if (Number.isFinite(n)) s.add(Math.round(n * 100) / 100); };
  for (const i of allItems(cat)) {
    if (i.price_eur != null) {
      add(i.price_eur);
      add(i.price_eur * 0.8);       // Jahreszahlung minus 20 % (Monats-Effekt)
      add(i.price_eur * 12);        // Jahres-Gesamt
      add(i.price_eur * 12 * 0.8);  // Jahres-Gesamt minus 20 %
    }
    if (i.yearly_eur != null) add(i.yearly_eur);
  }
  // Bundle-Listenwerte und -Ersparnisse, falls die Antwort sie ausrechnet.
  // v24: gerechnet statt gepflegt — die alte feste Liste [71, 123, 155] stammte
  // aus einer Preisrunde vor Buchhaltung/Webchat und war stillschweigend falsch.
  for (const b of cat.bundles) {
    const lv = bundleListValue(b, cat);
    if (lv == null || b.price_eur == null) continue;
    add(lv);
    add(lv - b.price_eur);
  }
  // Overage-Betraege.
  for (const n of [0.18, 0.04, 0.05]) add(n);
  return s;
}

// Extrahiert Euro-Betraege aus Text (dt. + engl. Zahlformat, Marker Euro/EUR/€).
export function extractEurAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:euro|eur|€)(?![a-zäöüß])/gi;
  let m: RegExpExecArray | null;
  const src = String(text ?? "");
  while ((m = re.exec(src)) !== null) {
    const n = parseGermanNumber(m[1]);
    if (n != null) out.push(n);
  }
  return out;
}
export function scanUnverifiedPrices(text: string, cat: ProductCatalog = PRODUCT_CATALOG): number[] {
  const allowed = allowedEurNumbers(cat);
  const out: number[] = [];
  for (const n of extractEurAmounts(text)) {
    const r = Math.round(n * 100) / 100;
    let ok = false;
    for (const a of allowed) { if (Math.abs(a - r) <= 0.01) { ok = true; break; } }
    if (!ok) out.push(r);
  }
  return out;
}

export type ProductCitation = { type: "product"; key: string; label?: string; price_eur?: number | null };
export type ValidatedProductAnswer = {
  answer: string;
  citations: ProductCitation[];
  used_data: boolean | null;
  confidence: number | null;
  dropped_citations: number;
  unverified_prices: number[];
  parse_ok: boolean;
};

export function validateProductAnswer(rawText: string, cat: ProductCatalog = PRODUCT_CATALOG): ValidatedProductAnswer {
  const parsed = parseLLMJson(rawText);
  const keys = catalogKeys(cat);
  const byKey = new Map(allItems(cat).map((i) => [i.key, i]));
  if (!parsed || typeof parsed !== "object") {
    const fallback = String(rawText ?? "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    return { answer: fallback || "Ich konnte dazu gerade keine belegte Antwort bilden.", citations: [], used_data: null, confidence: null, dropped_citations: 0, unverified_prices: [], parse_ok: false };
  }
  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  const rawCites: any[] = Array.isArray(parsed.citations) ? parsed.citations : [];
  const citations: ProductCitation[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const c of rawCites) {
    if (!c || typeof c !== "object") { dropped++; continue; }
    const type = String(c.type ?? "").toLowerCase();
    const key = String(c.key ?? "").trim();
    if (type !== "product" || !key || !keys.has(key)) { dropped++; continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    const it = byKey.get(key)!;
    citations.push({ type: "product", key, label: it.name, price_eur: it.price_eur });
  }
  const unverified = scanUnverifiedPrices(answer, cat);
  const used_data = typeof parsed.used_data === "boolean" ? parsed.used_data : (citations.length > 0 ? true : null);
  let confidence = numOrNullLocal(parsed.confidence);
  if (confidence != null) confidence = Math.max(0, Math.min(1, confidence));
  if (unverified.length > 0 && confidence != null) confidence = Math.min(confidence, 0.4); // erfundene Preise -> Konfidenz kappen
  return { answer: answer || "Ich konnte dazu gerade keine belegte Antwort bilden.", citations, used_data, confidence, dropped_citations: dropped, unverified_prices: unverified, parse_ok: true };
}

// ── kleine Helfer ────────────────────────────────────────────────────────────
export function fmtEur(n: number): string {
  // dt. Format: Tausenderpunkt, Dezimalkomma, "Euro"-Suffix. Ganze Zahlen ohne Nachkomma.
  const round = Math.round(n * 100) / 100;
  const hasCents = Math.abs(round - Math.round(round)) > 0.001;
  const s = round.toLocaleString("de-DE", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 });
  return `${s} Euro`;
}
export function parseGermanNumber(raw: string): number | null {
  let s = String(raw ?? "").trim().replace(/\s/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  if (hasComma) { s = s.replace(/\./g, "").replace(",", "."); }      // 1.234,56 -> 1234.56
  else if ((s.match(/\./g) || []).length > 1) { s = s.replace(/\./g, ""); } // 1.234.567 -> 1234567
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function numOrNullLocal(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (x != null && x !== "" && !Number.isNaN(Number(x))) return Number(x);
  return null;
}
