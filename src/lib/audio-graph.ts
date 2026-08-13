// -----------------------------------------------------------------------------
// audio-graph.ts — der Zwei-Kanal-PCM-Strom zu Deepgram.
//
// 🔴 BYTE-GENAU aus dem Co-Pilot-Master v1.30 uebernommen. Das ist keine
// Stilfrage. Die Geschichte dieser dreissig Zeilen:
//
//   v1.12-audio  Zwei Kanaele: Mikrofon auf 0, Twilio-Gegenstelle auf 1.
//                Erst damit trennt Deepgram die Sprecher, und erst damit kann
//                die Einwand-Erkennung auf den KUNDEN hoeren statt auf uns.
//   v1.28-audio  🔴 Der ScriptProcessor braucht ein Ziel, sonst feuert
//                `onaudioprocess` nicht. Vorher ging er direkt auf
//                `destination` — damit lief das Mikrofon (und bei Stereo der
//                Kundenton) auf die Lautsprecher, zurueck ins Mikrofon, und
//                der Kunde hoerte sich selbst. Die STUMME SENKE mit gain 0
//                ist die Loesung. Wer sie "aufraeumt", baut den Fehler neu.
//
// Testbar gehalten ist der Teil, in dem ein stiller Fehler teuer waere: die
// Umrechnung nach Int16 und die Deepgram-Parameter. Beides laesst sich ohne
// Mikrofon und ohne Browser durchspielen.
// -----------------------------------------------------------------------------

/**
 * Float32 nach Int16, bei Stereo verschraenkt (L,R,L,R…).
 *
 * 🔴 Die Asymmetrie `s < 0 ? s * 0x8000 : s * 0x7FFF` ist Absicht und steht so
 * im Master: Int16 reicht von -32768 bis +32767. Wer beide Seiten mit 0x8000
 * multipliziert, laesst positive Vollaussteuerung ueberlaufen und bekommt
 * Knacken; wer beide mit 0x7FFF nimmt, verschenkt einen Digit nach unten.
 */
