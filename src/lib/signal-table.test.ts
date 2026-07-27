import { describe, it, expect } from "vitest";
import { buildSignalOverview, buildAusloeser, buildSignal } from "./signal-table";
import type { CapAlert } from "./capital";

const NOW = new Date(2026, 6, 27);

function alert(p: Partial<CapAlert> = {}): CapAlert {
  return {
    id: 1, account_id: "a", scope: "health", subject_key: "health", kind: "trend_down",
    severity: "warning", severity_rank: 2, status: "open", message: "Meldung",
    window_months: 6, value_now: 62, slope: -3.2, projection: null,
    period: "2026-07-01", confidence: 0.8, coverage: 0.7, is_illustrative: false,
    first_detected_at: "2026-07-20T08:00:00Z", last_evaluated_at: "2026-07-27T03:00:00Z",
    ...p,
  } as CapAlert;
}

describe("buildSignalOverview", () => {
  it("steht ohne offene Alarme auf Stabil", () => {
    const o = buildSignalOverview([], NOW);
    expect(o.state).toBe("stable");
    expect(o.confirmed).toBe(0);
    expect(o.watch).toBe(0);
    expect(o.rows).toHaveLength(0);
  });

  it("zaehlt erledigte Alarme nicht mit", () => {
    const o = buildSignalOverview([alert({ status: "resolved", severity: "critical" })], NOW);
    expect(o.state).toBe("stable");
    expect(o.rows).toHaveLength(0);
  });

  it("stuft einen frischen Alarm als Beobachtung ein", () => {
    const o = buildSignalOverview([alert()], NOW);
    expect(o.state).toBe("watch");
    expect(o.watch).toBe(1);
    expect(o.rows[0].tier).toBe("watch");
  });

  it("stuft einen kritischen Alarm ueber zwei Monatslaeufe als bestaetigt ein", () => {
    const o = buildSignalOverview(
      [alert({ severity: "critical", period: "2026-07-01", first_detected_at: "2026-05-11T08:00:00Z" })],
      NOW,
    );
    expect(o.state).toBe("confirmed");
    expect(o.confirmed).toBe(1);
    expect(o.rows[0].heldLabelDe).toContain("Monatsläufen");
  });

  it("sortiert bestaetigt vor Beobachtung und schwer vor leicht", () => {
    const o = buildSignalOverview(
      [
        alert({ id: 1, severity: "info" }),
        alert({ id: 2, severity: "critical" }),
        alert({ id: 3, severity: "critical", period: "2026-07-01", first_detected_at: "2026-05-11T08:00:00Z" }),
      ],
      NOW,
    );
    expect(o.rows.map((r) => r.id)).toEqual([3, 2, 1]);
    expect(o.state).toBe("confirmed");
  });

  it("fuellt alle vier Spalten des Entwurfs", () => {
    const o = buildSignalOverview([alert()], NOW);
    const r = o.rows[0];
    expect(r.signal).toBeTruthy();
    expect(r.ausloeser).toBeTruthy();
    expect(r.erkannt).toBe("20.07.26");
    expect(r.vorschlag).toBeTruthy();
  });

  it("gibt je Alarm-Art einen eigenen Vorschlag", () => {
    const kinds: CapAlert["kind"][] = ["trend_down", "anomaly", "threshold_breach", "distress_risk"];
    const texte = kinds.map((k) => buildSignalOverview([alert({ kind: k })], NOW).rows[0].vorschlag);
    expect(new Set(texte).size).toBe(4);
  });
});

describe("buildAusloeser", () => {
  it("nennt Steigung, Fenster und Stand", () => {
    const t = buildAusloeser(alert({ slope: -3.28, window_months: 6, value_now: 62 }));
    expect(t).toContain("-3,3 Punkte pro Monat");
    expect(t).toContain("über 6 Monate");
    expect(t).toContain("Stand 62");
  });

  it("schreibt Dezimalzahlen mit Komma", () => {
    expect(buildAusloeser(alert({ slope: -3.2 }))).toContain("-3,2");
    expect(buildAusloeser(alert({ slope: 1.5 }))).toContain("+1,5");
  });

  it("nennt die Restzeit bis zur kritischen Marke", () => {
    const t = buildAusloeser(alert({ projection: { months_to_cross: 2 } }));
    expect(t).toContain("2 Monaten");
  });

  it("faellt ohne Zahlen auf die Server-Meldung zurueck statt zu raten", () => {
    const t = buildAusloeser(alert({ slope: null, window_months: null, value_now: null, message: "Originaltext" }));
    expect(t).toBe("Originaltext");
  });
});

describe("buildSignal", () => {
  it("benennt Gesamtbild, Bereich und Kennzahl unterschiedlich", () => {
    expect(buildSignal(alert({ scope: "health" }))).toContain("Gesamtbild");
    expect(buildSignal(alert({ scope: "category", subject_key: "risk" }))).toContain("Bereich risk");
    expect(buildSignal(alert({ scope: "metric", subject_key: "fin_dso" }))).toContain("Kennzahl fin_dso");
  });
});
