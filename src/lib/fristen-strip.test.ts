import { describe, it, expect } from "vitest";
import { buildFristenStrip, localIso, isOpen } from "./fristen-strip";

// Fester Bezugspunkt: Montag, 27.07.2026, 10:00 Ortszeit.
const NOW = new Date(2026, 6, 27, 10, 0, 0);
const iso = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

describe("buildFristenStrip", () => {
  it("baut immer 14 Tage ab heute", () => {
    const s = buildFristenStrip([], NOW);
    expect(s.days).toHaveLength(14);
    expect(s.days[0].isToday).toBe(true);
    expect(s.days[0].iso).toBe("2026-07-27");
    expect(s.days[13].iso).toBe("2026-08-09");
    expect(s.days.filter((d) => d.isToday)).toHaveLength(1);
  });

  it("beschriftet die Wochentage deutsch und laeuft ueber den Monatswechsel", () => {
    const s = buildFristenStrip([], NOW);
    expect(s.days[0].weekday).toBe("Mo");
    expect(s.days[5].weekday).toBe("Sa");
    expect(s.days[6].weekday).toBe("So");
    // 27.07. + 5 Tage = 01.08.
    const aug = s.days.find((d) => d.iso === "2026-08-01");
    expect(aug?.day).toBe(1);
  });

  it("ohne Fristen ist alles grau und die Zaehler stehen auf 0", () => {
    const s = buildFristenStrip([], NOW);
    expect(s.active).toBe(0);
    expect(s.critical).toBe(0);
    expect(s.days.every((d) => d.tone === "none" && d.count === 0)).toBe(true);
    expect(s.days[0].title).toBe("keine Frist");
  });

  it("faerbt eine kuenftige Frist amber", () => {
    const s = buildFristenStrip([{ next_deadline_at: iso(2026, 6, 30), open_commitments: 2 }], NOW);
    const cell = s.days.find((d) => d.iso === "2026-07-30")!;
    expect(cell.tone).toBe("due");
    expect(cell.count).toBe(1);
    expect(s.active).toBe(1);
    expect(s.critical).toBe(0);
  });

  it("faerbt eine Frist mit 0 offenen Zusagen gruen", () => {
    const s = buildFristenStrip([{ next_deadline_at: iso(2026, 6, 30), open_commitments: 0 }], NOW);
    expect(s.days.find((d) => d.iso === "2026-07-30")!.tone).toBe("done");
  });

  it("behandelt unbekannte open_commitments als offen, nie als erledigt", () => {
    expect(isOpen({ open_commitments: null })).toBe(true);
    expect(isOpen({ open_commitments: undefined })).toBe(true);
    expect(isOpen({ open_commitments: 0 })).toBe(false);
    expect(isOpen({ open_commitments: "0" })).toBe(false);
    expect(isOpen({ open_commitments: "3" })).toBe(true);
    const s = buildFristenStrip([{ next_deadline_at: iso(2026, 6, 30) }], NOW);
    expect(s.days.find((d) => d.iso === "2026-07-30")!.tone).toBe("due");
  });

  it("zieht ueberfaellige Fristen auf die Heute-Kachel und faerbt sie rot", () => {
    const s = buildFristenStrip(
      [
        { next_deadline_at: iso(2026, 6, 20), open_commitments: 1 }, // 7 Tage zu spaet
        { next_deadline_at: iso(2026, 5, 2), open_commitments: 4 },  // sehr alt
      ],
      NOW,
    );
    const heute = s.days[0];
    expect(heute.tone).toBe("critical");
    expect(heute.count).toBe(2);
    expect(heute.overdue).toBe(2);
    expect(s.critical).toBe(2);
    expect(heute.title).toContain("überfällig");
  });

  it("faerbt eine Frist von heute rot, nicht amber", () => {
    const s = buildFristenStrip([{ next_deadline_at: iso(2026, 6, 27, 18), open_commitments: 1 }], NOW);
    expect(s.days[0].tone).toBe("critical");
    expect(s.days[0].overdue).toBe(0);
  });

  it("ignoriert Fristen hinter dem Fensterende", () => {
    const s = buildFristenStrip([{ next_deadline_at: iso(2026, 8, 15), open_commitments: 1 }], NOW);
    expect(s.active).toBe(0);
    expect(s.days.every((d) => d.tone === "none")).toBe(true);
  });

  it("laesst den staerksten Ton je Tag gewinnen", () => {
    const s = buildFristenStrip(
      [
        { next_deadline_at: iso(2026, 6, 30), open_commitments: 0 }, // gruen
        { next_deadline_at: iso(2026, 6, 30), open_commitments: 5 }, // amber
      ],
      NOW,
    );
    const cell = s.days.find((d) => d.iso === "2026-07-30")!;
    expect(cell.tone).toBe("due");
    expect(cell.count).toBe(2);
  });

  it("ueberspringt kaputte und fehlende Datumsangaben", () => {
    const s = buildFristenStrip(
      [
        { next_deadline_at: null },
        { next_deadline_at: "" },
        { next_deadline_at: "kein datum" },
        { next_deadline_at: iso(2026, 6, 29), open_commitments: 1 },
      ],
      NOW,
    );
    expect(s.active).toBe(1);
  });

  it("localIso nutzt lokale Zeit, nicht UTC", () => {
    expect(localIso(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localIso(new Date(2026, 11, 31, 23, 30))).toBe("2026-12-31");
  });
});
