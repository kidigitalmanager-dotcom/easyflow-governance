import { describe, it, expect } from "vitest";
import { agingBuckets, avgPaymentDays, confirmedShare, daysOverdue, monthlyRevenue } from "./ar-metrics";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-27T12:00:00Z");
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

describe("daysOverdue", () => {
  it("zaehlt ueberfaellige Tage", () => {
    expect(daysOverdue(iso(-10), NOW)).toBe(10);
  });
  it("ist negativ, solange nichts faellig ist", () => {
    expect(daysOverdue(iso(5), NOW)).toBeLessThan(0);
  });
  it("ist null ohne oder mit kaputtem Datum", () => {
    expect(daysOverdue(null, NOW)).toBeNull();
    expect(daysOverdue("morgen", NOW)).toBeNull();
  });
});

describe("agingBuckets", () => {
  const docs = [
    { amount_gross: 100, due_date: iso(3) },                    // nicht faellig
    { amount_gross: 200, due_date: iso(-10) },                  // 1-30
    { amount_gross: 50, due_date: iso(-30) },                   // 1-30 (Grenze)
    { amount_gross: 300, due_date: iso(-45) },                  // 31-60
    { amount_gross: 400, due_date: iso(-80) },                  // 61-90
    { amount_gross: 500, due_date: iso(-200) },                 // >90
    { amount_gross: 999, due_date: iso(-50), paid_at: iso(-2) },// bezahlt -> raus
    { amount_gross: 999, due_date: iso(-50), status: "void" },  // storniert -> raus
    { amount_gross: 999, due_date: null },                      // ohne Frist -> raus
  ];

  it("sortiert korrekt in die Faecher", () => {
    const b = Object.fromEntries(agingBuckets(docs, NOW).map((x) => [x.key, x]));
    expect(b.notyet.amount).toBe(100);
    expect(b.d1_30.amount).toBe(250);
    expect(b.d1_30.count).toBe(2);
    expect(b.d31_60.amount).toBe(300);
    expect(b.d61_90.amount).toBe(400);
    expect(b.d90plus.amount).toBe(500);
  });

  it("laesst bezahlte, stornierte und fristlose Posten aus", () => {
    const total = agingBuckets(docs, NOW).reduce((s, x) => s + x.count, 0);
    expect(total).toBe(6);
  });

  it("kommt mit leerer Liste klar", () => {
    expect(agingBuckets(undefined, NOW).every((b) => b.count === 0)).toBe(true);
  });
});

describe("avgPaymentDays", () => {
  it("mittelt paid_at minus issue_date", () => {
    expect(
      avgPaymentDays([
        { issue_date: iso(-30), paid_at: iso(-20) }, // 10
        { issue_date: iso(-30), paid_at: iso(-10) }, // 20
      ]),
    ).toBe(15);
  });

  it("ignoriert unvollstaendige und negative Datensaetze", () => {
    expect(
      avgPaymentDays([
        { issue_date: iso(-30), paid_at: iso(-20) }, // 10
        { issue_date: iso(-30) },                    // unbezahlt
        { paid_at: iso(-5) },                        // kein Ausstellungsdatum
        { issue_date: iso(-5), paid_at: iso(-30) },  // negativ -> raus
      ]),
    ).toBe(10);
  });

  it("ist null ohne Grundlage", () => {
    expect(avgPaymentDays([])).toBeNull();
    expect(avgPaymentDays(undefined)).toBeNull();
    expect(avgPaymentDays([{ issue_date: iso(-3) }])).toBeNull();
  });
});

describe("confirmedShare", () => {
  it("rechnet die Quote", () => {
    const s = confirmedShare([
      { needs_confirmation: false },
      { needs_confirmation: false },
      { needs_confirmation: true },
      { needs_confirmation: true },
    ]);
    expect(s).toEqual({ total: 4, confirmed: 2, pct: 50 });
  });

  it("ist null-Quote ohne Belege", () => {
    expect(confirmedShare([]).pct).toBeNull();
    expect(confirmedShare(undefined).pct).toBeNull();
  });

  it("zaehlt nur explizites false als bestaetigt", () => {
    expect(confirmedShare([{ needs_confirmation: null }, { needs_confirmation: false }]).confirmed).toBe(1);
  });
});

describe("monthlyRevenue", () => {
  const NOW = new Date(2026, 6, 27); // Juli 2026
  const doc = (issue: string, amount: number, paid?: string | null, status?: string) => ({
    issue_date: issue, amount_gross: amount, paid_at: paid ?? null, status,
  });

  it("liefert immer 12 Monate und endet im laufenden Monat", () => {
    const r = monthlyRevenue([], NOW);
    expect(r.months).toHaveLength(12);
    expect(r.months[11].month).toBe("2026-07");
    expect(r.months[11].label).toBe("Jul");
    expect(r.months[0].month).toBe("2025-08");
    expect(r.hasData).toBe(false);
    expect(r.max).toBe(1); // Divisionsschutz
  });

  it("stapelt bezahlt und offen im Monat der Ausstellung", () => {
    const r = monthlyRevenue([
      doc("2026-07-02", 1000, "2026-07-20"),
      doc("2026-07-15", 500),
      doc("2026-06-10", 300, "2026-06-30"),
    ], NOW);
    const jul = r.months.find((m) => m.month === "2026-07")!;
    expect(jul.paid).toBe(1000);
    expect(jul.open).toBe(500);
    expect(jul.total).toBe(1500);
    expect(jul.count).toBe(2);
    const jun = r.months.find((m) => m.month === "2026-06")!;
    expect(jun.paid).toBe(300);
    expect(jun.open).toBe(0);
    expect(r.total).toBe(1800);
    expect(r.max).toBe(1500);
    expect(r.hasData).toBe(true);
  });

  it("laesst Stornos, Betragslose und Datumslose weg", () => {
    const r = monthlyRevenue([
      doc("2026-07-02", 900, null, "void"),
      doc("2026-07-03", 900, null, "cancelled"),
      doc("2026-07-04", 0),
      { amount_gross: 500, issue_date: null, paid_at: null },
      doc("kein datum", 700),
    ], NOW);
    expect(r.total).toBe(0);
    expect(r.hasData).toBe(false);
  });

  it("ignoriert Rechnungen ausserhalb des Fensters", () => {
    const r = monthlyRevenue([doc("2024-01-05", 5000), doc("2026-07-01", 10)], NOW);
    expect(r.total).toBe(10);
  });

  it("ordnet nach Ausstellungsdatum, nicht nach Zahlungseingang", () => {
    // Juni gestellt, Juli bezahlt -> zaehlt in JUNI (als bezahlt).
    const r = monthlyRevenue([doc("2026-06-28", 800, "2026-07-05")], NOW);
    expect(r.months.find((m) => m.month === "2026-06")!.paid).toBe(800);
    expect(r.months.find((m) => m.month === "2026-07")!.total).toBe(0);
  });
});
