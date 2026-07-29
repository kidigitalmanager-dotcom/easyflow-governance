/**
 * Was der Kunde liest, wenn wir seine Website nicht lesen konnten.
 *
 * Warum es das gibt (Messung 29.07.2026): die Karte hatte im failed-Zweig
 * genau ZWEI Faelle. Entweder der Fehlertext war Zeichen fuer Zeichen
 * „robots.txt disallows crawling“, dann kam der Disallow-Satz, oder es kam die
 * Erklaerung fuer Seiten, die ihren Inhalt erst im Browser aufbauen. Beide
 * Aussagen waren fast immer falsch:
 *
 *   - Die echten Ursachen heissen `timeout`, `bot_wall`, `http_5xx` und
 *     `dead_dns`. Eine Seite, die ihren Inhalt erst im Browser aufbaut, gab es
 *     im Messkorpus genau EINMAL unter 369. Wir haben dem Kunden also mit
 *     hoher Wahrscheinlichkeit den falschen Grund genannt.
 *   - Seit dem zweiten Anlauf (api-router v4.167.0) versuchen WIR es selbst
 *     noch einmal. Trotzdem stand in der Karte, der Kunde solle seine Adresse
 *     pruefen. Wer in sechs Stunden ohnehin einen zweiten Versuch bekommt,
 *     soll nicht raten muessen und schon gar nicht selbst etwas tun.
 *
 * Deshalb entscheidet jetzt `website_scan.retry` und nicht mehr ein
 * Zeichenvergleich auf der Fehlermeldung. `retry` liefert das Backend in
 * `_readWebsiteScan`: Ursache, Versuchszahl, ob ein zweiter Anlauf geplant ist,
 * ab wann, und ob es der letzte war.
 *
 * 🔴 Eine einzige Stelle liest noch die Fehlermeldung: `normalizeCause` fuer
 * Zeilen, die aelter sind als v4.167.0 und deshalb gar keine Ursachen-Marke
 * tragen. Das ist bewusst KEINE zweite Wahrheit im Verzweigungsbaum: die
 * Verzweigung unten kennt nur noch die normalisierte Ursache. Sobald im
 * Bestand keine markenlosen Zeilen mehr stehen, kann `LEGACY_DISALLOW`
 * ersatzlos weg.
 */

/** Ursachen, die der Crawler als `[ursache|versuch]` in `error_message` ablegt. */
export type CrawlCause =
  | "robots_disallow_all"
  | "robots_unavailable"
  | "bot_wall"
  | "http_429"
  | "http_5xx"
  | "http_404"
  | "http_other"
  | "timeout"
  | "net_error"
  | "dead_dns"
  | "read_failed"
  | "not_html"
  | "too_many_redirects"
  | "no_content"
  | "blocked";

export interface WebsiteScanRetry {
  cause: string | null;
  attempt: number;
  /** true = wir versuchen es selbst noch einmal. Dann kein Handlungsaufruf. */
  planned: boolean;
  /** ISO-Zeitpunkt, ab dem der naechste Anlauf laufen darf. */
  not_before: string | null;
  final: boolean;
}

export interface WebsiteScanFailureInput {
  /** Adresse, die wir gelesen haben. Kann fehlen, dann bleibt der Text allgemein. */
  url?: string | null;
  /** `website_scan.retry` aus dem Backend. null = keine Ursachen-Marke vorhanden. */
  retry?: WebsiteScanRetry | null;
  /** `website_scan.last_crawl.cause`, falls kein retry-Block gebildet wurde. */
  cause?: string | null;
  /** `website_scan.last_crawl.error`, Marke bereits abgeschnitten. Nur fuer Altzeilen. */
  legacyError?: string | null;
  /** Nur fuer Tests. Ohne Angabe die aktuelle Zeit. */
  now?: Date;
}

export interface WebsiteScanFailureView {
  /** "waiting" = wir versuchen es selbst noch einmal, der Kunde soll nichts tun. */
  kind: "waiting" | "final";
  headline: string;
  /** Was passiert ist, in Kundensprache und ohne unsere Schluessel. */
  reason: string;
  /** Was als Naechstes passiert oder was der Kunde tun kann. */
  next: string;
  /** Knopf „Andere Adresse eintragen“ anbieten. Bei "waiting" immer false. */
  showAddressAction: boolean;
}

/**
 * Der Klartext, den Zeilen ohne Ursachen-Marke frueher als einzigen Hinweis
 * trugen. Wird nur gelesen, wenn keine Marke da ist.
 */
