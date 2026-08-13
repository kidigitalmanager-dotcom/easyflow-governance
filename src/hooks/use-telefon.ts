// -----------------------------------------------------------------------------
// use-telefon.ts — Baustein 3: waehlen, hoeren, auflegen.
//
// Dieser Hook ist die duenne Naht zwischen zwei Dingen, die beide schon fertig
// sind: dem Twilio-SDK auf der einen Seite und `anruf-zustand.ts` auf der
// anderen. Er entscheidet selbst nichts. Jede Regel — darf gewaehlt werden,
// wer hat aufgelegt, laeuft schon ein Gespraech — steht drueben und ist dort
// mit eingefrorener Zeit geprueft.
//
// 🔴 Uebernommen aus dem Co-Pilot-Master v1.30, Abschnitt `initDevice` /
// `callLead`. Was dort mit einer Versionsnummer kommentiert ist, ist hier
// mitsamt Kommentar gelandet. Diese Zeilen sind nicht schoen, sie sind teuer
// bezahlt:
//
//   v1.8   Ein hoerbarer Rueckruf, solange es klingelt.
//   v1.11  Selbstheilung bei 20104 (AccessTokenExpired). Ohne sie ist das
//          Geraet nach dem Zuklappen des Laptops tot und JEDER Anruf
//          scheitert mit "connect failed" — bis jemand die Seite neu laedt.
//   v1.12  Auf die Gegenstelle warten, bevor der Zwei-Kanal-Graph steht.
//
// Was hier NICHT passiert: Minuten pruefen, Anrufe protokollieren, Leads
// zuordnen. Das gehoert in die Flaeche, nicht in die Leitung.
// -----------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from "react";
import { Device, type Call } from "@twilio/voice-sdk";
import { holeVoiceToken } from "@/lib/api-client";
import {
  AUS, geraetStartet, geraetBereit, waehlen as waehlenRegel, verbunden,
  auflegen as auflegenRegel, beendet, gescheitert, fehlerQuittiert,
  type AnrufZustand,
} from "@/lib/anruf-zustand";

/** v1.11: nach einer Selbstheilung dreissig Sekunden Ruhe, sonst dreht es sich. */
const HEIL_ABSTAND_MS = 30_000;
/** Twilio meldet den abgelaufenen Zugang unter dieser Nummer. */
const TOKEN_ABGELAUFEN = 20104;

export type Telefon = {
  zustand: AnrufZustand;
  waehle: (rohNummer: string, kontext?: { leadId?: string | null; leadName?: string | null }) => void;
  auflegen: () => void;
  quittieren: () => void;
  /** Der Ton der Gegenstelle. Nur waehrend eines Gespraechs, sonst null. */
  gegenstelle: () => MediaStream | null;
  /** Stummschaltung des eigenen Mikrofons. */
  stumm: boolean;
  stummSchalten: (an: boolean) => void;
};

