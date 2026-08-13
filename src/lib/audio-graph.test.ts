import { describe, it, expect, vi } from "vitest";
import {
  nachInt16, dgUrl, baueStereo, startePcm, baueAb, LEERER_GRAPH, DG_BASIS, dgProtokoll,
  type GraphTeile,
} from "./audio-graph";

// ── Eine Attrappe der Web-Audio-API ─────────────────────────────────────────
// Kein jsdom, kein Mikrofon. Es geht um die VERDRAHTUNG, und die laesst sich
// mitschreiben: wer haengt an wem, mit welchem Kanal.

type Kante = { von: string; nach: string; ausgang?: number; eingang?: number };

function attrappe() {
  const kanten: Kante[] = [];
  const getrennt: string[] = [];
  const mk = (name: string, extra: Record<string, unknown> = {}) => {
    const n = {
      name,
      connect: (ziel: { name: string }, ausgang?: number, eingang?: number) => {
        kanten.push({ von: name, nach: ziel.name, ausgang, eingang });
      },
      disconnect: () => { getrennt.push(name); },
      ...extra,
    };
    return n as typeof n & Record<string, unknown>;
  };

  const destination = mk("destination");
  let gainZaehler = 0;
  const ctx = {
    destination,
    createMediaStreamSource: (_s: unknown) => mk("remoteSrc"),
    createChannelMerger: (_n: number) => mk("merger"),
    createScriptProcessor: (buf: number, ein: number, aus: number) =>
      mk("proc", { bufferSize: buf, kanaeleEin: ein, kanaeleAus: aus, onaudioprocess: null }),
    createGain: () => mk(`gain${++gainZaehler}`, { gain: { value: 1 } }),
  };
  return { ctx: ctx as unknown as AudioContext, roh: ctx, kanten, getrennt, mk };
}

const stream = (spuren = 1) =>
  ({ getAudioTracks: () => Array.from({ length: spuren }, (_, i) => ({ id: `t${i}` })) }) as unknown as MediaStream;

const puffer = (werte: number[]) => Float32Array.from(werte);

describe("nachInt16 — die Umrechnung, bei der ein stiller Fehler knackt", () => {
  it("mono behaelt die Laenge", () => {
    expect(nachInt16(puffer([0, 0.5, -0.5])).length).toBe(3);
    expect(nachInt16(puffer([0, 0.5]), null).length).toBe(2);
    expect(nachInt16(puffer([0, 0.5]), undefined).length).toBe(2);
  });

  it("🔴 stereo wird verschraenkt: L,R,L,R — nicht hintereinander gehaengt", () => {
    // Wer die Kanaele aneinanderhaengt statt zu verschraenken, bekommt von
    // Deepgram trotzdem eine Antwort: erst der halbe Vertriebler, dann der
    // halbe Kunde, beide mit falschem Zeitstempel.
    const l = puffer([1, 0, 1]);
    const r = puffer([-1, 0, -1]);
    const out = nachInt16(l, r);
    expect(out.length).toBe(6);
    expect(Array.from(out)).toEqual([32767, -32768, 0, 0, 32767, -32768]);
  });

  it("🔴 die Asymmetrie ist Absicht: -1 -> -32768, +1 -> +32767", () => {
    // Beide Seiten mit 0x8000 laesst +1 ueberlaufen (32768 passt nicht in
    // Int16 und kippt auf -32768) — das knackt hoerbar bei Vollaussteuerung.
    const out = nachInt16(puffer([1, -1]));
    expect(out[0]).toBe(32767);
    expect(out[1]).toBe(-32768);
    expect(out[0]).toBeGreaterThan(0);
  });

  it("Werte jenseits von ±1 werden gekappt statt zu ueberlaufen", () => {
    const out = nachInt16(puffer([4, -4, 1.0001, -1.0001]));
    expect(Array.from(out)).toEqual([32767, -32768, 32767, -32768]);
  });

  it("Stille bleibt Stille", () => {
    expect(Array.from(nachInt16(puffer([0, 0, 0])))).toEqual([0, 0, 0]);
  });

  it("ein leerer Puffer liefert einen leeren Puffer, keinen Fehler", () => {
    expect(nachInt16(puffer([])).length).toBe(0);
    expect(nachInt16(puffer([]), puffer([])).length).toBe(0);
  });
});

