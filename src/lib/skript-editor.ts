// -----------------------------------------------------------------------------
// skript-editor.ts — die Regeln fuer das ZURUECKSCHREIBEN von Skripten und
// Einwaenden.
//
// Leon, 13.08.: "es gibt keinen skript editor, dass du einzelne phasen oder
// einwaende bearbeiten kannst. Unter einstellung kannst du nur skripte
// zuweisen und hochladen aber auch nicht einzelnd bearbeiten wie im co
// piloten".
//
// Das stimmt, und es ist ein Verlust: der Co-Pilot konnte es. `MeineSkripte`
// traegt bis heute den Satz "Nur Lesen, mit Absicht. Ein zweiter Editor waere
// ein zweiter Weg, auf dem Einwaende verschwinden koennen". Der Satz war
// richtig gedacht, aber er stand auf einer falschen Annahme: es gibt keinen
// ERSTEN Editor. Also ist dies kein zweiter Weg, sondern der einzige.
//
// 🔴 Damit gilt die volle Vorsicht des rep-config-Pfades. Auf genau diesem
// Weg entstand im Juli "Skript 1": die Konsole hat beim LESEN ein Alt-Format
// umgeformt, und das Zurueckschreiben hat die Umformung festgeschrieben.
//
// Die Sperre dagegen steht hier und ist der Kern der Datei:
//
//   Geschrieben wird NUR, wenn die Konsole beim Lesen NICHTS umformen musste.
//   Musste sie es, steht der Grund da statt eines stillen Datenverlusts.
//
// `telefon-stand.ts` meldet das bereits als `nichtGeschrieben` — genau die
// Schreibauftraege, die das Cockpit ausgefuehrt haette und die Konsole nicht.
// -----------------------------------------------------------------------------
import type { Einwand, EinwandSatz, Phase, Skript, Zustand } from "./copilot-config";
import type { TelefonStand } from "./telefon-stand";

// ── Die Sperre ───────────────────────────────────────────────────────────────

export type Freigabe = { ja: true; grund?: undefined } | { ja: false; grund: string };

/**
 * Darf ueberhaupt zurueckgeschrieben werden?
 *
 * 🔴 Vier Gruende, es zu lassen, und jeder einzelne hat einen Vorfall hinter
 * sich oder verhindert einen offensichtlichen.
 */
export function darfSpeichern(stand: TelefonStand): Freigabe {
  // 1. Der Abruf ist gescheitert. Was man nicht gelesen hat, schreibt man
  //    nicht zurueck — sonst ueberschreibt ein Netzfehler den Bestand.
  if (stand.meldung) {
    return { ja: false, grund: "Der Stand konnte nicht geladen werden. Erst neu laden, dann bearbeiten." };
  }
  // 2. 🔴 Die Konsole musste beim Lesen umformen. Genau so entstand "Skript 1":
  //    ohne Paket-Vorgabe baut `skripteAusPaket` ein Ersatz-Skript, und das
  //    Zurueckschreiben macht den Ersatz zum Bestand.
  if (stand.nichtGeschrieben.length > 0) {
    return {
      ja: false,
      grund:
        "Dieser Vertriebler trägt noch das alte Format. Die Konsole müsste es beim Speichern umformen, " +
        "und dabei ginge der Skript-Name verloren. Bitte einmal über System, Voice & Co-Pilot neu zuweisen.",
    };
  }
  // 3. Es gibt gar keine Bibliothek — dann gibt es auch nichts zu ersetzen.
  if (!stand.zustand.skripte && !stand.zustand.einwaende) {
    return { ja: false, grund: "Für diesen Vertriebler ist nichts hinterlegt." };
  }
  return { ja: true };
}

// ── Einzelne Aenderungen, ohne Unbekanntes wegzuwerfen ───────────────────────

/**
 * Eine Phase aendern.
 *
 * 🔴 `...p` zuerst: `goal`, `next` und alles, was spaeter dazukommt, bleibt
 * stehen. Wer hier ein neues Objekt baut, wirft Felder weg, die er nicht
 * kennt — und merkt es erst, wenn im Cockpit das Phasenziel fehlt.
 */
export function phaseGesetzt(skript: Skript, phaseId: string, patch: Partial<Phase>): Skript {
  return {
    ...skript,
    phases: skript.phases.map((p) => (p.id === phaseId ? { ...p, ...patch, id: p.id } : p)),
  };
}

/**
 * Einen Einwand aendern.
 *
 * 🔴 `key` ist die EINZIGE Identitaet (E14: ein aus dem Label abgeleiteter
 * Schluessel wanderte, sobald jemand das Label anpasste, und die gepinnte
 * Antwort verschwand mitten im Gespraech). Er wird hier festgehalten und ist
 * in der Oberflaeche nicht editierbar.
 */
export function einwandGesetzt(satz: EinwandSatz, key: string, patch: Partial<Einwand>): EinwandSatz {
  return {
    ...satz,
    objections: satz.objections.map((o) => (o.key === key ? { ...o, ...patch, key: o.key } : o)),
  };
}

// ── Die Bibliothek zusammensetzen ────────────────────────────────────────────

/**
 * Ein Skript in der Bibliothek ersetzen.
 *
 * 🔴 Gibt `null` zurueck, wenn die id nicht in der Bibliothek steht. NICHT
 * anhaengen: ein Skript, das durch einen Tippfehler in der id ploetzlich
 * zweimal existiert, ist schlimmer als eine Fehlermeldung.
 * 🔴 `active_id` bleibt, wie es war. Bearbeiten ist kein Zuweisen.
 */
