/**
 * Fristen-Band "nächste 14 Tage" (Leons Entwurf, Briefing 27.07.2026 Punkt 3.1).
 *
 * Reine Logik, damit die Einstufung testbar ist. Datenquelle ist dieselbe wie
 * beim bestehenden FristenBoard: memory-engine `entity_profiles`, Feld
 * `next_deadline_at`. Es wird KEIN neuer Endpunkt erfunden.
 *
 * Ehrlichkeit der Farben (das ist der springende Punkt):
 *   rot     Frist ist heute oder schon vorbei und beim Gegenüber ist noch etwas offen
 *   amber   Frist liegt in den nächsten 14 Tagen, beim Gegenüber ist noch etwas offen
 *   grün    an dem Tag liegt eine Frist, aber es ist nichts mehr offen (erledigt)
 *   grau    an dem Tag ist nichts
 *
 * "erledigt" wird NICHT geraten: es kommt aus `open_commitments === 0`. Ist der
 * Wert unbekannt (null), gilt der Vorgang als offen, nie als erledigt.
 *
 * Überfällige Fristen liegen vor dem Fensteranfang. Sie verschwinden nicht,
 * sondern zählen auf die Kachel von HEUTE, denn dort ist die Handlung fällig.
 */

export type DayTone = "critical" | "due" | "done" | "none";

export interface DeadlineSource {
  next_deadline_at?: string | null;
  open_commitments?: number | string | null;
}

export interface FristDay {
  /** yyyy-mm-dd in lokaler Zeit. */
  iso: string;
  /** Mo, Di, Mi, Do, Fr, Sa, So */
  weekday: string;
  /** Tag im Monat, 1..31 */
  day: number;
  tone: DayTone;
  /** Anzahl Fristen an diesem Tag (inkl. überfälliger auf der Heute-Kachel). */
  count: number;
  /** Davon überfällig (nur auf der Heute-Kachel möglich). */
  overdue: number;
  isToday: boolean;
  /** Tooltip-Text. */
  title: string;
}

export interface FristStrip {
  days: FristDay[];
  /** Fristen im Fenster gesamt (inkl. überfälliger). */
  active: number;
  /** Davon rot. */
  critical: number;
}

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** yyyy-mm-dd in LOKALER Zeit (nicht UTC, sonst springt der Tag am Abend). */
export function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Offen = unbekannt oder > 0. Nur eine explizite 0 gilt als erledigt. */
export function isOpen(src: DeadlineSource): boolean {
  const n = toNumber(src.open_commitments);
  return n === null ? true : n > 0;
}

/**
 * Baut die 14 Tageskacheln. `now` ist injizierbar, damit Tests nicht von der
 * Uhr abhängen.
 */
export function buildFristenStrip(
  sources: DeadlineSource[] | undefined,
  now: Date = new Date(),
  days = 14,
): FristStrip {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayIso = localIso(todayStart);

  // Gerüst: 14 leere Tage ab heute.
  const grid: FristDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + i);
    grid.push({
      iso: localIso(d),
      weekday: WEEKDAYS[d.getDay()],
      day: d.getDate(),
      tone: "none",
      count: 0,
      overdue: 0,
      isToday: i === 0,
      title: "",
    });
  }
  const byIso = new Map(grid.map((g) => [g.iso, g]));
  const lastIso = grid[grid.length - 1].iso;

  let active = 0;
  for (const s of sources ?? []) {
    if (!s?.next_deadline_at) continue;
    const t = Date.parse(s.next_deadline_at);
    if (!Number.isFinite(t)) continue;

    const d = new Date(t);
    const iso = localIso(d);
    const overdue = iso < todayIso;
    // Alles nach dem Fensterende interessiert das Band nicht.
    if (!overdue && iso > lastIso) continue;

    // Überfällige zählen auf HEUTE, dort ist die Handlung fällig.
    const cell = overdue ? byIso.get(todayIso)! : byIso.get(iso);
    if (!cell) continue;

    const open = isOpen(s);
    cell.count += 1;
    if (overdue) cell.overdue += 1;
    active += 1;

    // Stärkster Ton gewinnt: rot > amber > grün.
    const tone: DayTone = !open ? "done" : overdue || cell.isToday ? "critical" : "due";
    const rank: Record<DayTone, number> = { critical: 3, due: 2, done: 1, none: 0 };
    if (rank[tone] > rank[cell.tone]) cell.tone = tone;
  }

  for (const c of grid) {
    c.title =
      c.count === 0
        ? "keine Frist"
        : c.overdue > 0
          ? `${c.overdue} überfällig${c.count > c.overdue ? `, ${c.count - c.overdue} heute fällig` : ""}`
          : c.tone === "done"
            ? `${c.count} Frist${c.count > 1 ? "en" : ""}, nichts mehr offen`
            : `${c.count} Frist${c.count > 1 ? "en" : ""} an diesem Tag`;
  }

  return {
    days: grid,
    active,
    critical: grid.filter((g) => g.tone === "critical").reduce((n, g) => n + g.count, 0),
  };
}