describe("dgUrl — die Parameter, an denen die Sprechertrennung haengt", () => {
  const p = (u: string) => new URL(u.replace(/^wss:/, "https:")).searchParams;

  it("🔴 multichannel=true NUR bei Stereo", () => {
    // Ohne den Schalter wirft Deepgram beide Kanaele zusammen, channel_index
    // bleibt 0 — und die Einwand-Erkennung hoert die eigene Stimme mit. E4.
    expect(p(dgUrl({ sampleRate: 48000, stereo: true })).get("multichannel")).toBe("true");
    expect(p(dgUrl({ sampleRate: 48000, stereo: false })).get("multichannel")).toBeNull();
  });

  it("channels folgt dem Stereo-Zustand", () => {
    expect(p(dgUrl({ sampleRate: 48000, stereo: true })).get("channels")).toBe("2");
    expect(p(dgUrl({ sampleRate: 48000, stereo: false })).get("channels")).toBe("1");
  });

  it("die feste Grundausstattung steht drin", () => {
    const s = p(dgUrl({ sampleRate: 44100, stereo: false }));
    expect(s.get("encoding")).toBe("linear16");
    expect(s.get("sample_rate")).toBe("44100");
    expect(s.get("language")).toBe("de");
    expect(s.get("model")).toBe("nova-3");
    expect(s.get("smart_format")).toBe("true");
    expect(s.get("interim_results")).toBe("true");
    expect(s.get("endpointing")).toBe("300");
    expect(s.get("utterance_end_ms")).toBe("1000");
    expect(s.get("punctuate")).toBe("true");
  });

  it("die Abtastrate wird uebernommen, nicht angenommen", () => {
    // Der Browser gibt 48000 oder 44100 vor. Eine feste Zahl hier heisst:
    // Deepgram deutet die Bytes im falschen Takt und liefert Kauderwelsch.
    expect(p(dgUrl({ sampleRate: 16000, stereo: true })).get("sample_rate")).toBe("16000");
  });

  it("Keyterms werden mehrfach angehaengt, nicht zusammengefasst", () => {
    const s = p(dgUrl({ sampleRate: 48000, stereo: true, keyterms: ["UseEasy", "Bedrock"] }));
    expect(s.getAll("keyterm")).toEqual(["UseEasy", "Bedrock"]);
  });

  it("leere Keyterms fallen weg statt als Leerstring zu landen", () => {
    const s = p(dgUrl({ sampleRate: 48000, stereo: true, keyterms: ["", "  ", "Ok"] }));
    expect(s.getAll("keyterm")).toEqual(["Ok"]);
    expect(p(dgUrl({ sampleRate: 48000, stereo: true })).getAll("keyterm")).toEqual([]);
    expect(p(dgUrl({ sampleRate: 48000, stereo: true, keyterms: null })).getAll("keyterm")).toEqual([]);
  });

  it("🔴 die Adresse zeigt auf den EUROPAEISCHEN Deepgram-Endpunkt", () => {
    // api.deepgram.com (US) nimmt dieselben Bytes klaglos an. Der Unterschied
    // ist nicht zu hoeren, nur zu verantworten: es geht um die Stimme eines
    // Kunden. Der Master spricht ausschliesslich api.eu.deepgram.com.
    expect(DG_BASIS).toBe("wss://api.eu.deepgram.com/v1/listen");
    expect(dgUrl({ sampleRate: 48000, stereo: true })).toMatch(/^wss:\/\/api\.eu\.deepgram\.com\/v1\/listen\?/);
    expect(dgUrl({ sampleRate: 48000, stereo: true })).not.toMatch(/^wss:\/\/api\.deepgram\.com/);
    expect(dgUrl({ sampleRate: 48000, stereo: true, basis: "wss://x.test/l" })).toMatch(/^wss:\/\/x\.test\/l\?/);
  });

  it("🔴 der Zugang steht im Unterprotokoll, nicht in der Adresse", () => {
    // Adressen landen in Logs und Fehlerberichten. Ein Token in der Adresse
    // ist ein Token, das man nicht mehr zurueckholt.
    expect(dgProtokoll("abc")).toEqual(["bearer", "abc"]);
    expect(dgUrl({ sampleRate: 48000, stereo: true })).not.toContain("token");
    for (const leer of [null, undefined, "", "   "]) expect(dgProtokoll(leer)).toBeNull();
  });
});

