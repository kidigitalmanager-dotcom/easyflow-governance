// -----------------------------------------------------------------------------
// Waehlleiste.tsx — Nummer eingeben, anrufen, auflegen.
//
// Der Abnahmesatz des Briefings faengt hier an: "Leon oeffnet Vertrieb ->
// Telefon, waehlt eine Nummer, hoert den Gespraechspartner". Die Leiste ist
// deshalb bewusst schlicht und immer an derselben Stelle.
//
// 🔴 Zwei Dinge, die hier NICHT stehen:
//   * Keine Entscheidung, ob gewaehlt werden darf. Die trifft `waehlen` in
//     anruf-zustand.ts, und sie liefert bei einem Nein einen SATZ.
//   * Keine zweite Nummern-Normalisierung. Es gibt genau eine, und sie ist
//     geprueft. Eine "Vorschau-Variante" hier waere eine zweite Wahrheit.
// -----------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dot } from "@/components/ue/primitives";
import {
  kannWaehlen, kannAuflegen, dauerSekunden, dauerLesbar, nummerLesbar, phaseText,
  type AnrufZustand,
} from "@/lib/anruf-zustand";
import { Phone, PhoneOff, Mic, MicOff, X, CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Waehlleiste({
  zustand, waehle, auflegen, quittieren, stumm, stummSchalten, repName, aufTermin,
}: {
  zustand: AnrufZustand;
  waehle: (nummer: string) => void;
  auflegen: () => void;
  quittieren: () => void;
  stumm: boolean;
  stummSchalten: (an: boolean) => void;
  repName?: string | null;
  /** Leon 13.08. Punkt 4: Termin direkt aus dem Gespraech heraus. */
  aufTermin?: () => void;
}) {
  const [eingabe, setEingabe] = useState("");
  const [jetzt, setJetzt] = useState(() => Date.now());

  // Die Uhr laeuft nur, solange sie gebraucht wird. 🔴 Sie haengt an der DAUER,
  // nie an einem Inhalt — ein Timer auf Inhalt war E3.
  useEffect(() => {
    if (!zustand.verbundenSeit) return;
    const i = setInterval(() => setJetzt(Date.now()), 1000);
    return () => clearInterval(i);
  }, [zustand.verbundenSeit]);

  const laeuft = kannAuflegen(zustand) || zustand.phase === "legt_auf";
  const dauer = dauerSekunden(zustand, jetzt);

  const ton = zustand.phase === "verbunden" ? "emerald"
    : zustand.phase === "fehler" ? "danger"
    : zustand.phase === "bereit" ? "emerald" : "amber";

  return (
    <div className="glass-card animate-fade-up">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        {/* Zustand — immer sichtbar, immer im Klartext. */}
        <div className="flex min-w-[13rem] items-center gap-2">
          <Dot tone={ton} pulse={zustand.phase === "verbunden" || zustand.phase === "waehlt"} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-foreground">{phaseText(zustand)}</p>
            <p className="truncate text-[11.5px] text-muted-foreground">
              {laeuft
                ? `${nummerLesbar(zustand.nummer)}${dauer !== null ? ` · ${dauerLesbar(dauer)}` : ""}`
                : repName || "–"}
            </p>
          </div>
        </div>

        {/* Nummer */}
        <div className="flex min-w-[15rem] flex-1 items-center gap-2">
          <Input
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && kannWaehlen(zustand) && eingabe.trim()) {
                e.preventDefault();
                waehle(eingabe);
              }
            }}
            placeholder="040 89740100"
            inputMode="tel"
            autoComplete="tel"
            disabled={laeuft}
            aria-label="Rufnummer"
            className="h-9 tabular"
          />
          <Button
            className="h-9 shrink-0 gap-1.5"
            onClick={() => waehle(eingabe)}
            disabled={laeuft || !kannWaehlen(zustand) || !eingabe.trim()}
          >
            <Phone className="h-4 w-4" /> anrufen
          </Button>
          {/* 🔴 Leon, 13.08.: "anruf beenden button fehlt". Er WAR da, aber nur
              waehrend eines Gespraechs — wer nicht telefonierte, sah ihn nie
              und konnte nicht wissen, dass es ihn gibt. Jetzt steht er immer.
              Das ist nicht nur Gewohnheit: bliebe der Zustandsautomat je
              haengen, waere ein Knopf, den es nicht GIBT, schlimmer als einer,
              der ausgegraut ist. */}
          <Button
            variant="destructive"
            className="h-9 shrink-0 gap-1.5"
            onClick={auflegen}
            disabled={!laeuft || zustand.phase === "legt_auf"}
            title={laeuft ? "Gespräch beenden" : "Es läuft gerade kein Gespräch"}
          >
            <PhoneOff className="h-4 w-4" /> auflegen
          </Button>
          {/* 🔴 Der Termin-Knopf steht IMMER, nicht nur im Gespraech: der
              Kunde sagt "passt, Dienstag" oft in der Sekunde vor dem
              Auflegen, und danach ist die Leitung tot, der Termin aber noch
              nicht eingetragen. */}
          {aufTermin && (
            <Button
              variant="outline"
              className="h-9 shrink-0 gap-1.5"
              onClick={aufTermin}
              title="Termin aus diesem Gespräch"
            >
              <CalendarPlus className="h-4 w-4" /> Termin
            </Button>
          )}
          {zustand.phase === "verbunden" && (
            <Button
              variant="outline"
              size="icon"
              className={cn("h-9 w-9 shrink-0", stumm && "border-amber/50 text-amber")}
              onClick={() => stummSchalten(!stumm)}
              aria-label={stumm ? "Mikrofon wieder an" : "Mikrofon stumm"}
              title={stumm ? "Mikrofon wieder an" : "Mikrofon stumm"}
            >
              {stumm ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* 🔴 Fehler bekommen eine eigene Zeile und einen Knopf, der sie
          wegraeumt. Ein Fehler, den man nicht quittieren kann, blockiert das
          Telefon bis zum Neuladen. */}
      {zustand.phase === "fehler" && zustand.fehler && (
        <div className="flex items-start justify-between gap-3 border-t border-line-soft bg-danger/5 px-4 py-2.5">
          <p className="text-[12.5px] text-danger">{zustand.fehler}</p>
          <Button variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-[11px]" onClick={quittieren}>
            <X className="mr-1 h-3 w-3" /> verstanden
          </Button>
        </div>
      )}
    </div>
  );
}

export default Waehlleiste;
