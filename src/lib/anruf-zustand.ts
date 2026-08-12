// -----------------------------------------------------------------------------
// anruf-zustand.ts — der Lebenslauf eines Gespraechs als reiner Zustand.
//
// Baustein 3 fuehrt die erste Audio-Abhaengigkeit des Konsolen-Repos ein
// (`@twilio/voice-sdk`). Bevor davon eine Zeile geschrieben wird, steht hier
// die Frage, die nichts mit Twilio zu tun hat: **was darf man wann?**
//
// Der Grund, das zu trennen: ein Fehler in dieser Schicht ist im Betrieb teuer
// und im Nachhinein kaum zu finden. Ein "Auflegen", das in einem bestimmten
// Zustand nicht greift, sieht aus wie ein Netzproblem. Ein zweiter Anruf, der
// waehrend eines laufenden startet, kappt den ersten und niemand weiss warum.
// Solche Regeln gehoeren an eine Stelle, an der man sie ohne Mikrofon,
// ohne Netz und ohne Twilio-Konto durchspielen kann.
//
// 🔴 Diese Datei kennt weder Twilio noch React noch die Uhr. `jetzt` kommt
// immer von aussen.
// -----------------------------------------------------------------------------

export type AnrufPhase =
  /** Kein Geraet bereit. Es kann noch nicht gewaehlt werden. */
  | "aus"
  /** Token wird geholt, Geraet meldet sich an. */
  | "startet"
  /** Bereit. Jetzt darf gewaehlt werden. */
  | "bereit"
  /** Es wird verbunden, der andere klingelt noch nicht zwingend. */
  | "waehlt"
  /** Verbunden. Ab hier laeuft der Ton. */
  | "verbunden"
  /** Auflegen ist angestossen, der Abbau laeuft. */
  | "legt_auf"
  /** Etwas ist schiefgegangen und es steht ein Text dafuer bereit. */
  | "fehler";

export type AnrufZustand = {
  phase: AnrufPhase;
  /** Die gewaehlte Nummer in E.164, solange ein Gespraech laeuft. */
  nummer: string | null;
  /** Beginn des VERBUNDENEN Gespraechs. Nicht des Waehlens. */
  verbundenSeit: number | null;
  /** Klartext. 🔴 Wird angezeigt, nie verschluckt — "laedt nicht" ohne Grund war E5. */
  fehler: string | null;
  /** Warum das letzte Gespraech endete. Fuer die Notiz nach dem Anruf. */
  ende: "aufgelegt" | "gegenseite" | "fehler" | null;
};

export const AUS: AnrufZustand = {
  phase: "aus", nummer: null, verbundenSeit: null, fehler: null, ende: null,
};

// ── Nummern ──────────────────────────────────────────────────────────────────

/**
 * Deutsche Eingaben in E.164 bringen.
 *
 * Bewusst eng: Twilio nimmt nur E.164 an, und eine Nummer, die "irgendwie
 * durchgeht", waehlt am Ende jemand Fremdes an. Was hier nicht sicher zu
 * deuten ist, wird abgelehnt statt geraten.
 */
export function nummerNormalisieren(roh: string | null | undefined): string | null {
  // 🔴 ZUERST die eingeklammerte Verkehrsausscheidungsziffer: "+49 (0)40 …"
  // heisst ausdruecklich "die 0 faellt weg, wenn du von aussen waehlst".
  // Wer die Klammern nur mit wegwirft, waehlt +49040… — eine Nummer, die
  // Twilio klaglos annimmt und die niemanden erreicht.
  const ohneKlammerNull = String(roh ?? "").replace(/^\s*(\+\s*\d{1,3})\s*\(\s*0\s*\)/, "$1");
  const s = ohneKlammerNull.replace(/[\s/.()-]/g, "");
  if (!s) return null;
  if (/^\+[1-9]\d{6,17}$/.test(s)) return s;
  // 0049… und 0049(0)… → +49…
  const m00 = s.match(/^00([1-9]\d{6,17})$/);
  if (m00) return `+${m00[1]}`;
  // Nationale Schreibweise 0…, aber NICHT 00…
  const m0 = s.match(/^0([1-9]\d{5,14})$/);
  if (m0) return `+49${m0[1]}`;
  return null;
}

/** Fuer die Anzeige: +4940897401 00 -> +49 40 8974 0100 waere geraten. Deshalb nur gruppiert. */
export function nummerLesbar(e164: string | null): string {
  if (!e164) return "–";
  return e164.replace(/^(\+\d{2})(\d{2,4})(\d+)$/, "$1 $2 $3");
}

// ── Uebergaenge ──────────────────────────────────────────────────────────────

export function geraetStartet(z: AnrufZustand): AnrufZustand {
  return { ...z, phase: "startet", fehler: null };
}