describe("baueStereo — Mikrofon auf 0, Kunde auf 1", () => {
  it("🔴 die Kanalzuordnung ist die Grundlage der Sprechertrennung", () => {
    // Vertauscht heisst: jeder Einwand wird dem Vertriebler zugeschrieben und
    // die Erkennung feuert auf die eigenen Saetze.
    const a = attrappe();
    const src = a.mk("mic");
    const r = baueStereo(a.ctx, src as unknown as AudioNode, stream());
    expect(r.stereo).toBe(true);
    expect(a.kanten).toContainEqual({ von: "mic", nach: "merger", ausgang: 0, eingang: 0 });
    expect(a.kanten).toContainEqual({ von: "remoteSrc", nach: "merger", ausgang: 0, eingang: 1 });
  });

  it("ohne Gegenstelle laeuft es mono weiter — das ist kein Fehler", () => {
    const a = attrappe();
    const src = a.mk("mic");
    for (const s of [null, stream(0)]) {
      const r = baueStereo(a.ctx, src as unknown as AudioNode, s);
      expect(r.stereo).toBe(false);
      expect(r.mergerNode).toBeNull();
      expect(r.remoteSrcNode).toBeNull();
    }
    expect(a.kanten).toHaveLength(0);
  });

  it("ein Stream ohne getAudioTracks wirft nicht", () => {
    const a = attrappe();
    const r = baueStereo(a.ctx, a.mk("mic") as unknown as AudioNode, {} as MediaStream);
    expect(r.stereo).toBe(false);
  });

  it("🔴 scheitert der Aufbau, faellt es auf mono zurueck statt das Gespraech zu kippen", () => {
    const a = attrappe();
    (a.roh as unknown as Record<string, unknown>).createChannelMerger = () => { throw new Error("kaputt"); };
    const r = baueStereo(a.ctx, a.mk("mic") as unknown as AudioNode, stream());
    expect(r.stereo).toBe(false);
    expect(r.mergerNode).toBeNull();
  });
});