const LEGACY_DISALLOW = "robots.txt disallows crawling";

/** Ist die Marke da, gewinnt sie. Sonst die Altzeilen-Bruecke. Sonst nichts. */
export function normalizeCause(i: WebsiteScanFailureInput): CrawlCause | null {
  const tagged = (i.retry && i.retry.cause) || i.cause || null;
  if (tagged) return tagged as CrawlCause;
  if (String(i.legacyError ?? "").trim() === LEGACY_DISALLOW) return "robots_disallow_all";
  return null;
}

const SELBST_EINTRAGEN =
  "Bitte tragen Sie die Angaben stattdessen unter „Jana-Wissen“ in Ruhe selbst ein.";
const PRUEFEN_ODER_SELBST =
  "Bitte prüfen Sie die Adresse oder tragen Sie die Angaben unter „Jana-Wissen“ selbst ein.";
const SCHREIBWEISE =
  "Bitte prüfen Sie die Schreibweise oder tragen Sie eine andere Adresse ein.";
const STARTSEITE = "Bitte tragen Sie die Adresse Ihrer Startseite ein.";

interface CauseText {
  reason: (url: string | null) => string;
  next: string;
}

/**
 * Ein Eintrag je Ursache. Die Adresse steht bewusst in jedem Satz einzeln
 * eingesetzt statt ueber einen Platzhalter: ohne Adresse muss der Satz
 * grammatisch trotzdem aufgehen, und das entscheidet der Kasus.
 *
 * 🔴 Die Erklaerung „baut den Inhalt erst im Browser auf“ steht GENAU EINMAL,
 * naemlich bei `no_content`. Genau dort stimmt sie, und nur dort. Eine
 * Prüfung in der Suite haelt das fest.
 */
const CAUSE_TEXT: Record<CrawlCause, CauseText> = {
  robots_disallow_all: {
    reason: (u) => (u ? `${u} erlaubt kein automatisches Lesen.` : "Ihre Website erlaubt kein automatisches Lesen."),
    next: SELBST_EINTRAGEN,
  },
  bot_wall: {
    reason: (u) => (u ? `${u} blockt automatische Zugriffe.` : "Ihre Website blockt automatische Zugriffe."),
    next:
      "Wenn Sie einen Schutzdienst vor Ihrer Website einsetzen, lässt sich das dort freigeben. " +
      "Sonst tragen Sie die Angaben unter „Jana-Wissen“ selbst ein.",
  },
  dead_dns: {
    reason: (u) => (u ? `Die Adresse ${u} gibt es nicht mehr.` : "Diese Adresse gibt es nicht mehr."),
    next: SCHREIBWEISE,
  },
  robots_unavailable: {
    reason: (u) => (u ? `Der Server von ${u} hat nicht geantwortet.` : "Der Server Ihrer Website hat nicht geantwortet."),
    next: PRUEFEN_ODER_SELBST,
  },
  timeout: {
    reason: (u) => (u ? `Der Server von ${u} hat nicht geantwortet.` : "Der Server Ihrer Website hat nicht geantwortet."),
    next: PRUEFEN_ODER_SELBST,
  },
  http_5xx: {
    reason: (u) => (u ? `Der Server von ${u} hat nicht geantwortet.` : "Der Server Ihrer Website hat nicht geantwortet."),
    next: PRUEFEN_ODER_SELBST,
  },
  net_error: {
    reason: (u) => (u ? `Der Server von ${u} hat nicht geantwortet.` : "Der Server Ihrer Website hat nicht geantwortet."),
    next: PRUEFEN_ODER_SELBST,
  },
  read_failed: {
    reason: (u) => (u ? `Der Server von ${u} hat nicht geantwortet.` : "Der Server Ihrer Website hat nicht geantwortet."),
    next: PRUEFEN_ODER_SELBST,
  },
  http_429: {
    reason: (u) => (u ? `${u} hat uns wegen zu vieler Zugriffe ausgebremst.` : "Ihre Website hat uns wegen zu vieler Zugriffe ausgebremst."),
    next: PRUEFEN_ODER_SELBST,
  },
  http_404: {
    reason: (u) => (u ? `Unter ${u} gibt es keine Seite.` : "Unter dieser Adresse gibt es keine Seite."),
    next: SCHREIBWEISE,
  },
  http_other: {
    reason: (u) => (u ? `${u} hat auf unseren Aufruf mit einer Fehlermeldung geantwortet.` : "Ihre Website hat auf unseren Aufruf mit einer Fehlermeldung geantwortet."),
    next: PRUEFEN_ODER_SELBST,
  },
  not_html: {
    reason: (u) => (u ? `Unter ${u} liegt keine Webseite, sondern eine Datei.` : "Unter dieser Adresse liegt keine Webseite, sondern eine Datei."),
    next: STARTSEITE,
  },
  too_many_redirects: {
    reason: (u) => (u ? `${u} leitet immer weiter, ohne bei einer Seite anzukommen.` : "Diese Adresse leitet immer weiter, ohne bei einer Seite anzukommen."),
    next: STARTSEITE,
  },
  no_content: {
    reason: (u) =>
      (u ? `Unter ${u} war kaum Text zu finden.` : "Auf Ihrer Website war kaum Text zu finden.") +
      " Das passiert bei Seiten, die ihren Inhalt erst im Browser aufbauen.",
    next: PRUEFEN_ODER_SELBST,
  },
  blocked: {
    reason: (u) => (u ? `${u} durften wir nicht abrufen.` : "Diese Adresse durften wir nicht abrufen.") +
      " Wir lesen ausschließlich öffentlich erreichbare Seiten.",
    next: "Bitte tragen Sie die öffentliche Adresse Ihrer Website ein.",
  },
};

