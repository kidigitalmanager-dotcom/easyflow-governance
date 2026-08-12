// -----------------------------------------------------------------------------
// copilot-config.ts — Skripte und Einwaende im Telefon-Modus.
//
// 🔴🔴 WARUM DIESE DATEI EXISTIERT
//
// Leon hat zweimal woertlich gewarnt: "es gab riesige Probleme, dass Einwaende
// falsch geladen wurden bzw. immer wieder verschwanden. NICHTS von der
// bisherigen Funktionalitaet verlieren."
//
// Im Co-Pilot-Master steckt die Praezedenz in loadRepConfigFromBackend, mitten
// zwischen fetch, DOM-Aufbau und localStorage. Sie ist dort nicht pruefbar, und
// genau deshalb ist sie ueber ein Jahr hinweg immer wieder gekippt. Hier liegt
// sie als REINE Funktion: rein gehen Backend-Antwort, lokaler Stand und
// Paket-Vorgabe, heraus kommt der neue Zustand plus die Liste dessen, was
// geschrieben werden muss. Kein fetch, kein DOM, kein localStorage.
//
// Die Reihenfolge ist byte-genau die des Masters v1.30. Jede Abweichung waere
// ein neuer Weg, auf dem Einwaende verschwinden koennen.
//
// ── Die dokumentierten Ausfaelle, gegen die hier geprueft wird ──────────────
//  E1  vor v1.14 gab es keinen Erstschreib-Pfad: wer nie speicherte, hatte
//      serverseitig nichts. Der Gap-Close synct lokal nach oben.
//  E2  v1.15 praefixte die localStorage-Keys mit der Rep-ID. Alles davor war
//      ab sofort unauffindbar und fiel still auf die Paket-Vorgabe zurueck.
//  E7  ein Alt-Array vom Backend haette eine lokale Mehr-Satz-Bibliothek
//      plattgemacht. Ab v1.23 gewinnt bei mehr als EINEM lokalen Satz das
//      Lokale, und das Backend zieht nach.
//  E11 LEADS_REP_STRICT: die Antwort ist dann 403. Der Master schluckt das
//      ("if (!r.ok) return;") und faellt still zurueck. Hier wird der Grund
//      benannt, statt ihn zu verschlucken.
//  E13 der Abruf laeuft ohne await neben dem Aufbau. Wer im Fenster speichert,
//      sieht seine Aenderung springen. Deshalb ist der Zustandswechsel hier
//      EIN Schritt und nicht eine Folge von Zuweisungen.
//  E14 der Master leitete den key bei JEDEM Speichern neu aus dem Label ab.
//      Ein umbenanntes Label brach Chips, Pin, Dedupe und Bindung. Hier wird
//      der key genau einmal vergeben.
// -----------------------------------------------------------------------------

export type Phase = { id: string; label: string; text: string; goal?: string; next?: string };

export type Skript = {
  id: string;
  name: string;
  scenario?: { vertical?: string; type?: string };
  phases: Phase[];
  meta?: unknown;
};

export type SkriptBibliothek = { library: Skript[]; active_id: string };

export type Einwand = { key: string; hotkey: string; label: string; response: string };

export type EinwandSatz = {
  id: string;
  name: string;
  /** Bindung an ein Skript. Leer = an keines gebunden. */
  script_id: string;
  objections: Einwand[];
  meta?: unknown;
};

export type EinwandBibliothek = { library: EinwandSatz[]; active_id: string };

/** Was der Rep-Config-Endpunkt liefert. null = der Abruf ist gescheitert. */
export type BackendAntwort = {
  ok?: boolean;
  /** false = es gibt gar keine Zeile fuer diesen Rep. */
  found?: boolean;
  /** Alt-Format: nacktes Phasen-Array. */
  script?: Phase[] | null;
  scripts?: SkriptBibliothek | null;
  /** Neu: Bibliothek. Alt: nacktes Einwand-Array. */
  objections?: EinwandBibliothek | Einwand[] | null;
} | null;

export type PaketVorgabe = {
  /** Seeds des Verkaufspakets (sales_packs.mjs). */
  script_seeds?: Array<{ id: string; name?: string; scenario?: { vertical?: string; type?: string }; source?: string; phases_key?: string }>;
  /** Phasen je Seed-Schluessel. */
  phasen?: Record<string, Phase[]>;
  active_script_id?: string;
  objections?: Einwand[];
  /** 'jana' | 'cold-only' — cold-only liefert kein Warm-Transfer-Skript aus. */
  variant?: string;
};

export type Zustand = {
  skripte: SkriptBibliothek | null;
  einwaende: EinwandBibliothek | null;
};

