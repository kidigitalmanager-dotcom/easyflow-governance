// -----------------------------------------------------------------------------
// use-transkript.ts — Baustein 4: das mitlaufende Transkript.
//
// Der Aufbau in genau dieser Reihenfolge, und die Reihenfolge ist der Punkt:
//
//   1. Auf die Gegenstelle warten (v1.12/v1.17: bis zu 4 s, alle 200 ms).
//      Wer nicht wartet, baut den Graph auf einen Anruf, der den Kundenkanal
//      noch nicht hat — und bekommt MONO. Dann steht zwar ein Transkript da,
//      aber alles klingt nach dem Vertriebler.
//   2. Den Zwei-Kanal-Graph bauen (`baueStereo`).
//   3. ERST DANN die Deepgram-Adresse bilden. `channels` muss zum Graph
//      passen; umgekehrt deutet Deepgram die Bytes im falschen Raster.
//   4. Verbinden, und im `onopen` den PCM-Strom starten.
//
// 🔴 Die Umrechnung, die Adresse und der Graph liegen in `audio-graph.ts`,
// die Deutung der Nachrichten in `dg-transkript.ts`. Beides ist ohne Browser
// geprueft. Hier steht nur, WANN was passiert.
// -----------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from "react";
import { holeDgToken } from "@/lib/api-client";
import {
  dgUrl, dgProtokoll, baueStereo, startePcm, baueAb, LEERER_GRAPH, type GraphTeile,
} from "@/lib/audio-graph";
import {
  deute, fensterFort, verlaufFort, type Zeile,
} from "@/lib/dg-transkript";

/** v1.17: 20 x 200 ms. Vorher 1,5 s — das gab zu viele MONO-Starts. */
const WARTE_VERSUCHE = 20;
const WARTE_MS = 200;
/** Der Master versucht es nach einem unsauberen Abriss erneut. */
const NEUVERSUCH_MS = 2000;

export type Transkript = {
  /** Der sichtbare Verlauf, aeltestes zuerst. */
  verlauf: Zeile[];
  /** Der noch nicht finale Satz, je Sprecher. */
  zwischenstand: { kunde: string; rep: string };
  /** 🔴 Das Klassifikations-Fenster: die letzten zwei Kunden-Aeusserungen. */
  fenster: string[];
  laeuft: boolean;
  /** true = zwei Kanaele. false = mono, der Kunde ist nicht getrennt zu hoeren. */
  stereo: boolean;
  /** Klartext, wenn etwas nicht geht. 🔴 Wird angezeigt, nie verschluckt. */
  fehler: string | null;
};

const LEER: Transkript = {
  verlauf: [], zwischenstand: { kunde: "", rep: "" }, fenster: [],
  laeuft: false, stereo: false, fehler: null,
};