/** Ursache unbekannt: sagen, was wir wissen, und nichts behaupten. */
const UNKNOWN_TEXT: CauseText = {
  reason: (u) => (u ? `Unter ${u} war kein lesbarer Text zu finden.` : "Dort war kein lesbarer Text zu finden."),
  next: PRUEFEN_ODER_SELBST,
};

const BERLIN = "Europe/Berlin";

/** Kalendertag in deutscher Zeit, als Zahl seit 1970, fuer den Tagesvergleich. */
function berlinDayNumber(d: Date): number {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [y, m, day] = p.split("-").map((n) => parseInt(n, 10));
  return Math.floor(Date.UTC(y, m - 1, day) / 86400000);
}

/**
 * „gegen 09:40 Uhr“, „morgen gegen 03:40 Uhr“, „am 31.07. gegen 08:00 Uhr“.
 * Ohne verwertbaren Zeitpunkt oder wenn er schon vorbei ist: „in Kürze“. Der
 * Sweep laeuft im Stundentakt, deshalb „gegen“ und keine Zusage auf die Minute.
 */
export function formatNotBefore(iso: string | null | undefined, now: Date): string {
  if (!iso) return "in Kürze";
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return "in Kürze";
  if (t.getTime() <= now.getTime()) return "in Kürze";

  const time = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    hour: "2-digit",
    minute: "2-digit",
  }).format(t);
  const days = berlinDayNumber(t) - berlinDayNumber(now);
  if (days <= 0) return `gegen ${time} Uhr`;
  if (days === 1) return `morgen gegen ${time} Uhr`;
  const date = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    day: "2-digit",
    month: "2-digit",
  }).format(t);
  return `am ${date} gegen ${time} Uhr`;
}

/**
 * Der einzige Ort, an dem entschieden wird, was im failed-Zustand steht.
 *
 * Reihenfolge ist die Aussage: laeuft noch ein Anlauf von uns, gibt es keinen
 * Handlungsaufruf. Erst wenn wir aufgegeben haben, bitten wir den Kunden.
 */
export function describeWebsiteScanFailure(i: WebsiteScanFailureInput): WebsiteScanFailureView {
  const url = i.url && String(i.url).trim() ? String(i.url).trim() : null;
  const cause = normalizeCause(i);
  const text = (cause && CAUSE_TEXT[cause]) || UNKNOWN_TEXT;
  const reason = text.reason(url);

  if (i.retry && i.retry.planned) {
    const when = formatNotBefore(i.retry.not_before, i.now ?? new Date());
    return {
      kind: "waiting",
      headline: "Wir versuchen es noch einmal",
      reason,
      next: `Wir lesen Ihre Website ${when} erneut. Sie müssen nichts tun.`,
      showAddressAction: false,
    };
  }

  return {
    kind: "final",
    headline: "Wir konnten Ihre Website nicht lesen",
    reason,
    next: text.next,
    showAddressAction: true,
  };
}

/** Nur fuer die Suite: alle Ursachen, die die Tabelle kennt. */
export const ALL_CRAWL_CAUSES = Object.keys(CAUSE_TEXT) as CrawlCause[];