export function ersetzeSkript(zustand: Zustand, skript: Skript): { library: Skript[]; active_id: string } | null {
  const bib = zustand.skripte;
  if (!bib) return null;
  if (!bib.library.some((s) => s.id === skript.id)) return null;
  return {
    library: bib.library.map((s) => (s.id === skript.id ? skript : s)),
    active_id: bib.active_id,
  };
}

/** Dasselbe fuer die Einwand-Saetze. */
export function ersetzeSatz(zustand: Zustand, satz: EinwandSatz): { library: EinwandSatz[]; active_id: string } | null {
  const bib = zustand.einwaende;
  if (!bib) return null;
  if (!bib.library.some((s) => s.id === satz.id)) return null;
  return {
    library: bib.library.map((s) => (s.id === satz.id ? satz : s)),
    active_id: bib.active_id,
  };
}

// ── Was man vor dem Speichern sieht ──────────────────────────────────────────

/**
 * Was sich aendert, in Saetzen.
 *
 * 🔴 Nicht Zierde: bevor auf diesem Weg etwas geschrieben wird, soll dastehen,
 * WAS geschrieben wird. Ein "Gespeichert"-Haken ohne Aufzaehlung ist genau die
 * Sorte Rueckmeldung, nach der niemand merkt, dass etwas fehlt.
 */
export function aenderungen(vorher: Skript | null, nachher: Skript | null): string[] {
  if (!vorher || !nachher) return [];
  const raus: string[] = [];
  if (vorher.name !== nachher.name) raus.push(`Name: „${vorher.name}" wird „${nachher.name}"`);
  for (const neu of nachher.phases) {
    const alt = vorher.phases.find((p) => p.id === neu.id);
    if (!alt) { raus.push(`Phase „${neu.label || neu.id}" kommt dazu`); continue; }
    if (alt.label !== neu.label) raus.push(`Phase „${alt.label || alt.id}" heißt jetzt „${neu.label}"`);
    if (alt.text !== neu.text) raus.push(`Sprechtext in „${neu.label || neu.id}" geändert`);
    if ((alt.goal ?? "") !== (neu.goal ?? "")) raus.push(`Ziel in „${neu.label || neu.id}" geändert`);
  }
  for (const alt of vorher.phases) {
    if (!nachher.phases.some((p) => p.id === alt.id)) raus.push(`Phase „${alt.label || alt.id}" fällt weg`);
  }
  return raus;
}

export function aenderungenSatz(vorher: EinwandSatz | null, nachher: EinwandSatz | null): string[] {
  if (!vorher || !nachher) return [];
  const raus: string[] = [];
  if (vorher.name !== nachher.name) raus.push(`Name: „${vorher.name}" wird „${nachher.name}"`);
  for (const neu of nachher.objections) {
    const alt = vorher.objections.find((o) => o.key === neu.key);
    if (!alt) { raus.push(`Einwand „${neu.label || neu.key}" kommt dazu`); continue; }
    if (alt.label !== neu.label) raus.push(`Einwand „${alt.label}" heißt jetzt „${neu.label}"`);
    if (alt.response !== neu.response) raus.push(`Antwort auf „${neu.label || neu.key}" geändert`);
    if (alt.hotkey !== neu.hotkey) raus.push(`Taste für „${neu.label || neu.key}": ${alt.hotkey || "–"} wird ${neu.hotkey || "–"}`);
  }
  for (const alt of vorher.objections) {
    if (!nachher.objections.some((o) => o.key === alt.key)) raus.push(`Einwand „${alt.label || alt.key}" fällt weg`);
  }
  return raus;
}

// ── Was vor dem Speichern nicht stimmen darf ─────────────────────────────────

/**
 * Einwaende pruefen.
 *
 * 🔴 Zwei Einwaende auf derselben Taste heisst: einer ist im Gespraech nicht
 * erreichbar, und man merkt es genau dann nicht, wenn man ihn braucht.
 */
export function befundeSatz(satz: EinwandSatz): string[] {
  const raus: string[] = [];
  const belegt = new Map<string, string>();
  for (const o of satz.objections) {
    const t = String(o.hotkey ?? "").trim();
    if (!t) continue;
    const schon = belegt.get(t);
    if (schon) raus.push(`Taste ${t} ist doppelt belegt: „${schon}" und „${o.label}". Eine der beiden ist nicht erreichbar.`);
    else belegt.set(t, o.label);
  }
  for (const o of satz.objections) {
    if (!String(o.label ?? "").trim()) raus.push(`Ein Einwand hat keine Beschriftung (${o.key}).`);
    if (!String(o.response ?? "").trim()) raus.push(`„${o.label || o.key}" hat keine Antwort. Im Gespräch steht dann eine leere Karte.`);
  }
  return raus;
}

/** Skripte pruefen. Eine leere Phase ist der Fall Kerim. */
export function befundeSkript(skript: Skript): string[] {
  const raus: string[] = [];
  if (!String(skript.name ?? "").trim()) raus.push("Das Skript hat keinen Namen.");
  for (const p of skript.phases) {
    if (!String(p.text ?? "").trim()) {
      raus.push(`Phase „${p.label || p.id}" hat keinen Sprechtext. Genau so telefonierte im Juli jemand wochenlang ohne Skript.`);
    }
  }
  return raus;
}
