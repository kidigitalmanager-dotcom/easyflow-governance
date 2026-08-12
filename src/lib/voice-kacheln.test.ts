import { describe, it, expect, vi } from "vitest";
import {
  statusLage, terminZustand, skripteZustand, QUELLEN, KACHEL_QUELLE,
  UNBEKANNT, GESCHEITERT, type QuellKey, type Statusabruf,
} from "./voice-kacheln";

const alleRuhig = (): Record<QuellKey, Statusabruf> => {
  const r = {} as Record<QuellKey, Statusabruf>;
  for (const q of QUELLEN) r[q] = { failed: false, fetching: false, retry: vi.fn() };
  return r;
};

describe("statusLage — der Neu-laden-Knopf muss JEDE Kachel heilen koennen", () => {
  it("meldet nichts, solange alles steht", () => {
    const l = statusLage(alleRuhig());
    expect(l.anyFailed).toBe(false);
    expect(l.gescheiterte).toEqual([]);
  });

  it("🔴 heilt auch die Termin-Kachel — genau die fehlte am 12.08. in der Liste", () => {
    const abrufe = alleRuhig();
    abrufe.termin = { failed: true, fetching: false, retry: vi.fn() };
    const l = statusLage(abrufe);
    expect(l.gescheiterte).toContain("termin");
    l.retryAll();
    expect(abrufe.termin.retry).toHaveBeenCalledTimes(1);
  });

  it("🔴 heilt auch die Skripte-Kachel getrennt von der Co-Pilot-Kachel", () => {
    const abrufe = alleRuhig();
    abrufe.scripts = { failed: true, fetching: false, retry: vi.fn() };
    const l = statusLage(abrufe);
    expect(l.gescheiterte).toEqual(["scripts"]);
    l.retryAll();
    expect(abrufe.scripts.retry).toHaveBeenCalledTimes(1);
    // Die Co-Pilot-Quelle wird NICHT mit angefasst.
    expect(abrufe.copilot.retry).not.toHaveBeenCalled();
  });

  it("wiederholt nur die gescheiterten, nicht alles", () => {
    const abrufe = alleRuhig();
    abrufe.leads = { failed: true, fetching: false, retry: vi.fn() };
    statusLage(abrufe).retryAll();
    expect(abrufe.leads.retry).toHaveBeenCalledTimes(1);
    expect(abrufe.reps.retry).not.toHaveBeenCalled();
  });

  it("anyRetrying gilt nur fuer einen laufenden Wiederholversuch, nicht fuer jedes Nachladen", () => {
    const abrufe = alleRuhig();
    // Kachel laedt nach, ist aber nicht gescheitert: das ist kein Wiederholen.
    abrufe.reps = { failed: false, fetching: true, retry: vi.fn() };
    expect(statusLage(abrufe).anyRetrying).toBe(false);
    abrufe.consent = { failed: true, fetching: true, retry: vi.fn() };
    expect(statusLage(abrufe).anyRetrying).toBe(true);
  });

  it("jede Kachel zeigt auf eine Quelle, die es in QUELLEN wirklich gibt", () => {
    for (const quelle of Object.values(KACHEL_QUELLE)) {
      expect(QUELLEN).toContain(quelle);
    }
    // Und keine Quelle ist tot: jede wird von mindestens einer Kachel benutzt.
    const benutzt = new Set<string>(Object.values(KACHEL_QUELLE));
    for (const q of QUELLEN) expect(benutzt.has(q)).toBe(true);
  });

  it("Anrufe und Vertriebler teilen sich EINE Quelle, kosten also keinen zweiten Abruf", () => {
    expect(KACHEL_QUELLE.calls).toBe(KACHEL_QUELLE.reps);
  });
});

describe("terminZustand", () => {
  it("steht auf – solange geladen wird, NICHT auf rot", () => {
    // 🔴 Der Ausfall vom 12.08.: ohne Sitzung feuerte der Abruf, warf 401 und
    // die Kachel blieb rot. Mit enabled:!!session ist isLoading wahr.
    expect(terminZustand({ isLoading: true, isError: false })).toEqual(UNBEKANNT);
  });

  it("sagt es, wenn der Abruf wirklich scheitert", () => {
    expect(terminZustand({ isLoading: false, isError: true })).toEqual(GESCHEITERT);
  });

  it("verbundener Kalender ist gruen", () => {
    expect(terminZustand({ isLoading: false, isError: false, data: { termin_moeglich: true } }))
      .toEqual({ tone: "emerald", text: "Kalender verbunden" });
  });

  it("kein Kalender ist gelb, nicht rot — das ist eine Aussage, kein Fehler", () => {
    expect(terminZustand({ isLoading: false, isError: false, data: { termin_moeglich: false } }))
      .toEqual({ tone: "amber", text: "Kein Kalender verbunden" });
  });

  it("Antwort ohne Nutzlast behauptet nichts", () => {
    expect(terminZustand({ isLoading: false, isError: false, data: null })).toEqual(UNBEKANNT);
  });
});

describe("skripteZustand — eigener Zustand, geborgt war der Fehler", () => {
  const rep = (o: { aktiv?: string | null; leer?: number[] } = {}) => ({
    active_script_id: o.aktiv === undefined ? "s1" : o.aktiv,
    scripts: (o.leer ?? [0]).map((n) => ({ empty_phases: n })),
  });

  it("🔴 antwortet der Endpunkt mit 200, ist die Kachel NICHT rot", () => {
    // Das war der Kern des Fundes: /v1/copilot/scripts/overview lieferte 200,
    // die Kachel meldete trotzdem Ausfall, weil sie copilotState borgte.
    expect(skripteZustand({ isLoading: false, isError: false, data: { reps: [rep()] } }))
      .toEqual({ tone: "emerald", text: "1 versorgt" });
  });

  it("🔴 die leere Phase schlaegt die gute Nachricht (Fall Kerim, 23.07.)", () => {
    const z = skripteZustand({
      isLoading: false, isError: false,
      data: { reps: [rep(), rep({ leer: [0, 1] })] },
    });
    expect(z).toEqual({ tone: "amber", text: "1 leere Phase" });
  });

  it("zaehlt mehrere Vertriebler mit leerer Phase", () => {
    const z = skripteZustand({
      isLoading: false, isError: false,
      data: { reps: [rep({ leer: [2] }), rep({ leer: [1] }), rep()] },
    });
    expect(z).toEqual({ tone: "amber", text: "2 mit leerer Phase" });
  });

  it("Bibliothek da, aber niemandem zugewiesen: gelb, nicht gruen", () => {
    expect(skripteZustand({
      isLoading: false, isError: false,
      data: { reps: [rep({ aktiv: null })], library_script_ids: ["a", "b"] },
    })).toEqual({ tone: "amber", text: "nicht zugewiesen" });
  });

  it("gar nichts angelegt ist grau, kein Fehler", () => {
    expect(skripteZustand({ isLoading: false, isError: false, data: { reps: [], library_script_ids: [] } }))
      .toEqual({ tone: "muted", text: "keine angelegt" });
  });

  it("nicht verknuepfter Workspace ist kein Serverfehler", () => {
    expect(skripteZustand({ isLoading: false, isError: true }, true))
      .toEqual({ tone: "muted", text: "nicht verknüpft" });
  });

  it("ein echter Fehler bleibt ein Fehler", () => {
    expect(skripteZustand({ isLoading: false, isError: true }, false)).toEqual(GESCHEITERT);
  });

  it("laedt noch: –", () => {
    expect(skripteZustand({ isLoading: true, isError: false })).toEqual(UNBEKANNT);
  });
});
