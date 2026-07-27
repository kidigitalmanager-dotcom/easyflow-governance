/**
 * tenant-flags.ts — v4.149.0
 *
 * Die acht Feature-Gates aus `public.tenants`. Bis zum 27.07.2026 liessen sie
 * sich NUR per SQL setzen; ohne sie bleibt bei einem neuen Kunden die halbe
 * Buchhaltung stumm („Scan uebersprungen: tenant_disabled").
 *
 * Die Reihenfolge entspricht der Server-Whitelist (`TENANT_BOOL_FLAGS` in
 * admin_tenant_setup.js). Beides muss zusammenpassen — deshalb liegt die Liste
 * hier an EINER Stelle und nicht verstreut in der Seite.
 */

export type TenantFlagKey =
  | "documents_enabled"
  | "accounting_ap_enabled"
  | "auto_offer_enabled"
  | "dunning_scan_enabled"
  | "einvoice_enabled"
  | "sales_pack_enabled"
  | "spam_rescue_enabled"
  | "spreadsheet_enabled";

export type TenantFlagRow = { key: TenantFlagKey; label: string; hint: string };

export const TENANT_FLAG_ROWS: ReadonlyArray<TenantFlagRow> = [
  { key: "documents_enabled", label: "Belege & Rechnungen", hint: "Forderungen, Rechnungen, Angebote, Postfach-Scan." },
  { key: "accounting_ap_enabled", label: "Rechnungseingang", hint: "Verbindlichkeiten, Geld rein/raus, Cash-Index." },
  { key: "auto_offer_enabled", label: "Angebots-Automatik", hint: "Bereitet aus einer Anfrage ein Angebot vor." },
  { key: "dunning_scan_enabled", label: "Mahn-Zyklus", hint: "Erkennt faellige Forderungen und schlaegt Mahnstufen vor." },
  { key: "einvoice_enabled", label: "E-Rechnung", hint: "ZUGFeRD/XRechnung aus dem Postfach lesen und erzeugen." },
  { key: "sales_pack_enabled", label: "Vertriebs-Paket", hint: "Co-Pilot-Funktionen fuer Angebote und Nachfassen." },
  { key: "spam_rescue_enabled", label: "Spam-Rettung", hint: "Holt faelschlich aussortierte Kundenmails aus dem Junk." },
  { key: "spreadsheet_enabled", label: "Excel Live-Sync", hint: "Erlaubt das automatische Aktualisieren verbundener Tabellen." },
];

/**
 * Welche Schalter darf die Seite zeigen?
 *
 * Der Server meldet in `flags_available`, welche Spalten die Datenbank wirklich
 * hat. `null`/`undefined` heisst „unbekannt" (z. B. weil es zu dem Tenant noch
 * gar keine Zeile in public.tenants gibt) — dann zeigen wir ALLE, statt Schalter
 * zu verstecken, die es sehr wohl geben koennte.
 */
export function visibleTenantFlags(available: readonly string[] | null | undefined): TenantFlagRow[] {
  if (!available) return [...TENANT_FLAG_ROWS];
  return TENANT_FLAG_ROWS.filter((r) => available.includes(r.key));
}

/**
 * Baut den `flags`-Teil des PUT-Bodies — ausschliesslich aus den Schaltern, die
 * auch wirklich dastehen. Was nicht im Body steht, laesst der Server unangetastet
 * (Partial-Merge). So kann die Seite kein Gate umkippen, das sie gar nicht zeigt.
 */
export function buildTenantFlagPayload(
  rows: readonly TenantFlagRow[],
  form: Readonly<Record<TenantFlagKey, boolean>>,
): Partial<Record<TenantFlagKey, boolean>> {
  const out: Partial<Record<TenantFlagKey, boolean>> = {};
  for (const r of rows) out[r.key] = form[r.key] === true;
  return out;
}

/**
 * Server-Antwort `skipped_flags` in einen Satz uebersetzen, den ein Mensch
 * versteht. Leer = nichts uebersprungen (dann meldet die Seite schlicht Erfolg).
 */
export function describeSkippedFlags(
  skipped: ReadonlyArray<{ flag: string; reason: string }> | undefined | null,
): string {
  if (!skipped || skipped.length === 0) return "";
  const label = (flag: string) => TENANT_FLAG_ROWS.find((r) => r.key === flag)?.label ?? flag;
  const reason = (r: string) =>
    r === "column_missing" ? "Spalte fehlt in der Datenbank"
      : r === "tenant_row_missing" ? "kein Eintrag fuer diesen Kunden"
        : r;
  return skipped.map((s) => `${label(s.flag)} (${reason(s.reason)})`).join(", ");
}
