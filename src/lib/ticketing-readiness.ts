/**
 * ticketing-readiness — Schluessel des schreibenden Ticket-Zugriffs in Anzeige.
 *
 * Warum es diese Datei gibt: `/v1/ticketing/readiness` liefert JEDEN erklaerenden
 * Satz schon auf Deutsch (`hinweise`, `hinweis` je Schritt, `grenzen`,
 * `hard_line`). Diese Saetze werden hier NICHT nachgebaut — sie werden woertlich
 * durchgereicht. Was der Endpunkt bewusst NICHT liefert, sind Beschriftungen fuer
 * seine eigenen Schluessel: `createTicket`, `wartet_auf_kunde`, `scope_missing`.
 * Genau dafuer ist diese Datei da, und fuer nichts sonst.
 *
 * Die Regel dahinter: ein Satz, der eine Aussage ueber das Kundensystem trifft,
 * kommt vom Server. Ein Wort, das nur einen Schluessel lesbar macht, steht hier.
 * Wer das vermischt, hat irgendwann zwei Wahrheiten, und die zweite ist die
 * veraltete.
 *
 * Unbekannte Schluessel fallen ueberall auf den Rohwert zurueck. Ein Schritt, den
 * ein spaeterer Treiber mitbringt, erscheint dann als `verifyCustomer` statt zu
 * verschwinden — haesslich, aber ehrlich. Lautlos wegzulassen waere die schlechte
 * Variante: der Kunde saehe eine vollstaendig wirkende Liste, die es nicht ist.
 */

// ── Die sechs Schritte, in der Reihenfolge eines echten Vorgangs ────────────
export const OP_ORDER = [
  "createTicket",
  "addPublicReply",
  "addInternalNote",
  "setStatus",
  "setPriority",
  "assignToHuman",
] as const;

const OP_LABEL: Record<string, string> = {
  createTicket: "Ticket anlegen",
  addPublicReply: "Öffentlich antworten",
  addInternalNote: "Interne Notiz schreiben",
  setStatus: "Status ändern",
  setPriority: "Priorität setzen",
  assignToHuman: "An einen Menschen übergeben",
};

export function opLabel(key: string): string {
  return OP_LABEL[key] ?? key;
}

/** Schritte in fester Reihenfolge, unbekannte hinten dran statt unterschlagen. */
export function sortOps(keys: string[]): string[] {
  const bekannt = OP_ORDER.filter((k) => keys.includes(k)) as string[];
  const rest = keys.filter((k) => !(OP_ORDER as readonly string[]).includes(k)).sort();
  return [...bekannt, ...rest];
}

// ── Anbieter ───────────────────────────────────────────────────────────────
const PROVIDER_LABEL: Record<string, string> = {
  hubspot: "HubSpot",
  freshdesk: "Freshdesk",
};

export function providerLabel(key: string | null | undefined): string {
  if (!key) return "Das Ticketsystem";
  return PROVIDER_LABEL[String(key).toLowerCase()] ?? key;
}

// ── Die vier Status, auf die der Assistent abbildet ─────────────────────────
export const STATUS_ORDER = ["neu", "in_arbeit", "wartet_auf_kunde", "geschlossen"] as const;

const STATUS_LABEL: Record<string, string> = {
  neu: "Neu",
  in_arbeit: "In Arbeit",
  wartet_auf_kunde: "Wartet auf Kunde",
  geschlossen: "Geschlossen",
};

export function statusLabel(key: string): string {
  return STATUS_LABEL[key] ?? key;
}

// ── Zustand eines Schrittes ────────────────────────────────────────────────
// 'yes'          — geht (behauptet oder gemessen)
// 'conditional'  — haengt daran, was der hinterlegte Zugang darf
// 'scope_missing'— gemessen, Berechtigung fehlt
// 'unknown'      — gemessen, das Ticketsystem hat nicht geantwortet
export type TicketingOpState = "yes" | "conditional" | "scope_missing" | "unknown";
export type Tone = "emerald" | "amber" | "muted";

const STATE_LABEL: Record<string, string> = {
  yes: "geht",
  conditional: "hängt am Zugang",
  scope_missing: "Berechtigung fehlt",
  unknown: "unklar",
};

export function stateLabel(state: string): string {
  return STATE_LABEL[state] ?? state;
}

export function stateTone(state: string): Tone {
  if (state === "yes") return "emerald";
  if (state === "scope_missing") return "amber";
  // 'conditional' und 'unknown' sind beide "wir wissen es nicht sicher". Das ist
  // kein Warnzustand — es ist schlicht keine Zusage.
  return "muted";
}