export function useTranskript(
  clientId: string | null,
  imGespraech: boolean,
  gegenstelle: () => MediaStream | null,
  keyterms?: string[] | null,
): Transkript {
  const [t, setT] = useState<Transkript>(LEER);

  const ctxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const srcRef = useRef<AudioNode | null>(null);
  const graphRef = useRef<GraphTeile>(LEERER_GRAPH);
  const wsRef = useRef<WebSocket | null>(null);
  const neuRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lauf = useRef(0);

  // Die Sammler liegen in Refs, nicht im Zustand: Deepgram schickt mehrere
  // Nachrichten pro Sekunde, und jede davon durch den React-Zustand zu ziehen
  // waere teuer. Der Zustand wird pro Nachricht einmal gesetzt.
  const verlaufRef = useRef<Zeile[]>([]);
  const fensterRef = useRef<string[]>([]);
  const gegenstelleRef = useRef(gegenstelle);
  gegenstelleRef.current = gegenstelle;
  const keytermsRef = useRef(keyterms);
  keytermsRef.current = keyterms;

  const abbauen = useCallback(() => {
    if (neuRef.current) { clearTimeout(neuRef.current); neuRef.current = null; }
    graphRef.current = baueAb(graphRef.current);
    try { wsRef.current?.close(1000, "Ende"); } catch { /* schon zu */ }
    wsRef.current = null;
    try { srcRef.current?.disconnect(); } catch { /* schon getrennt */ }
    srcRef.current = null;
    micRef.current?.getTracks().forEach((s) => { try { s.stop(); } catch { /* egal */ } });
    micRef.current = null;
    const c = ctxRef.current; ctxRef.current = null;
    if (c && c.state !== "closed") { void c.close().catch(() => { /* egal */ }); }
  }, []);

  useEffect(() => {
    lauf.current += 1;
    const meins = lauf.current;
    const aktuell = () => lauf.current === meins;

    if (!imGespraech || !clientId) {
      abbauen();
      verlaufRef.current = []; fensterRef.current = [];
      setT(LEER);
      return;
    }

    const warteAufGegenstelle = async (): Promise<MediaStream | null> => {
      for (let i = 0; i < WARTE_VERSUCHE; i++) {
        const rs = gegenstelleRef.current();
        if (rs?.getAudioTracks?.().length) return rs;
        await new Promise((r) => setTimeout(r, WARTE_MS));
        if (!aktuell()) return null;
      }
      return gegenstelleRef.current();
    };

    const verbinde = async () => {
      if (!aktuell()) return;
      try {
        const zugang = await holeDgToken(clientId);
        if (!aktuell()) return;
        const proto = dgProtokoll(zugang?.access_token);
        if (!proto) throw new Error("Kein Deepgram-Zugang erhalten.");

        // 1. Warten. 2. Mikrofon. 3. Graph. 4. Adresse.
        const remote = await warteAufGegenstelle();
        if (!aktuell()) return;

        if (!ctxRef.current || ctxRef.current.state === "closed") {
          const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          ctxRef.current = new Ctx();
        }
        const ctx = ctxRef.current;
        if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* Browser mag nicht */ } }

        if (!micRef.current) {
          micRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (!aktuell()) { micRef.current.getTracks().forEach((s) => s.stop()); micRef.current = null; return; }
        }
        srcRef.current = ctx.createMediaStreamSource(micRef.current);

        const st = baueStereo(ctx, srcRef.current, remote);
        graphRef.current = { ...LEERER_GRAPH, mergerNode: st.mergerNode, remoteSrcNode: st.remoteSrcNode, stereo: st.stereo };
        const stereo = st.stereo;

        const url = dgUrl({ sampleRate: ctx.sampleRate, stereo, keyterms: keytermsRef.current });
        const ws = new WebSocket(url, proto);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
          if (!aktuell()) { try { ws.close(1000); } catch { /* egal */ } return; }
          const teile = startePcm(
            ctx, srcRef.current!, st.mergerNode, stereo,
            (buf) => { try { ws.send(buf); } catch { /* Leitung weg */ } },
            () => ws.readyState === WebSocket.OPEN,
          );
          graphRef.current = { ...graphRef.current, procNode: teile.procNode, stilleSenke: teile.stilleSenke };
          setT((v) => ({ ...v, laeuft: true, stereo, fehler: null }));
        };

        ws.onmessage = (ev: MessageEvent) => {
          if (!aktuell()) return;
          let roh: unknown;
          try { roh = JSON.parse(String(ev.data)); } catch { return; }
          const r = deute(roh, stereo);
          if (r.art === "nichts") return;

          if (r.art === "zwischenstand") {
            const wo = r.zeile.sprecher === "kunde" ? "kunde" : "rep";
            setT((v) => ({ ...v, zwischenstand: { ...v.zwischenstand, [wo]: r.zeile.text } }));
            return;
          }
          // final
          verlaufRef.current = verlaufFort(verlaufRef.current, r.zeile);
          fensterRef.current = fensterFort(fensterRef.current, r.zeile, stereo);
          const wo = r.zeile.sprecher === "kunde" ? "kunde" : "rep";
          setT((v) => ({
            ...v,
            verlauf: verlaufRef.current,
            fenster: fensterRef.current,
            zwischenstand: { ...v.zwischenstand, [wo]: "" },
          }));
        };

        ws.onerror = () => {
          if (aktuell()) setT((v) => ({ ...v, fehler: "Die Transkript-Verbindung meldet einen Fehler." }));
        };

        ws.onclose = (e: CloseEvent) => {
          if (!aktuell()) return;
          setT((v) => ({ ...v, laeuft: false }));
          // 🔴 1000 heisst "wir haben selbst zugemacht". Alles andere ist ein
          // Abriss, und der Master versucht es genau dann erneut.
          if (e.code !== 1000) {
            graphRef.current = baueAb(graphRef.current);
            neuRef.current = setTimeout(() => { if (aktuell()) void verbinde(); }, NEUVERSUCH_MS);
          }
        };
      } catch (e) {
        if (!aktuell()) return;
        const m = e instanceof Error ? e.message : String(e);
        setT((v) => ({ ...v, laeuft: false, fehler: `Transkript nicht moeglich: ${m}` }));
      }
    };

    verlaufRef.current = []; fensterRef.current = [];
    setT({ ...LEER });
    void verbinde();

    return () => { abbauen(); };
  }, [clientId, imGespraech, abbauen]);

  return t;
}
