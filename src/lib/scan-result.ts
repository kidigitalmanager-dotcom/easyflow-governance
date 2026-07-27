/**
 * Uebersetzung der `skipped`-Werte, die die Dokumenten- und Rechnungseingangs-
 * Routen zurueckgeben (Briefing 27.07.2026, Punkt 2).
 *
 * Zwei Regeln:
 *
 * 1. Rohe Enums gehoeren nicht in die Oberflaeche. "tenant_disabled" sagt dem
 *    Betrieb nichts, "noch nicht freigeschaltet" schon.
 * 2. `skipped` ist im Vertrag `number | string`. Eine Zahl ist ein ZAEHLER
 *    (so viele Nachrichten wurden uebersprungen) und KEIN Abbruchgrund. Wer
 *    einfach `if (res.skipped)` prueft, meldet bei "5 uebersprungen" faelsch-
 *    licherweise einen Fehler. Deshalb hier die harte Trennung.
 */

export type SkipTone = "blocked" | "info";

export interface SkipInfo {
  /** Kurzform fuer Toasts. */
  title: string;
  /** Ein Satz, was der Nutzer jetzt tun kann. Leer, wenn es nichts zu tun gibt. */
  hint: string;
  tone: SkipTone;
  /** Rohwert, nur fuer Log/Debug, nie fuer die Oberflaeche. */
  raw: string;
}

const TABLE: Record<string, { title: string; hint: string; tone: SkipTone }> = {
  tenant_disabled: {
    title: "Noch nicht freigeschaltet",
    hint: "Für deinen Betrieb ist das automatische Erkennen von Rechnungen noch nicht freigeschaltet. Forderungen kannst du weiterhin von Hand anlegen oder als Liste importieren.",
    tone: "blocked",
  },
  feature_disabled: {
    title: "Funktion nicht aktiv",
    hint: "Diese Funktion ist auf dem Server noch nicht aktiv. Wende dich an den Support, wenn du sie nutzen möchtest.",
    tone: "blocked",
  },
  tenant_opt_out: {
    title: "Für deinen Betrieb abgeschaltet",
    hint: "Diese Auswertung wurde für deinen Betrieb bewusst deaktiviert.",
    tone: "blocked",
  },
  auto_ingest_off: {
    title: "Automatisches Einlesen ist aus",
    hint: "Belege werden derzeit nicht automatisch aus dem Postfach übernommen. Du kannst sie weiterhin selbst hochladen.",
    tone: "blocked",
  },
  ap_unavailable: {
    title: "Rechnungseingang nicht erreichbar",
    hint: "Der Rechnungseingang antwortet gerade nicht. Versuche es in ein paar Minuten erneut.",
    tone: "blocked",
  },
  no_db: {
    title: "Datenbank nicht erreichbar",
    hint: "Der Server konnte die Daten nicht laden. Versuche es in ein paar Minuten erneut.",
    tone: "blocked",
  },
  bad_args: {
    title: "Anfrage unvollständig",
    hint: "Die Anfrage war unvollständig. Lade die Seite neu und versuche es noch einmal.",
    tone: "blocked",
  },
  no_candidates: {
    title: "Nichts Neues gefunden",
    hint: "Im geprüften Zeitraum gab es keine Nachricht, die nach einer Rechnung aussah.",
    tone: "info",
  },
  not_invoice: {
    title: "Kein Beleg erkannt",
    hint: "Die Nachricht enthielt keinen erkennbaren Beleg.",
    tone: "info",
  },
  no_invoice_signal: {
    title: "Kein Beleg erkannt",
    hint: "Die Nachricht enthielt keinen erkennbaren Beleg.",
    tone: "info",
  },
  no_amount: {
    title: "Kein Betrag erkennbar",
    hint: "Im Beleg war kein Betrag zu finden. Trage ihn von Hand nach.",
    tone: "info",
  },
  no_due_signal: {
    title: "Kein Zahlungsziel erkennbar",
    hint: "Im Beleg war kein Fälligkeitsdatum zu finden. Trage es von Hand nach.",
    tone: "info",
  },
  too_large: {
    title: "Anhang zu groß",
    hint: "Der Anhang war zu groß zum Auswerten. Lade ihn bei Bedarf selbst hoch.",
    tone: "info",
  },
  no_content_bytes: {
    title: "Anhang nicht lesbar",
    hint: "Der Anhang konnte nicht gelesen werden.",
    tone: "info",
  },
  no_msg: {
    title: "Nachricht nicht lesbar",
    hint: "Die Nachricht konnte nicht gelesen werden.",
    tone: "info",
  },
};

/**
 * Uebersetzt einen `skipped`-Wert.
 *
 * Gibt `null` zurueck, wenn nichts uebersprungen wurde ODER wenn der Wert eine
 * Zahl ist (= Zaehler, kein Abbruchgrund). Unbekannte Zeichenketten werden
 * neutral als Hinweis gezeigt, nie als Erfolg verschluckt.
 */
export function describeSkipped(value: unknown): SkipInfo | null {
  if (value === null || value === undefined || value === false) return null;
  if (typeof value === "number") return null; // Zaehler, kein Grund
  const raw = String(value).trim();
  if (!raw || raw === "0") return null;

  const hit = TABLE[raw];
  if (hit) return { ...hit, raw };

  return {
    title: "Übersprungen",
    hint: "Der Server hat den Vorgang übersprungen. Grund laut Server: " + raw + ".",
    tone: "info",
    raw,
  };
}

/** Anzahl der uebersprungenen Eintraege, falls der Server einen Zaehler liefert. */
export function skippedCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

/** True, wenn der Vorgang blockiert war (Freischaltung/Verfuegbarkeit). */
export function isBlocked(value: unknown): boolean {
  return describeSkipped(value)?.tone === "blocked";
}