/**
 * Woher der Zustand kommt. Der Endpunkt trennt das ausdruecklich ("Gemessen
 * schlaegt behauptet"), also darf die Karte es nicht einebnen: "geht" aus einer
 * Tabelle im Treiber ist etwas anderes als "geht", weil eben nachgefragt wurde.
 */
export function herkunftLabel(gemessen: boolean): string {
  return gemessen ? "gemessen" : "laut Anbieter";
}

/** Ob eine Stufe einen Vorgang beendet. `null` heisst: das System sagt es nicht. */
export function schliesstLabel(v: boolean | null | undefined): string {
  if (v === true) return "schließt ab";
  if (v === false) return "offen";
  return "sagt das System nicht";
}

// ── Naechster Schritt: welcher Knopf, nicht welcher Satz ────────────────────
// Der Satz steht in `hinweise` und kommt vom Server. Hier wird nur entschieden,
// was die Karte anbieten kann. Alles, was weder Konsole noch Kunde hier
// erledigen kann (Pipeline im Fremdsystem anlegen, Zuordnung festlegen,
// Migration einspielen), bekommt bewusst KEINEN Knopf: ein Knopf, der nichts
// tut, ist schlimmer als keiner.
export type NextAction = "tarif" | "verbinden" | "einschalten" | "neu_verbinden" | "keine";

export function nextAction(key: string | null | undefined): NextAction {
  switch (key) {
    case "tarif_pruefen":
      return "tarif";
    case "verbinden":
      return "verbinden";
    case "einschalten":
      return "einschalten";
    case "neu_verbinden":
      return "neu_verbinden";
    default:
      return "keine";
  }
}

// ── Freshdesk-Adresse ──────────────────────────────────────────────────────
/**
 * Bringt eine eingetippte oder eingefuegte Adresse in die Form, die der Server
 * erwartet. Der Server prueft ohnehin selbst und lehnt Unsinn ab
 * (`invalid_domain`) — das hier erspart nur die Runde und den Fall, dass jemand
 * die volle Ticket-URL aus der Adresszeile kopiert.
 *
 * Bewusst KEINE zweite Wahrheit: die Regel endet mit derselben Pruefung wie
 * `_fdApiBase` im Treiber (Kleinbuchstaben, Ziffern, Bindestrich, nicht am
 * Anfang, hoechstens 63 Zeichen). Was hier durchgeht, geht dort auch durch.
 */
export function normalizeFreshdeskDomain(raw: string): { ok: boolean; sub: string } {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "") // alles ab dem ersten Schrägstrich weg (kopierte Ticket-URL)
    .replace(/\.freshdesk\.com$/, "");
  return { ok: /^[a-z0-9][a-z0-9-]{0,62}$/.test(s), sub: s };
}

// ── Zusammenfassung fuer die Kopfzeile ─────────────────────────────────────
export interface OperationView {
  state?: string;
  gemessen?: boolean;
  hinweis?: string | null;
  fehlende_berechtigung?: string | null;
}

export interface ReadinessLike {
  ok?: boolean;
  connected?: boolean;
  entitled?: boolean;
  operations?: Record<string, OperationView>;
  naechster_schritt?: string | null;
}

export interface ReadinessSummary {
  tone: Tone;
  /** Wie viele der Schritte eine Zusage haben ('yes'). */
  moeglich: number;
  /** Wie viele Schritte der Treiber ueberhaupt kennt. */
  gesamt: number;
  /** Wie viele an einer fehlenden Berechtigung haengen. */
  fehlend: number;
  aktion: NextAction;
}

/**
 * Rein aus Zahlen abgeleitet, ohne eine Behauptung ueber das Kundensystem. Die
 * Karte schreibt daraus "4 von 6 Schritten möglich" — das ist gezaehlt, nicht
 * erfunden. Alles Wertende steht in `hinweise` und kommt vom Server.
 */
export function summarize(r: ReadinessLike | null | undefined): ReadinessSummary {
  const ops = (r && r.operations) || {};
  const werte = Object.values(ops);
  const moeglich = werte.filter((o) => o && o.state === "yes").length;
  const fehlend = werte.filter((o) => o && o.state === "scope_missing").length;
  const aktion = nextAction(r?.naechster_schritt);

  let tone: Tone = "muted";
  if (!r?.entitled || !r?.connected) tone = "muted";
  else if (fehlend > 0) tone = "amber";
  else if (r?.ok) tone = "emerald";
  else tone = "amber";

  return { tone, moeglich, gesamt: werte.length, fehlend, aktion };
}