export function nachInt16(kanal0: Float32Array, kanal1?: Float32Array | null): Int16Array {
  const n = kanal0.length;
  if (kanal1) {
    const out = new Int16Array(n * 2);
    for (let i = 0, j = 0; i < n; i++) {
      const s0 = Math.max(-1, Math.min(1, kanal0[i]));
      out[j++] = s0 < 0 ? s0 * 0x8000 : s0 * 0x7fff;
      const s1 = Math.max(-1, Math.min(1, kanal1[i]));
      out[j++] = s1 < 0 ? s1 * 0x8000 : s1 * 0x7fff;
    }
    return out;
  }
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, kanal0[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Die Deepgram-Adresse, Parameter fuer Parameter wie im Master.
 *
 * 🔴 `multichannel=true` NUR bei Stereo. Ohne den Schalter wirft Deepgram
 * beide Kanaele zusammen, `channel_index` bleibt 0, und die Einwand-Erkennung
 * hoert dann auf die eigene Stimme mit — das war E4.
 */
/**
 * 🔴 Der EUROPAEISCHE Deepgram-Endpunkt. Der Master spricht ausschliesslich
 * `api.eu.deepgram.com`, und das ist keine Geschmacksfrage: der Gespraechston
 * eines Kunden ist ein personenbezogenes Datum. Der US-Host wuerde ihn
 * klaglos annehmen und die ganze Frankfurt-Erzaehlung entwerten.
 */
export const DG_BASIS = "wss://api.eu.deepgram.com/v1/listen";

export function dgUrl(opts: {
  sampleRate: number;
  stereo: boolean;
  keyterms?: string[] | null;
  basis?: string;
}): string {
  const p = new URLSearchParams({
    encoding: "linear16",
    sample_rate: String(opts.sampleRate),
    channels: opts.stereo ? "2" : "1",
    language: "de",
    model: "nova-3",
    smart_format: "true",
    interim_results: "true",
    endpointing: "300",
    utterance_end_ms: "1000",
    punctuate: "true",
  });
  if (opts.stereo) p.set("multichannel", "true");
  // Keyterm-Prompting (nova-3 DE): Fachbegriffe des Pakets anheben. Mehrfach
  // derselbe Schluessel, genau wie im Master.
  for (const k of opts.keyterms ?? []) {
    const t = String(k ?? "").trim();
    if (t) p.append("keyterm", t);
  }
  return `${opts.basis ?? DG_BASIS}?${p.toString()}`;
}

// ── Der Graph selbst ─────────────────────────────────────────────────────────

export type GraphTeile = {
  procNode: ScriptProcessorNode | null;
  mergerNode: ChannelMergerNode | null;
  remoteSrcNode: MediaStreamAudioSourceNode | null;
  stilleSenke: GainNode | null;
  stereo: boolean;
};

export const LEERER_GRAPH: GraphTeile = {
  procNode: null, mergerNode: null, remoteSrcNode: null, stilleSenke: null, stereo: false,
};

/**
 * Mikrofon auf Kanal 0, Twilio-Gegenstelle auf Kanal 1.
 *
 * Gibt `stereo: false` zurueck, wenn es keine Gegenstelle gibt — dann laeuft
 * alles mono weiter. Das ist ein legitimer Zustand (der Master sagt dann
 * "MONO, kein Kunden-Kanal") und kein Fehler.
 */
export function baueStereo(
  ctx: AudioContext,
  srcNode: AudioNode,
  remoteStream: MediaStream | null,
): { mergerNode: ChannelMergerNode | null; remoteSrcNode: MediaStreamAudioSourceNode | null; stereo: boolean } {
  if (!remoteStream?.getAudioTracks?.().length) {
    return { mergerNode: null, remoteSrcNode: null, stereo: false };
  }
  try {
    const remoteSrcNode = ctx.createMediaStreamSource(remoteStream);
    const mergerNode = ctx.createChannelMerger(2);
    srcNode.connect(mergerNode, 0, 0); // Kanal 0 = Mikrofon
    remoteSrcNode.connect(mergerNode, 0, 1); // Kanal 1 = Kunde
    return { mergerNode, remoteSrcNode, stereo: true };
  } catch {
    return { mergerNode: null, remoteSrcNode: null, stereo: false };
  }
}

/**
 * Den PCM-Strom aufsetzen und senden.
 *
 * 🔴 Die stumme Senke am Ende ist der v1.28-Fix. Sie MUSS bleiben.
 */
export function startePcm(
  ctx: AudioContext,
  srcNode: AudioNode,
  mergerNode: ChannelMergerNode | null,
  stereo: boolean,
  sende: (buf: ArrayBuffer) => void,
  offen: () => boolean,
): { procNode: ScriptProcessorNode; stilleSenke: GainNode } {
  const BUF = 2048; // v1.12-audio: kleinerer Puffer = weniger Verzoegerung
  const kanaele = stereo ? 2 : 1;
  const procNode = ctx.createScriptProcessor(BUF, kanaele, kanaele);
  procNode.onaudioprocess = (e) => {
    if (!offen()) return;
    const c0 = e.inputBuffer.getChannelData(0);
    const c1 = stereo
      ? (e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : c0)
      : null;
    sende(nachInt16(c0, c1).buffer);
  };
  (stereo && mergerNode ? mergerNode : srcNode).connect(procNode);

  // 🔴 v1.28-audio. NICHT entfernen: ohne Ziel feuert onaudioprocess nicht,
  // mit hoerbarem Ziel hoert der Kunde sich selbst.
  const stilleSenke = ctx.createGain();
  stilleSenke.gain.value = 0;
  procNode.connect(stilleSenke);
  stilleSenke.connect(ctx.destination);

  return { procNode, stilleSenke };
}

/** Alles wieder abbauen. Kein Doppel-Connect, kein Leck. */
export function baueAb(t: GraphTeile): GraphTeile {
  for (const n of [t.procNode, t.stilleSenke, t.mergerNode, t.remoteSrcNode]) {
    try { n?.disconnect(); } catch { /* schon getrennt */ }
  }
  if (t.procNode) t.procNode.onaudioprocess = null;
  return LEERER_GRAPH;
}

/**
 * Das WebSocket-Unterprotokoll fuer Deepgram.
 *
 * 🔴 Der Schluessel wandert NICHT in die Adresse. Adressen landen in
 * Server-Logs, in Browser-Verlaeufen und in Fehlerberichten; das
 * Unterprotokoll nicht. Der Master macht es genauso (`['bearer', jwt]`).
 *
 * Der Konsolen-Weg kennt nur den kurzlebigen Zuschuss aus dem Bedrock-Proxy
 * (fuenf Minuten). Einen festen Deepgram-Key gibt es hier bewusst nicht — er
 * laege sonst im Browser-Bundle.
 */
export function dgProtokoll(zugriffsToken: string | null | undefined): string[] | null {
  const t = String(zugriffsToken ?? "").trim();
  return t ? ["bearer", t] : null;
}
