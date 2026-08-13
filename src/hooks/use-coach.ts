// -----------------------------------------------------------------------------
// use-coach.ts — Baustein 5: der Coach im Gespraech.
//
// Leon, 13.08.: "der coach ist doch eigenstaendig, der muss doch einfach
// unabhaengig laden je nach definiertem skript und einwaenden".
//
// Genau so laeuft er. Was hier hineingeht, ist ausschliesslich:
//   * das Klassifikations-FENSTER aus dg-transkript.ts (die letzten zwei
//     finalen Kunden-Aeusserungen),
//   * die Einwaende des aktiven Satzes (key und label),
//   * der Wortlaut der aktuellen Skript-Phase.
// Kein Paket, keine Branche.
//
// 🔴 Zwei Riegel aus dem Master, beide teuer bezahlt:
//   OBJ_DETECT_DEBOUNCE_MS  Nicht bei jedem Zwischenstand feuern.
//   Die Reihenfolge-Sicherung (objDetectReqId): eine langsame Antwort auf ein
//   altes Fenster darf keine neuere ueberschreiben. Ohne sie erscheint mitten
//   im Gespraech ein Einwand von vor zwanzig Sekunden.
// -----------------------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import { holeCoachEinwand, holeCoachSatz } from "@/lib/api-client";
import type { Einwand, Phase } from "@/lib/copilot-config";

/** v1.16f im Master. Kuerzer heisst mehr Aufrufe ohne besseres Ergebnis. */
const EINWAND_ENTPRELLUNG_MS = 700;
/** v1.16 im Master. */
const SATZ_ENTPRELLUNG_MS = 800;

export type Coach = {
  /** Zuletzt erkannter Einwand. Der Aufrufer entscheidet, was damit passiert. */
  erkannterKey: string | null;
  satz: string | null;
  laeuft: boolean;
  /** 🔴 Fehler werden GEZAEHLT und angezeigt, nicht still geschluckt (F5/E5). */
  fehler: string | null;
};

export function useCoach(opts: {
  clientId: string | null;
  /** Das Klassifikations-Fenster. Aendert es sich, denkt der Coach nach. */
  fenster: string;
  einwaende: Einwand[];
  phase: Phase | null;
  /** Nur im Gespraech. Ausserhalb wird nichts gefragt und nichts bezahlt. */
  aktiv: boolean;
}): Coach {
  const { clientId, fenster, einwaende, phase, aktiv } = opts;
  const [erkannterKey, setKey] = useState<string | null>(null);
  const [satz, setSatz] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // 🔴 Die Reihenfolge-Sicherung. Nur die Antwort auf die JUENGSTE Frage zaehlt.
  const einwandNr = useRef(0);
  const satzNr = useRef(0);
  const einwaendeRef = useRef(einwaende); einwaendeRef.current = einwaende;
  const phaseRef = useRef(phase); phaseRef.current = phase;

  // ── Einwand-Erkennung ────────────────────────────────────────────────────
  useEffect(() => {
    if (!aktiv || !clientId || !fenster.trim()) return;
    const paare = einwaendeRef.current
      .map((o) => ({ key: o.key, label: o.label }))
      .filter((o) => o.key);
    if (!paare.length) return;

    const t = setTimeout(async () => {
      const meins = ++einwandNr.current;
      setLaeuft(true);
      try {
        const r = await holeCoachEinwand(clientId, fenster, paare);
        // Veraltete Antwort: wegwerfen, nicht anzeigen.
        if (meins !== einwandNr.current) return;
        setFehler(null);
        if (r?.key) setKey(r.key);
      } catch (e) {
        if (meins !== einwandNr.current) return;
        // Die Erkennung ist Komfort. Sie darf scheitern — aber sichtbar.
        setFehler(e instanceof Error ? e.message : "Einwand-Erkennung nicht erreichbar.");
      } finally {
        if (meins === einwandNr.current) setLaeuft(false);
      }
    }, EINWAND_ENTPRELLUNG_MS);
    return () => clearTimeout(t);
  }, [clientId, fenster, aktiv]);

  // ── Satzvorschlag ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!aktiv || !clientId || !fenster.trim()) return;
    const p = phaseRef.current;
    // 🔴 Ohne Wortlaut kein Vorschlag. Sonst erfindet das Modell den Pitch.
    if (!p || !String(p.text ?? "").trim()) return;

    const t = setTimeout(async () => {
      const meins = ++satzNr.current;
      try {
        const r = await holeCoachSatz(clientId, fenster, {
          label: p.label, text: p.text, goal: p.goal,
        });
        if (meins !== satzNr.current) return;
        if (r?.satz) setSatz(r.satz);
      } catch {
        // Der Vorschlag ist die Zugabe der Zugabe. Ein Fehler hier darf die
        // Erkennung nicht mit herunterziehen — die Meldung steht schon dort.
      }
    }, SATZ_ENTPRELLUNG_MS);
    return () => clearTimeout(t);
  }, [clientId, fenster, aktiv, phase?.id]);

  // Neues Gespraech: frischer Coach. Der Master macht das in
  // ueResetCoachForNewCall genauso.
  useEffect(() => {
    if (aktiv) return;
    setKey(null); setSatz(null); setFehler(null); setLaeuft(false);
    einwandNr.current++; satzNr.current++;
  }, [aktiv]);

  return { erkannterKey, satz, laeuft, fehler };
}
