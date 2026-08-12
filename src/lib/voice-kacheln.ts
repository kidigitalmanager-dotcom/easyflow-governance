// -----------------------------------------------------------------------------
// voice-kacheln.ts — der Zustand der Bereichs-Kacheln unter /voice, als reine
// Funktionen (Baustein 0, 12.08.2026).
//
// Warum es diese Datei gibt: am 12.08. meldeten drei Kacheln "Zustand nicht
// abrufbar", OBWOHL die Endpunkte mit 200 antworteten. Es waren drei getrennte
// Fehler, und alle drei hatten dieselbe Wurzel — der Kachel-Zustand wurde
// mitten in der Seite zusammengeruehrt, wo ihn niemand pruefen konnte:
//
//   1. Der Termin-Zustand kam aus einem nackten useEffect mit leerer
//      Abhaengigkeitsliste. Er feuerte vor der Wiederherstellung der Sitzung,
//      apiFetch warf 401, und weil der Effekt nie wieder lief, blieb die
//      Kachel bis zum vollen Neuladen rot.
//   2. Genau dieser Zustand fehlte in der Liste, die der "Neu laden"-Knopf
//      wiederholt. Wer klickte, sah die Kachel rot bleiben.
//   3. "Skripte & Einwaende" hatte gar keinen eigenen Zustand, sondern borgte
//      sich den der Co-Pilot-Kachel und fiel mit ihr um.
//
// Die Gegenmassnahme ist nicht "einmal richtig hinschreiben", sondern der
// Zuschnitt: `QuellKey` zaehlt die Zustands-Quellen auf, und die Seite baut
// ihre Wiederhol-Liste als `Record<QuellKey, ...>`. Wer kuenftig eine Kachel
// mit eigenem Abruf ergaenzt und sie im "Neu laden" vergisst, bekommt einen
// tsc-Fehler statt einer stillen roten Kachel.
// -----------------------------------------------------------------------------

/** Farbton der Zustands-Perle. Deckungsgleich mit `DotTone` der Primitives. */
export type KachelTon = "emerald" | "amber" | "danger" | "muted";

export type KachelZustand = { tone: KachelTon; text: string };

export const UNBEKANNT: KachelZustand = { tone: "muted", text: "–" };
export const GESCHEITERT: KachelZustand = { tone: "danger", text: "Zustand nicht abrufbar" };

/**
 * Die Zustands-QUELLEN, nicht die Kacheln.
 *
 * "calls" hat keine eigene Quelle: die Anrufzahl steckt in derselben
 * Reps-Antwort. Deshalb steht hier `reps` einmal, nicht zweimal.
 */
export type QuellKey = "reps" | "consent" | "agents" | "leads" | "copilot" | "faelle" | "scripts" | "termin";

export const QUELLEN: QuellKey[] = ["reps", "consent", "agents", "leads", "copilot", "faelle", "scripts", "termin"];

/** Welche Kachel haengt an welcher Quelle. Vollstaendig, sonst meckert tsc. */
export const KACHEL_QUELLE = {
  reps: "reps",
  faelle: "faelle",
  calls: "reps",
  consent: "consent",
  copilot: "copilot",
  scripts: "scripts",
  agents: "agents",
  leads: "leads",
  termin: "termin",
} as const satisfies Record<string, QuellKey>;

/** Ein Abruf, wie ihn der "Neu laden"-Knopf sieht. */
export type Statusabruf = { failed: boolean; fetching: boolean; retry: () => void };

/**
 * Die Lage aller Zustands-Abrufe.
 *
 * Nimmt bewusst ein `Record<QuellKey, ...>` und keine Liste: eine Liste kann
 * einen Eintrag vergessen, ein vollstaendiger Record nicht.
 */
export function statusLage(abrufe: Record<QuellKey, Statusabruf>): {
  anyFailed: boolean;
  anyRetrying: boolean;
  gescheiterte: QuellKey[];
  retryAll: () => void;
} {
  const gescheiterte = QUELLEN.filter((q) => abrufe[q].failed);
  return {
    anyFailed: gescheiterte.length > 0,
    anyRetrying: gescheiterte.some((q) => abrufe[q].fetching),
    gescheiterte,
    retryAll: () => gescheiterte.forEach((q) => abrufe[q].retry()),
  };
}

// ── Kachel-Zustaende ─────────────────────────────────────────────────────────

/** Was ein Query-Hook fuer die Zustands-Ableitung hergeben muss. */
export type Abfrage<T> = { isLoading: boolean; isError: boolean; data?: T | null };

/**
 * Termin-Kachel.
 *
 * 🔴 Der Aufrufer MUSS `enabled: !!session` gesetzt haben. Ohne Sitzung ist
 * `isLoading` wahr und die Kachel steht auf "–" statt faelschlich auf rot.
 */
export function terminZustand(q: Abfrage<{ termin_moeglich?: boolean }>): KachelZustand {
  if (q.isLoading) return UNBEKANNT;
  if (q.isError) return GESCHEITERT;
  if (!q.data) return UNBEKANNT;
  return q.data.termin_moeglich
    ? { tone: "emerald", text: "Kalender verbunden" }
    : { tone: "amber", text: "Kein Kalender verbunden" };
}

export type SkriptUebersichtRep = {
  active_script_id?: string | null;
  scripts?: Array<{ empty_phases?: number }> | null;
};
export type SkriptUebersicht = {
  reps?: SkriptUebersichtRep[] | null;
  library_script_ids?: string[] | null;
};

/**
 * Skripte-&-Einwaende-Kachel — ein EIGENER Zustand aus
 * `/v1/copilot/scripts/overview`.
 *
 * 🔴 Die leere Phase steht vor der guten Nachricht. Kerim telefonierte ab dem
 * 23.07. faktisch ohne Skript, weil das aktive Skript EINE leere Phase hatte
 * und das Cockpit sie klaglos anzeigte. Eine Uebersicht, die "3 versorgt"
 * meldet und die leere Phase verschweigt, wiederholt genau diesen Ausfall.
 *
 * `nichtVerknuepft` ist KEIN Serverfehler: der Co-Pilot laeuft gegen ein
 * eigenes Backend, "kein Workspace verknuepft" ist ein legitimer Zustand.
 */
export function skripteZustand(
  q: Abfrage<SkriptUebersicht>,
  nichtVerknuepft = false,
): KachelZustand {
  if (q.isLoading) return UNBEKANNT;
  if (nichtVerknuepft) return { tone: "muted", text: "nicht verknüpft" };
  if (q.isError) return GESCHEITERT;
  const reps = q.data?.reps ?? [];
  const leer = reps.filter((r) => (r.scripts ?? []).some((s) => (s.empty_phases ?? 0) > 0)).length;
  if (leer > 0) return { tone: "amber", text: leer === 1 ? "1 leere Phase" : `${leer} mit leerer Phase` };
  const versorgt = reps.filter((r) => !!r.active_script_id).length;
  if (versorgt > 0) return { tone: "emerald", text: `${versorgt} versorgt` };
  const lib = (q.data?.library_script_ids ?? []).length;
  if (lib > 0) return { tone: "amber", text: "nicht zugewiesen" };
  return { tone: "muted", text: "keine angelegt" };
}
