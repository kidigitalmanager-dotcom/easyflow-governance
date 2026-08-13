// -----------------------------------------------------------------------------
// lead-wahl.ts — welcher Lead gerade dran ist.
//
// Leon, 13.08.: "man muss manuell die nummer eintragen, waehrend man im co
// pilot einfach auf das lead klick konnte um den anruf zu starten" und "Lead
// listen sind nicht aufklappbar mit website, notizen, die waehrend des anrufs
// sichtbar bleiben".
//
// Die drei Entscheidungen, die hier stehen und nirgends sonst:
//
//   1. WELCHE Nummer gewaehlt wird, wenn ein Lead zwei hat.
//   2. Ob eine Website-Adresse angeklickt werden darf.
//   3. Was die Suche findet.
//
// Alle drei sind ohne Browser durchspielbar, und bei allen dreien waere ein
// stiller Fehler teuer: eine falsche Nummer ruft einen Fremden an, eine
// ungeprueft uebernommene Adresse ist ein offenes Scheunentor.
// -----------------------------------------------------------------------------
import { nummerNormalisieren } from "./anruf-zustand";

/** Genau das, was `schlankerLead` in leads-sync herausgibt. Nicht mehr. */
export type Lead = {
  id: string;
  name?: string;
  entscheider?: string;
  branche?: string;
  stadt?: string;
  telefon?: string;
  telefon_zentrale?: string;
  email?: string;
  website?: string;
  /** Kommt nur mit, wenn die hochgeladene Tabelle eine Spalte dafuer hatte. */
  notizen?: string;
  hubspot_contact_id?: string;
  list_id?: string;
  list_name?: string;
  lfd_nr?: number | null;
};

// ── Die Nummer ───────────────────────────────────────────────────────────────

export type Nummernwahl = {
  /** In E.164, direkt waehlbar. null = es gibt keine brauchbare Nummer. */
  e164: string | null;
  /** Woher sie kam. Wird angezeigt, damit niemand raten muss. */
  herkunft: "durchwahl" | "zentrale" | null;
  /** Die zweite Nummer, falls es eine gibt. Zum Umschalten. */
  zweite: { e164: string; herkunft: "durchwahl" | "zentrale" } | null;
};

/**
 * Welche Nummer gewaehlt wird.
 *
 * 🔴 Die Durchwahl geht vor der Zentrale. Nicht aus Bequemlichkeit: die
 * Zentrale landet beim Gatekeeper, und wer den Entscheider schon hat, will
 * nicht wieder vorne anfangen. Ist die Durchwahl unbrauchbar, wird die
 * Zentrale genommen und das auch GESAGT — stillschweigend umschwenken heisst,
 * dass jemand ein Gespraech mit der falschen Erwartung beginnt.
 */
export function nummerFuer(lead: Lead | null): Nummernwahl {
  const dw = nummerNormalisieren(lead?.telefon);
  const zen = nummerNormalisieren(lead?.telefon_zentrale);
  if (dw && zen && dw !== zen) {
    return { e164: dw, herkunft: "durchwahl", zweite: { e164: zen, herkunft: "zentrale" } };
  }
  if (dw) return { e164: dw, herkunft: "durchwahl", zweite: null };
  if (zen) return { e164: zen, herkunft: "zentrale", zweite: null };
  return { e164: null, herkunft: null, zweite: null };
}

/** Kann dieser Lead ueberhaupt angerufen werden? */
export const anrufbar = (lead: Lead | null): boolean => nummerFuer(lead).e164 !== null;

// ── Die Website ──────────────────────────────────────────────────────────────

/**
 * Eine Adresse aus fremden Daten in etwas Anklickbares verwandeln — oder in
 * null.
 *
 * 🔴 Die Lead-Daten kommen aus einer hochgeladenen Tabelle. Was da drinsteht,
 * hat niemand geprueft. `javascript:` und `data:` sind ausdruecklich
 * ausgeschlossen: ein Klick auf eine solche "Website" fuehrt Code in der
 * angemeldeten Konsole aus. Erlaubt sind http und https, sonst nichts.
 */
export function websiteLink(roh: string | null | undefined): string | null {
  const s = String(roh ?? "").trim();
  if (!s) return null;
  const mitSchema = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  let u: URL;
  try { u = new URL(mitSchema); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || !u.hostname.includes(".")) return null;
  return u.toString();
}

/** Wie die Adresse dasteht: ohne Schema und ohne Schlussstrich. */
export function websiteText(roh: string | null | undefined): string {
  const l = websiteLink(roh);
  if (!l) return "";
  return l.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

// ── Die Suche ────────────────────────────────────────────────────────────────

/**
 * Filtern wie im Co-Pilot: Name, Entscheider, Stadt, Branche, Notizen,
 * Telefon, Website. Leere Suche heisst alles.
 */
export function suchen(leads: Lead[], frage: string): Lead[] {
  const q = String(frage ?? "").trim().toLowerCase();
  if (!q) return leads;
  return leads.filter((l) => {
    const heu = [l.name, l.entscheider, l.stadt, l.branche, l.notizen, l.email, l.list_name]
      .map((v) => String(v ?? "").toLowerCase()).join(" ");
    // Telefonnummern ohne Kleinschreibung, aber mit den Trennzeichen des
    // Nutzers: wer "089 12" tippt, sucht nicht nach "08912".
    const tel = `${l.telefon ?? ""} ${l.telefon_zentrale ?? ""} ${l.website ?? ""}`.toLowerCase();
    return heu.includes(q) || tel.includes(q);
  });
}

/** Die Zeile in einem Satz: was auf dem Knopf steht. */
export function leadZeile(l: Lead): string {
  const teile = [l.name, l.stadt].map((v) => String(v ?? "").trim()).filter(Boolean);
  return teile.join(" · ") || l.id;
}

/** Untertitel: wer, welche Branche, aus welcher Liste. */
export function leadUnterzeile(l: Lead): string {
  return [l.entscheider, l.branche, l.list_name]
    .map((v) => String(v ?? "").trim()).filter(Boolean).join(" · ");
}
