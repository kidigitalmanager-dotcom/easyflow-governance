// -----------------------------------------------------------------------------
// vertrieb.ts — die Arbeitsflaeche, als reine Daten und reine Funktionen.
//
// Leon 12.08.2026: *"Wir brauchen eine dedizierte CoPilot bzw vertriebsflaeche
// woraus wir operativ arbeiten koennen"* — Verwaltung und Arbeitsflaeche werden
// getrennt. Es gibt danach DREI Orte:
//
//   Einstellungen -> Mitarbeiter   Menschen anlegen. Reine Admin-Flaeche.
//   System -> Voice & Co-Pilot     Infrastruktur verwalten, Team tracken.
//   Vertrieb (hier)                Operativ arbeiten.
//
// 🔴 Das Prinzip, an dem sich jeder Zweifelsfall entscheidet: DIESELBE QUELLE,
// ZWEI LINSEN. Die Arbeitsflaeche filtert auf mich, die Verwaltung zeigt alle.
// Es wird nichts dupliziert, nur anders gefiltert. Wer einen dieser Bereiche
// hier neu schreibt, hat den Zweck der Entscheidung verfehlt.
//
// Deshalb steht in dieser Datei KEINE Darstellung, sondern nur die Antwort auf
// die eine Frage, die die Arbeits-Linse ueberhaupt erst moeglich macht:
// **wer bin ich?**
// -----------------------------------------------------------------------------

export type ReiterKey = "telefon" | "leads" | "faelle" | "calls" | "termin" | "scripts";

export const REITER: ReiterKey[] = ["telefon", "leads", "faelle", "calls", "termin", "scripts"];

export const REITER_LABEL: Record<ReiterKey, string> = {
  telefon: "Telefon",
  leads: "Leads",
  faelle: "Fälle",
  calls: "Anrufe",
  termin: "Termine",
  scripts: "Skripte & Einwände",
};

export function istReiter(v: string | null | undefined): v is ReiterKey {
  return !!v && (REITER as string[]).includes(v);
}

/** Unbekannter oder fehlender Reiter landet beim Telefon — das ist der Zweck der Flaeche. */
export function reiterAus(v: string | null | undefined): ReiterKey {
  return istReiter(v) ? v : "telefon";
}

// ── Wer bin ich? ─────────────────────────────────────────────────────────────

export type RepMinimal = {
  rep_id: string;
  name: string;
  email: string | null;
  active: boolean;
};

/**
 * Woher die Zuordnung kommt. Wird angezeigt, nicht verschluckt: ein
 * Vertriebler muss sehen koennen, in wessen Namen er gerade arbeitet.
 */
export type Herkunft = "konto" | "gewaehlt" | "einziger" | "keiner";

export type RepWahl<T extends RepMinimal = RepMinimal> = {
  repId: string | null;
  name: string | null;
  /** Der ganze Datensatz — die Skript-Linse braucht z. B. `client_id`. */
  rep: T | null;
  herkunft: Herkunft;
  /** Aktive Vertriebler, unter denen gewaehlt werden kann. */
  auswahl: T[];
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Welcher Vertriebler bin ich?
 *
 * Reihenfolge, und die Reihenfolge ist der ganze Inhalt:
 *   1. Eine ausdrueckliche Wahl gewinnt — aber nur, solange dieser Vertriebler
 *      noch aktiv ist. Ein deaktivierter Rep darf nicht still weiter geladen
 *      werden, sonst arbeitet jemand in einem Namen, den es nicht mehr gibt.
 *   2. Sonst die Adresse des angemeldeten Kontos gegen `rep.email`.
 *   3. Sonst: gibt es genau EINEN aktiven Vertriebler, ist er es.
 *   4. Sonst gar keiner — die Flaeche fragt dann nach, statt zu raten.
 *
 * 🔴 Bewusst NICHT `reps[0]`. Das waere der naive Weg, er faellt bei einem
 * Ein-Personen-Betrieb mit der richtigen Antwort zusammen und wuerde bei Leon,
 * der mehrere Vertriebler hat, still die Anrufe eines Fremden zeigen.
 * Berechtigung ist nicht Konto: diese Funktion ordnet nur ZU, sie erlaubt
 * nichts. Was jemand sehen darf, entscheidet weiterhin das Backend.
 */
export function meinRep<T extends RepMinimal>(
  reps: T[] | null | undefined,
  kontoEmail: string | null | undefined,
  gewaehlt?: string | null,
): RepWahl<T> {
  const auswahl = (reps ?? []).filter((r) => r && r.active);
  const treffer = (r: T, herkunft: Herkunft): RepWahl<T> =>
    ({ repId: r.rep_id, name: r.name, rep: r, herkunft, auswahl });

  const g = gewaehlt ? auswahl.find((r) => r.rep_id === gewaehlt) : undefined;
  if (g) return treffer(g, "gewaehlt");

  const mail = norm(kontoEmail);
  if (mail) {
    const k = auswahl.find((r) => norm(r.email) === mail);
    if (k) return treffer(k, "konto");
  }

  if (auswahl.length === 1) return treffer(auswahl[0], "einziger");

  return { repId: null, name: null, rep: null, herkunft: "keiner", auswahl };
}

// ── Meine Listen ─────────────────────────────────────────────────────────────

export type ListeMinimal = {
  list_id: string;
  assigned_rep_ids?: string[] | null;
};

/**
 * Welche Lead-Listen gehoeren zu mir?
 *
 * Eine Liste OHNE Zuweisung ist zentral und gehoert damit allen — sie muss in
 * der Arbeits-Linse auftauchen, sonst waere sie fuer den Vertriebler
 * unauffindbar (LeadUploadTab: "Bestandslisten ohne Zuweisung gelten als
 * zentral; es gibt keinen Backfill").
 *
 * Ohne bekannte Rep-Zuordnung werden NUR die zentralen Listen gezeigt. Nicht
 * alle: "ich weiss nicht, wer du bist" darf nicht zu "dann zeig ich dir eben
 * alles" werden.
 */
export function meineListen<T extends ListeMinimal>(listen: T[] | null | undefined, repId: string | null): T[] {
  return (listen ?? []).filter((l) => {
    const zug = l.assigned_rep_ids ?? [];
    if (zug.length === 0) return true;
    return !!repId && zug.includes(repId);
  });
}

/** Zentral = keiner Person zugewiesen, also fuer alle sichtbar. */
export function istZentral(l: ListeMinimal): boolean {
  return (l.assigned_rep_ids ?? []).length === 0;
}