describe("startePcm — der v1.28-Fix darf nicht wegoptimiert werden", () => {
  const auf = () => true;

  it("🔴 die STUMME SENKE steht zwischen Prozessor und Lautsprecher", () => {
    // Ohne Ziel feuert onaudioprocess nicht (kein Transkript). Mit hoerbarem
    // Ziel laeuft der Kundenton auf die Lautsprecher, zurueck ins Mikrofon,
    // und der Kunde hoert sich selbst. gain 0 ist beides zugleich.
    const a = attrappe();
    const src = a.mk("mic");
    const { stilleSenke } = startePcm(a.ctx, src as unknown as AudioNode, null, false, () => {}, auf);
    expect((stilleSenke as unknown as { gain: { value: number } }).gain.value).toBe(0);
    const zurSenke = a.kanten.find((k) => k.von === "proc");
    expect(zurSenke?.nach).toMatch(/^gain/);
    expect(a.kanten).toContainEqual({ von: zurSenke!.nach, nach: "destination", ausgang: undefined, eingang: undefined });
    // Und der Prozessor haengt NICHT direkt am Ausgang.
    expect(a.kanten).not.toContainEqual({ von: "proc", nach: "destination", ausgang: undefined, eingang: undefined });
  });

  it("bei Stereo haengt der Prozessor am Merger, bei Mono an der Quelle", () => {
    const a1 = attrappe();
    const merger = a1.mk("merger");
    startePcm(a1.ctx, a1.mk("mic") as unknown as AudioNode, merger as unknown as ChannelMergerNode, true, () => {}, auf);
    expect(a1.kanten).toContainEqual({ von: "merger", nach: "proc", ausgang: undefined, eingang: undefined });

    const a2 = attrappe();
    startePcm(a2.ctx, a2.mk("mic") as unknown as AudioNode, null, false, () => {}, auf);
    expect(a2.kanten).toContainEqual({ von: "mic", nach: "proc", ausgang: undefined, eingang: undefined });
  });

  it("🔴 stereo ohne Merger faellt auf die Quelle zurueck statt ins Leere zu greifen", () => {
    const a = attrappe();
    startePcm(a.ctx, a.mk("mic") as unknown as AudioNode, null, true, () => {}, auf);
    expect(a.kanten).toContainEqual({ von: "mic", nach: "proc", ausgang: undefined, eingang: undefined });
  });

  it("der Prozessor bekommt so viele Kanaele wie der Strom", () => {
    const a = attrappe();
    const { procNode } = startePcm(a.ctx, a.mk("mic") as unknown as AudioNode, a.mk("merger") as unknown as ChannelMergerNode, true, () => {}, auf);
    const p = procNode as unknown as Record<string, number>;
    expect(p.bufferSize).toBe(2048);
    expect(p.kanaeleEin).toBe(2);
    expect(p.kanaeleAus).toBe(2);
    const b = attrappe();
    const mono = startePcm(b.ctx, b.mk("mic") as unknown as AudioNode, null, false, () => {}, auf).procNode as unknown as Record<string, number>;
    expect(mono.kanaeleEin).toBe(1);
  });

  const ereignis = (kanaele: Float32Array[]) => ({
    inputBuffer: {
      numberOfChannels: kanaele.length,
      getChannelData: (i: number) => kanaele[i],
    },
  }) as unknown as AudioProcessingEvent;

  it("sendet die verschraenkten Bytes weiter", () => {
    const a = attrappe();
    const sende = vi.fn();
    const { procNode } = startePcm(a.ctx, a.mk("mic") as unknown as AudioNode, a.mk("merger") as unknown as ChannelMergerNode, true, sende, auf);
    procNode.onaudioprocess!(ereignis([puffer([1, 0]), puffer([-1, 0])]));
    expect(sende).toHaveBeenCalledTimes(1);
    expect(Array.from(new Int16Array(sende.mock.calls[0][0]))).toEqual([32767, -32768, 0, 0]);
  });

  it("🔴 ist die Leitung zu, wird nichts gesendet", () => {
    // Senden auf eine geschlossene WebSocket wirft, und der Wurf landet in
    // onaudioprocess — also mitten im Audio-Thread, wo ihn niemand sieht.
    const a = attrappe();
    const sende = vi.fn();
    const { procNode } = startePcm(a.ctx, a.mk("mic") as unknown as AudioNode, null, false, sende, () => false);
    procNode.onaudioprocess!(ereignis([puffer([1, 0])]));
    expect(sende).not.toHaveBeenCalled();
  });

  it("🔴 stereo angemeldet, aber nur ein Kanal da: der Mikrofonkanal wird verdoppelt", () => {
    // Nicht abstuerzen und nicht schweigen. Deepgram erwartet zwei Kanaele,
    // weil channels=2 in der Adresse steht.
    const a = attrappe();
    const sende = vi.fn();
    const { procNode } = startePcm(a.ctx, a.mk("mic") as unknown as AudioNode, a.mk("merger") as unknown as ChannelMergerNode, true, sende, auf);
    procNode.onaudioprocess!(ereignis([puffer([1, 0])]));
    expect(Array.from(new Int16Array(sende.mock.calls[0][0]))).toEqual([32767, 32767, 0, 0]);
  });
});

describe("baueAb — kein Doppel-Connect beim naechsten Anruf", () => {
  const teile = (a: ReturnType<typeof attrappe>): GraphTeile => ({
    procNode: a.mk("proc", { onaudioprocess: () => {} }) as unknown as ScriptProcessorNode,
    mergerNode: a.mk("merger") as unknown as ChannelMergerNode,
    remoteSrcNode: a.mk("remoteSrc") as unknown as MediaStreamAudioSourceNode,
    stilleSenke: a.mk("gain1", { gain: { value: 0 } }) as unknown as GainNode,
    stereo: true,
  });

  it("trennt alles und gibt den leeren Graph zurueck", () => {
    const a = attrappe();
    const t = teile(a);
    expect(baueAb(t)).toEqual(LEERER_GRAPH);
    expect(a.getrennt.sort()).toEqual(["gain1", "merger", "proc", "remoteSrc"]);
  });

  it("🔴 der Rueckruf wird geloescht, sonst laeuft er in eine tote WebSocket", () => {
    const a = attrappe();
    const t = teile(a);
    baueAb(t);
    expect(t.procNode!.onaudioprocess).toBeNull();
  });

  it("ein bereits getrennter Knoten stoert nicht", () => {
    const a = attrappe();
    const t = teile(a);
    (t.procNode as unknown as { disconnect: () => void }).disconnect = () => { throw new Error("schon getrennt"); };
    expect(() => baueAb(t)).not.toThrow();
    expect(a.getrennt).toContain("merger");
  });

  it("ein halb aufgebauter Graph laesst sich abbauen", () => {
    expect(() => baueAb(LEERER_GRAPH)).not.toThrow();
    expect(baueAb(LEERER_GRAPH)).toEqual(LEERER_GRAPH);
  });
});