export function geraetBereit(z: AnrufZustand): AnrufZustand {
  // 🔴 Ein spaet eintreffendes "bereit" darf ein laufendes Gespraech nicht
  // zurueckwerfen. Das Geraet meldet sich auch nach einem Neuanmelden mitten
  // im Gespraech.
  if (z.phase === "waehlt" || z.phase === "verbunden" || z.phase === "legt_auf") return z;
  return { ...z, phase: "bereit", fehler: null };
}

/**
 * Wird gewaehlt.
 *
 * Gibt `null` zurueck, wenn es nicht geht — der Aufrufer darf dann gar nicht
 * erst mit Twilio reden. `grund` sagt, warum.
 */
export function waehlen(z: AnrufZustand, roheNummer: string): { zustand: AnrufZustand; nummer: string } | { grund: string } {
  if (z.phase === "waehlt" || z.phase === "verbunden" || z.phase === "legt_auf") {
    return { grund: "Es läuft bereits ein Gespräch." };
  }
  if (z.phase !== "bereit") {
    return { grund: "Das Telefon ist noch nicht bereit." };
  }
  const nummer = nummerNormalisieren(roheNummer);
  if (!nummer) {
    return { grund: "Diese Nummer ist nicht eindeutig. Bitte mit Vorwahl eingeben, zum Beispiel 040 89740100." };
  }
  return { zustand: { ...z, phase: "waehlt", nummer, verbundenSeit: null, fehler: null, ende: null }, nummer };
}

export function verbunden(z: AnrufZustand, jetzt: number): AnrufZustand {
  if (z.phase !== "waehlt") return z;
  return { ...z, phase: "verbunden", verbundenSeit: jetzt };
}

/**
 * Auflegen.
 *
 * 🔴 Auflegen muss aus JEDEM Zustand heraus gehen, in dem eine Leitung offen
 * sein koennte — auch aus "waehlt", auch aus "fehler". Ein Knopf, der in einer
 * Lage nicht greift, ist im Gespraech schlimmer als gar kein Knopf.
 */
export function auflegen(z: AnrufZustand): AnrufZustand {
  if (z.phase === "aus" || z.phase === "bereit" || z.phase === "startet") return z;
  return { ...z, phase: "legt_auf" };
}

export function beendet(z: AnrufZustand, wer: "aufgelegt" | "gegenseite"): AnrufZustand {
  if (z.phase === "aus" || z.phase === "startet" || z.phase === "bereit") return z;
  return {
    ...z,
    phase: "bereit",
    nummer: null,
    verbundenSeit: null,
    fehler: null,
    // Wer aufgelegt hat, weiss man aus dem eigenen Zustand: stand "legt_auf",
    // war man es selbst, egal welches Ereignis zuerst hereinkommt.
    ende: z.phase === "legt_auf" ? "aufgelegt" : wer,
  };
}

export function gescheitert(z: AnrufZustand, text: string): AnrufZustand {
  return {
    ...z,
    phase: "fehler",
    verbundenSeit: null,
    fehler: text || "Unbekannter Fehler.",
    ende: "fehler",
  };
}

/** Nach einem Fehler zurueck in einen bedienbaren Zustand. */
export function fehlerQuittiert(z: AnrufZustand): AnrufZustand {
  if (z.phase !== "fehler") return z;
  return { ...z, phase: "bereit", nummer: null, fehler: null };
}

// ── Ableitungen fuer die Oberflaeche ────────────────────────────────────────

export const kannWaehlen = (z: AnrufZustand): boolean => z.phase === "bereit";
export const kannAuflegen = (z: AnrufZustand): boolean =>
  z.phase === "waehlt" || z.phase === "verbunden";
/** Laeuft gerade Ton? Nur dann darf der Audio-Graph gebaut werden. */
export const imGespraech = (z: AnrufZustand): boolean => z.phase === "verbunden";

export function dauerSekunden(z: AnrufZustand, jetzt: number): number | null {
  if (!z.verbundenSeit) return null;
  return Math.max(0, Math.floor((jetzt - z.verbundenSeit) / 1000));
}

export function dauerLesbar(sekunden: number | null): string {
  if (sekunden == null) return "–";
  const m = Math.floor(sekunden / 60);
  const s = sekunden % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function phaseText(z: AnrufZustand): string {
  switch (z.phase) {
    case "aus": return "Telefon nicht bereit";
    case "startet": return "Telefon meldet sich an";
    case "bereit": return "bereit";
    case "waehlt": return "wählt";
    case "verbunden": return "im Gespräch";
    case "legt_auf": return "legt auf";
    case "fehler": return z.fehler ?? "Fehler";
  }
}