export type Schreibauftrag =
  | { ziel: "lokal"; was: "scripts" | "objections" }
  | { ziel: "backend"; was: "scripts" | "objections" };

export type Uebernahme = {
  zustand: Zustand;
  schreiben: Schreibauftrag[];
  /**
   * Warum es so gekommen ist. Wird angezeigt, NICHT verschluckt — der Master
   * hat hier stillschweigend zurueckgefallen und genau das war E11.
   */
  grund:
    | "backend_gewinnt"
    | "backend_altformat_migriert"
    | "lokal_hochgesynct"
    | "abruf_gescheitert"
    | "nichts_zu_tun";
  /** Klartext fuer die Oberflaeche. */
  meldung: string | null;
};

// ── Gueltigkeit ─────────────────────────────────────────────────────────────
// 🔴 EIN Eintrag reicht. Genau das ist der Klemmpunkt aus dem Master: wer je
// EIN Skript gespeichert hat, sieht die Paket-Vorgabe nie wieder. Die Regel
// wird hier NICHT entschaerft, sondern nur sichtbar gemacht.

export function bibliothekGueltig(o: unknown): o is SkriptBibliothek {
  return !!(o && typeof o === "object" && !Array.isArray(o)
    && Array.isArray((o as SkriptBibliothek).library) && (o as SkriptBibliothek).library.length > 0);
}

export function einwandBibliothekGueltig(o: unknown): o is EinwandBibliothek {
  return !!(o && typeof o === "object" && !Array.isArray(o)
    && Array.isArray((o as EinwandBibliothek).library) && (o as EinwandBibliothek).library.length > 0);
}

/** Aktiver Eintrag; faellt auf den ersten zurueck, nie auf nichts. */
export function aktivesSkript(lib: SkriptBibliothek | null): Skript | null {
  if (!lib) return null;
  return lib.library.find((s) => s && s.id === lib.active_id) ?? lib.library[0] ?? null;
}

export function aktiverEinwandSatz(lib: EinwandBibliothek | null): EinwandSatz | null {
  if (!lib) return null;
  return lib.library.find((s) => s && s.id === lib.active_id) ?? lib.library[0] ?? null;
}

/** active_id normalisieren: fehlt sie, gilt der erste Eintrag. */
function mitAktiv<T extends { library: Array<{ id: string }>; active_id?: string }>(o: T): T {
  return { ...o, active_id: o.active_id || o.library[0].id } as T;
}

// ── Alt-Formate ─────────────────────────────────────────────────────────────

/** Nacktes Einwand-Array -> Satz "Standard". Wie _objLibFromLegacy im Master. */
export function einwaendeAusAltformat(arr: Einwand[]): EinwandBibliothek {
  return {
    library: [{ id: "standard", name: "Standard", script_id: "", objections: arr.map((e) => ({ ...e })) }],
    active_id: "standard",
  };
}

/**
 * Skript-Bibliothek aus der Paket-Vorgabe. Wie _libFromLegacy im Master,
 * inklusive der cold-only-Regel: dort wird das Warm-Transfer-Skript bewusst
 * NICHT ausgeliefert.
 */
export function skripteAusPaket(paket: PaketVorgabe, altePhasen?: Phase[] | null): SkriptBibliothek {
  const seeds = paket.script_seeds ?? [];
  const lib: Skript[] = [];
  for (const s of seeds) {
    if (!s || !s.id) continue;
    if (paket.variant === "cold-only" && s.scenario?.type === "warm_transfer") continue;
    const ph = s.source === "phases" ? (altePhasen ?? []) : (paket.phasen?.[s.phases_key ?? ""] ?? []);
    if (!Array.isArray(ph) || ph.length === 0) continue;
    lib.push({
      id: s.id, name: s.name || s.id, scenario: s.scenario ?? {},
      phases: ph.map((p) => ({ ...p })),
    });
  }
  if (lib.length === 0) {
    lib.push({
      id: "skript_1", name: "Skript 1", scenario: { vertical: "", type: "cold" },
      phases: (altePhasen ?? []).map((p) => ({ ...p })),
    });
  }
  const gewuenscht = paket.active_script_id;
  const aktiv = lib.some((s) => s.id === gewuenscht) ? (gewuenscht as string) : lib[0].id;
  return { library: lib, active_id: aktiv };
}

// ── Die Praezedenz ──────────────────────────────────────────────────────────

