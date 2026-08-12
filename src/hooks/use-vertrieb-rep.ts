// -----------------------------------------------------------------------------
// use-vertrieb-rep.ts — die Identitaet der Arbeitsflaeche.
//
// Die ganze Vertriebsflaeche haengt an EINER Frage: als wen arbeite ich gerade?
// Davon haengen die Anrufe ab, die Listen, die Skripte und spaeter das Telefon
// selbst. Deshalb wird sie an genau einer Stelle beantwortet und von dort
// weitergereicht, statt in jedem Reiter neu erraten zu werden.
//
// Die Entscheidungsregel steht als reine Funktion in src/lib/vertrieb.ts und
// ist dort geprueft. Dieser Hook fuegt nur zwei Dinge hinzu, die eine reine
// Funktion nicht haben kann: den Abruf und das Gedaechtnis.
// -----------------------------------------------------------------------------
import { useCallback, useMemo, useState } from "react";
import { useVoiceReps } from "@/hooks/use-api";
import { useAuth } from "@/contexts/AuthContext";
import { meinRep, type RepWahl } from "@/lib/vertrieb";
import type { VoiceRep } from "@/lib/api-client";

const SPEICHER = "ue_vertrieb_rep";

function gemerkt(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(SPEICHER); } catch { return null; }
}

export type VertriebRep = RepWahl<VoiceRep> & {
  laedt: boolean;
  fehler: boolean;
  /** Ausdruecklich einen anderen Vertriebler waehlen. null = Wahl aufheben. */
  waehle: (repId: string | null) => void;
  neuLaden: () => void;
};

export function useVertriebRep(): VertriebRep {
  const { user } = useAuth();
  const repsQ = useVoiceReps();
  const [wahl, setWahl] = useState<string | null>(gemerkt);

  const waehle = useCallback((repId: string | null) => {
    setWahl(repId);
    try {
      if (repId) window.localStorage.setItem(SPEICHER, repId);
      else window.localStorage.removeItem(SPEICHER);
    } catch { /* privater Modus: dann eben nur fuer diese Sitzung */ }
  }, []);

  const wahlErgebnis = useMemo(
    () => meinRep(repsQ.data?.reps ?? null, user?.email ?? null, wahl),
    [repsQ.data, user?.email, wahl],
  );

  return {
    ...wahlErgebnis,
    laedt: repsQ.isLoading,
    fehler: repsQ.isError,
    waehle,
    neuLaden: () => { void repsQ.refetch(); },
  };
}