export function useTelefon(clientId: string | null): Telefon {
  const [zustand, setZustand] = useState<AnrufZustand>(AUS);
  const [stumm, setStumm] = useState(false);

  const geraet = useRef<Device | null>(null);
  const anruf = useRef<Call | null>(null);
  const auffrischer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const letzteHeilung = useRef(0);
  /**
   * 🔴 Der Generationszaehler. React startet Effekte im Entwicklungsmodus
   * doppelt, und ein Token-Abruf laeuft eine knappe Sekunde. Ohne diesen
   * Zaehler meldet sich ein Geraet an, das schon abgeraeumt wurde — und das
   * NEUE wird von der Antwort des alten ueberschrieben. Zwei Geraete auf
   * derselben Identitaet heisst: der Anruf klingelt, aber nirgends.
   */
  const lauf = useRef(0);

  useEffect(() => {
    lauf.current += 1;
    const meins = lauf.current;
    const aktuell = () => lauf.current === meins;

    if (!clientId) { setZustand(AUS); return; }

    let abgeraeumt = false;

    const anmelden = async () => {
      if (!aktuell() || abgeraeumt) return;
      setZustand(geraetStartet);
      try {
        const t = await holeVoiceToken(clientId);
        if (!aktuell() || abgeraeumt) return;
        if (!t?.ok || !t.token) throw new Error("Kein Zugang fuer das Telefon erhalten.");

        const d = new Device(t.token, {
          codecPreferences: ["opus", "pcmu"] as never,
          edge: "frankfurt",
          logLevel: "warn",
        });

        d.on("registered", () => { if (aktuell()) setZustand(geraetBereit); });

        d.on("error", (e: { code?: number; message?: string; twilioError?: { code?: number } }) => {
          console.error("[ue-telefon] Geraetefehler", e);
          const code = e?.code ?? e?.twilioError?.code;
          // v1.11 Selbstheilung: der zwischengespeicherte Zugang ist alt
          // (Laptop hat geschlafen). Einmal wegwerfen und neu anmelden, statt
          // das Geraet tot liegen zu lassen.
          if (code === TOKEN_ABGELAUFEN && !anruf.current && Date.now() - letzteHeilung.current > HEIL_ABSTAND_MS) {
            letzteHeilung.current = Date.now();
            console.warn("[ue-telefon] Zugang abgelaufen, Geraet meldet sich neu an");
            try { geraet.current?.destroy(); } catch { /* schon weg */ }
            geraet.current = null;
            void anmelden();
            return;
          }
          // 🔴 Alles andere wird BENANNT. "Laedt nicht" ohne Grund war E5.
          if (aktuell()) setZustand((z) => gescheitert(z, e?.message || `Telefon-Fehler ${code ?? ""}`.trim()));
        });

        d.on("tokenWillExpire", async () => {
          try {
            const r = await holeVoiceToken(clientId);
            if (r?.token) d.updateToken(r.token);
          } catch (err) {
            console.error("[ue-telefon] Zugang liess sich nicht erneuern", err);
          }
        });

        geraet.current = d;
        await d.register();
        if (!aktuell() || abgeraeumt) { try { d.destroy(); } catch { /* egal */ } return; }

        // Guertel und Hosentraeger: Twilio meldet `tokenWillExpire` etwa fuenf
        // Minuten vorher, aber ein schlafender Rechner verpasst auch das.
        if (auffrischer.current) clearTimeout(auffrischer.current);
        auffrischer.current = setTimeout(() => { void anmelden(); },
          Math.max(60_000, ((t.expires_in || 3600) - 120) * 1000));
      } catch (e) {
        if (!aktuell()) return;
        const m = e instanceof Error ? e.message : String(e);
        setZustand((z) => gescheitert(z, `Das Telefon konnte nicht angemeldet werden: ${m}`));
      }
    };

    void anmelden();

    return () => {
      abgeraeumt = true;
      if (auffrischer.current) { clearTimeout(auffrischer.current); auffrischer.current = null; }
      try { anruf.current?.disconnect(); } catch { /* war schon weg */ }
      anruf.current = null;
      try { geraet.current?.destroy(); } catch { /* war schon weg */ }
      geraet.current = null;
    };
  }, [clientId]);

  const waehle = useCallback((rohNummer: string, kontext?: { leadId?: string | null; leadName?: string | null }) => {
    // 🔴 Erst die Regel, dann Twilio. Sagt die Regel nein, wird gar nicht
    // erst verbunden — und der Grund steht als Satz da.
    setZustand((z) => {
      const r = waehlenRegel(z, rohNummer);
      if ("grund" in r) return gescheitert(z, r.grund);

      const d = geraet.current;
      if (!d) return gescheitert(z, "Das Telefon ist noch nicht angemeldet.");

      void (async () => {
        try {
          // Mikrofon vorwaermen. Ohne das faellt die Freigabe mitten in den
          // Verbindungsaufbau und der Anruf scheitert wortlos.
          try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            s.getTracks().forEach((t) => t.stop());
          } catch {
            setZustand((zz) => gescheitert(zz, "Das Mikrofon ist nicht freigegeben. Bitte im Browser erlauben."));
            return;
          }

          const c = await d.connect({
            params: {
              To: r.nummer,
              leadId: kontext?.leadId ? String(kontext.leadId) : "",
              leadName: kontext?.leadName || "",
            },
          });
          anruf.current = c;
          setStumm(false);

          c.on("accept", () => { setZustand((zz) => verbunden(zz, Date.now())); });
          c.on("disconnect", () => { anruf.current = null; setStumm(false); setZustand((zz) => beendet(zz, "gegenseite")); });
          c.on("cancel", () => { anruf.current = null; setZustand((zz) => beendet(zz, "gegenseite")); });
          c.on("reject", () => { anruf.current = null; setZustand((zz) => gescheitert(zz, "Der Anruf wurde abgelehnt.")); });
          c.on("error", (e: { message?: string }) => {
            console.error("[ue-telefon] Gespraechsfehler", e);
            anruf.current = null;
            setZustand((zz) => gescheitert(zz, e?.message || "Die Verbindung ist abgebrochen."));
          });
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          setZustand((zz) => gescheitert(zz, `Verbindung nicht moeglich: ${m}`));
        }
      })();

      return r.zustand;
    });
  }, []);

  const auflegen = useCallback(() => {
    // 🔴 Der Zustand wird ZUERST gesetzt. Kommt Twilios disconnect danach,
    // steht dort "legt_auf" — und `beendet` weiss, dass wir es selbst waren.
    setZustand(auflegenRegel);
    try { anruf.current?.disconnect(); } catch { /* schon getrennt */ }
    // Kommt gar kein Ereignis mehr (Leitung schon tot), darf der Knopf nicht
    // haengen bleiben. Das ist ein Timer auf dem GERAET, nicht auf Inhalt.
    setTimeout(() => { setZustand((z) => (z.phase === "legt_auf" ? beendet(z, "aufgelegt") : z)); }, 4000);
  }, []);

  const quittieren = useCallback(() => { setZustand(fehlerQuittiert); }, []);

  const gegenstelle = useCallback((): MediaStream | null => {
    try { return anruf.current?.getRemoteStream?.() ?? null; } catch { return null; }
  }, []);

  const stummSchalten = useCallback((an: boolean) => {
    try { anruf.current?.mute(an); setStumm(an); } catch { /* kein Anruf */ }
  }, []);

  return { zustand, waehle, auflegen, quittieren, gegenstelle, stumm, stummSchalten };
}