/**
 * Der EINE Zustandswechsel nach dem Rep-Config-Abruf.
 *
 * Reihenfolge fuer die SKRIPTE, byte-genau wie im Master:
 *   1. Backend liefert eine gueltige Bibliothek  -> Backend gewinnt hart.
 *   2. Backend liefert nur das Alt-Array         -> migrieren UND zurueckschreiben.
 *   3. Backend hat nichts, lokal ist etwas da    -> lokal nach oben synchen.
 *
 * Reihenfolge fuer die EINWAENDE:
 *   Nur wenn found === true UND objections != null. Sonst wird nichts
 *   angefasst — eine fehlende Zeile darf keine gepflegten Einwaende loeschen.
 *   1. gueltige Bibliothek -> Backend gewinnt.
 *   2. Alt-Array UND lokal mehr als EIN Satz -> 🔴 lokal gewinnt, Backend zieht
 *      nach. Ohne diese Regel machte ein Alt-Array die lokale Mehr-Satz-
 *      Bibliothek platt (E7).
 *   3. Alt-Array sonst -> migrieren.
 *
 * Und bei !found wandert die lokale Einwand-Bibliothek mit hoch (Gap-Close E1).
 */
export function uebernehmeBackend(opts: {
  antwort: BackendAntwort;
  lokal: Zustand;
  paket: PaketVorgabe;
}): Uebernahme {
  const { antwort, lokal, paket } = opts;
  const schreiben: Schreibauftrag[] = [];

  // 🔴 Abruf gescheitert. Der Master macht hier "if (!r.ok) return;" und der
  // Rep sieht danach die Paket-Vorgabe, ohne zu erfahren warum. Genau das ist
  // die Lage, die bei gesetztem LEADS_REP_STRICT flaechendeckend eintritt.
  if (!antwort) {
    return {
      zustand: lokal,
      schreiben: [],
      grund: "abruf_gescheitert",
      meldung: "Die zentrale Fassung war nicht abrufbar. Angezeigt wird der zuletzt bekannte Stand dieses Geraets.",
    };
  }

  let skripte = lokal.skripte;
  let einwaende = lokal.einwaende;
  let grund: Uebernahme["grund"] = "nichts_zu_tun";

  // ── Skripte ───────────────────────────────────────────────────────────────
  if (bibliothekGueltig(antwort.scripts)) {
    skripte = mitAktiv(antwort.scripts);
    schreiben.push({ ziel: "lokal", was: "scripts" });
    grund = "backend_gewinnt";
  } else if (Array.isArray(antwort.script) && antwort.script.length > 0) {
    skripte = skripteAusPaket(paket, antwort.script);
    schreiben.push({ ziel: "lokal", was: "scripts" }, { ziel: "backend", was: "scripts" });
    grund = "backend_altformat_migriert";
  } else if (lokal.skripte) {
    // Gap-Close: das Backend kennt dieses Skript noch nicht.
    schreiben.push({ ziel: "lokal", was: "scripts" }, { ziel: "backend", was: "scripts" });
    grund = "lokal_hochgesynct";
    // 🔴 Nur wenn es GAR KEINE Zeile gibt, wandern auch die Einwaende mit hoch.
    // Existiert eine Zeile, duerfen vorhandene Backend-Einwaende nie von hier
    // aus ueberschrieben werden.
    if (antwort.found !== true && lokal.einwaende) {
      schreiben.push({ ziel: "backend", was: "objections" });
    }
  }

  // ── Einwaende ─────────────────────────────────────────────────────────────
  if (antwort.found === true && antwort.objections != null) {
    if (einwandBibliothekGueltig(antwort.objections)) {
      einwaende = mitAktiv(antwort.objections);
      schreiben.push({ ziel: "lokal", was: "objections" });
      if (grund === "nichts_zu_tun") grund = "backend_gewinnt";
    } else if (Array.isArray(antwort.objections) && antwort.objections.length > 0) {
      if (lokal.einwaende && lokal.einwaende.library.length > 1) {
        // 🔴 E7: NICHT plattmachen. Das Lokale ist reicher, das Backend zieht nach.
        schreiben.push({ ziel: "backend", was: "objections" });
        if (grund === "nichts_zu_tun") grund = "lokal_hochgesynct";
      } else {
        einwaende = einwaendeAusAltformat(antwort.objections);
        schreiben.push({ ziel: "lokal", was: "objections" }, { ziel: "backend", was: "objections" });
        if (grund === "nichts_zu_tun" || grund === "backend_gewinnt") grund = "backend_altformat_migriert";
      }
    }
  }

  return { zustand: { skripte, einwaende }, schreiben, grund, meldung: null };
}

// ── Bindung Einwand-Satz an Skript ──────────────────────────────────────────

/**
 * Der Einwand-Satz folgt dem Skript, nie umgekehrt.
 *
 * Findet sich kein gebundener Satz, bleibt der aktive stehen — bewusst KEIN
 * Rueckfall auf "Standard". Ein stiller Rueckfall waere fuer den Vertriebler
 * nicht von "meine Einwaende sind weg" zu unterscheiden.
 */
