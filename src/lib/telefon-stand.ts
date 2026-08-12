// -----------------------------------------------------------------------------
// telefon-stand.ts — was der Telefon-Modus in der Konsole aus rep-config macht.
//
// 🔴 Die Praezedenz steht NICHT hier. Sie steht in `uebernehmeBackend`
// (copilot-config.ts), byte-genau aus dem Master v1.30 herausgeloest, und darf
// an keiner zweiten Stelle stehen. Diese Datei ruft sie auf und uebersetzt das
// Ergebnis in das, was die Oberflaeche zeigt.
//
// Der EINE Unterschied zwischen Cockpit und Konsole, und er ist wichtig:
//
//   Das Cockpit hat einen localStorage-Stand des Vertrieblers und die
//   Paket-Vorgabe aus `sales_packs.mjs`. Die Konsole hat BEIDES NICHT.
//
// Daraus folgt zwingend, dass die Konsole nur LIEST:
//
//   * `lokal` ist leer. Damit kann der Zweig "lokal nach oben synchen" gar
//     nicht ausloesen — die Konsole kann also nichts hochspielen, was sie sich
//     eingebildet hat.
//   * `paket` ist leer. Wuerde ein Vertriebler noch das Alt-Format tragen,
//     baute `skripteAusPaket` daraus ein Ersatz-Skript namens "Skript 1" und
//     der Schreibauftrag wuerde es unter diesem Namen zurueckschreiben. Das
//     waere ein stiller Datenverlust, ausgeloest davon, dass jemand in der
//     Konsole auf einen Reiter geklickt hat.
//
// Deshalb werden Schreibauftraege hier nicht ausgefuehrt, sondern GEMELDET.
// Gepflegt wird weiter ueber die Zuweisung unter System, Voice & Co-Pilot.
// -----------------------------------------------------------------------------
import {
  uebernehmeBackend, aktivesSkript, aktiverEinwandSatz, befundeAmStand,
  type BackendAntwort, type Zustand, type Skript, type EinwandSatz,
  type Schreibauftrag, type Uebernahme,
} from "./copilot-config";

export type TelefonStand = {
  zustand: Zustand;
  skript: Skript | null;
  satz: EinwandSatz | null;
  /** Was am Stand nicht stimmt. Leer = alles in Ordnung. */
  befunde: string[];
  /** Klartext, wenn der Abruf gescheitert ist. Wird ANGEZEIGT, nie verschluckt. */
  meldung: string | null;
  grund: Uebernahme["grund"];
  /**
   * Was das Cockpit an dieser Stelle geschrieben haette. Die Konsole tut es
   * NICHT — siehe Kopf dieser Datei. Steht hier, damit es sichtbar ist statt
   * unbemerkt zu fehlen.
   */
  nichtGeschrieben: Schreibauftrag[];
};

const LEER: Zustand = { skripte: null, einwaende: null };

export function standAusRepConfig(antwort: BackendAntwort): TelefonStand {
  const u = uebernehmeBackend({ antwort, lokal: LEER, paket: {} });
  const zustand = u.zustand;
  return {
    zustand,
    skript: aktivesSkript(zustand.skripte),
    satz: aktiverEinwandSatz(zustand.einwaende),
    befunde: befundeAmStand(zustand),
    meldung: u.meldung,
    grund: u.grund,
    nichtGeschrieben: u.schreiben.filter((s) => s.ziel === "backend"),
  };
}

/**
 * Kann mit diesem Stand ueberhaupt telefoniert werden?
 *
 * 🔴 "Es laedt nicht" ohne Rueckmeldung war E5. Ein Telefon, das ohne Skript
 * und ohne Einwaende dasteht, muss das SAGEN, statt eine leere Flaeche zu
 * zeigen, die aussieht wie "noch am Laden".
 */
export function bereit(stand: TelefonStand): boolean {
  return !!stand.skript && !!stand.satz && stand.satz.objections.length > 0;
}