export function einwandSatzZumSkript(
  einwaende: EinwandBibliothek | null,
  skript: Skript | null,
): { neueAktivId: string | null; gewechselt: boolean; name: string | null } {
  if (!einwaende || !skript) return { neueAktivId: null, gewechselt: false, name: null };
  const treffer = einwaende.library.find((s) => s && s.script_id && s.script_id === skript.id);
  if (!treffer) return { neueAktivId: null, gewechselt: false, name: null };
  if (treffer.id === einwaende.active_id) return { neueAktivId: treffer.id, gewechselt: false, name: treffer.name };
  return { neueAktivId: treffer.id, gewechselt: true, name: treffer.name || treffer.id };
}

// ── Schluessel-Stabilitaet ──────────────────────────────────────────────────

/** Die 20 Plaetze, exakt wie im Master. */
export const HOTKEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0",
  "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"] as const;

function slug(label: string, i: number): string {
  const s = label.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return s || `obj_${i}`;
}

/**
 * Einwaende aus dem Editor uebernehmen, OHNE bestehende Schluessel zu aendern.
 *
 * 🔴 E14: der Master leitete den key bei JEDEM Speichern neu aus dem Label ab.
 * Wer ein Label umbenannte, aenderte damit den Schluessel — und Chips, Pin,
 * Dedupe und die Skript-Bindung zeigten ins Leere. Hier bekommt ein Einwand
 * seinen Schluessel genau einmal: beim Anlegen.
 *
 * Zweite Aenderung gegenueber dem Master: Umlaute fallen nicht mehr weg.
 * "Zu teuer?" und "Zu teuer!" kollidierten dort auf denselben Schluessel;
 * hier wird angehaengt statt ueberschrieben.
 */
export function uebernehmeEditor(
  zeilen: Array<{ key?: string; hotkey?: string; label?: string; response?: string }>,
): Einwand[] {
  const vergeben = new Set<string>();
  const raus: Einwand[] = [];
  zeilen.forEach((z, i) => {
    const label = String(z.label ?? "").trim();
    if (!label && !String(z.response ?? "").trim()) return;
    // Ein bereits vergebener Schluessel bleibt, egal wie das Label heisst.
    let key = String(z.key ?? "").trim();
    if (!key) key = slug(label, i);
    if (vergeben.has(key)) {
      let n = 2;
      while (vergeben.has(`${key}_${n}`)) n += 1;
      key = `${key}_${n}`;
    }
    vergeben.add(key);
    raus.push({
      key,
      hotkey: String(z.hotkey ?? "").trim().toUpperCase().slice(0, 1),
      label: label || key,
      response: String(z.response ?? ""),
    });
  });
  return raus;
}

/**
 * Was am aktiven Satz nicht stimmt.
 *
 * Der Kerim-Fall vom 30.07.: das aktive Skript hatte EINE leere Phase, und das
 * Cockpit zeigte sie klaglos an. Er hat deshalb ab dem 23.07. faktisch ohne
 * Skript telefoniert, ohne dass es jemand sah. Ein leerer Zustand muss sich
 * melden.
 */
export function befundeAmStand(z: Zustand): string[] {
  const befunde: string[] = [];
  const s = aktivesSkript(z.skripte);
  if (!z.skripte || !s) {
    befunde.push("Kein Skript geladen.");
  } else {
    const leer = s.phases.filter((p) => !String(p?.text ?? "").trim()).length;
    if (s.phases.length === 0) befunde.push(`Das Skript "${s.name}" hat keine Phasen.`);
    else if (leer > 0) befunde.push(`Im Skript "${s.name}" ${leer === 1 ? "ist eine Phase" : `sind ${leer} Phasen`} ohne Text.`);
  }
  const e = aktiverEinwandSatz(z.einwaende);
  if (!z.einwaende || !e) {
    befunde.push("Keine Einwaende geladen. Die Einwand-Erkennung bleibt damit aus.");
  } else if (e.objections.length === 0) {
    befunde.push(`Der Einwand-Satz "${e.name}" ist leer. Die Einwand-Erkennung bleibt damit aus.`);
  } else {
    const ohneHotkey = e.objections.filter((o) => !o.hotkey).length;
    if (ohneHotkey > 0) befunde.push(`${ohneHotkey} Einwaende haben keine Taste.`);
    const doppelt = new Map<string, number>();
    for (const o of e.objections) if (o.hotkey) doppelt.set(o.hotkey, (doppelt.get(o.hotkey) ?? 0) + 1);
    const kollision = [...doppelt.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    if (kollision.length) befunde.push(`Doppelt belegte Tasten: ${kollision.join(", ")}.`);
  }
  return befunde;
}
