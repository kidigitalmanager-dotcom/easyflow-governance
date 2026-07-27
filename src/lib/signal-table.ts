/**
 * Signal-Tabelle und EINE Ampel (Leons Entwurf, Briefing 27.07.2026 Punkt 5.3).
 *
 * Der Entwurf zeigt auf der Frühwarnung eine gemeinsame Ampel
 * (Bestätigt · Beobachtung · Stabil) und darunter eine Tabelle mit den Spalten
 * Signal / Auslöser / Erkannt / Vorschlag. Beides gab es bisher nicht: die Seite
 * war eine Komposition der alten Capital-Karten.
 *
 * Diese Datei enthält NUR die Ableitung, damit sie testbar ist. Es wird nichts
 * erfunden: jede Spalte kommt aus Feldern, die der Alert wirklich trägt
 * (kind, severity, message, slope, value_now, window_months, first_detected_at).
 * Der Vorschlag ist bewusst eine Prüf-Anweisung, keine Geschäftsempfehlung, die
 * das System nicht belegen kann.
 */
import { classifyAlert, type AlertQualityInput } from "./alert-quality";
import { ALERT_KIND_LABEL, type CapAlert } from "./capital";

export type AmpelState = "confirmed" | "watch" | "stable";

export interface SignalRow {
  id: number;
  /** Was ist los. */
  signal: string;
  /** Woran es erkannt wurde. */
  ausloeser: string;
  /** Datum der Erst-Erkennung, deutsch formatiert. */
  erkannt: string;
  /** Was der Betrieb jetzt tun kann. */
  vorschlag: string;
  tier: "confirmed" | "watch";
  severity: CapAlert["severity"];
  heldLabelDe: string;
  isIllustrative: boolean;
}

export interface SignalOverview {
  state: AmpelState;
  confirmed: number;
  watch: number;
  rows: SignalRow[];
}

const VORSCHLAG: Record<CapAlert["kind"], string> = {
  distress_risk:
    "Frühzeitig gegensteuern: offene Posten und Zahlungsziele in diesem Bereich durchgehen, bevor der Wert die kritische Marke erreicht.",
  threshold_breach:
    "Der Wert liegt unter der Schwelle. Nachsehen, welche Datenquelle den Ausschlag gibt, und dort ansetzen.",
  trend_down:
    "Entwicklung beobachten und die Ursache in den betroffenen Kennzahlen prüfen, solange der Abstand noch klein ist.",
  anomaly:
    "Einmaliger Ausschlag. Prüfen, ob ein Sondereffekt dahintersteckt, bevor daraus eine Maßnahme wird.",
};

const SCOPE_LABEL: Record<CapAlert["scope"], string> = {
  health: "Gesamtbild",
  category: "Bereich",
  metric: "Kennzahl",
};

function fmtDateDe(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "–";
  return new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Auslöser aus den harten Zahlen des Alerts, nicht aus der Meldung geraten. */
export function buildAusloeser(a: CapAlert): string {
  const teile: string[] = [];
  if (a.slope != null && Number.isFinite(a.slope)) {
    const v = Math.round(a.slope * 10) / 10;
    teile.push(`${v > 0 ? "+" : ""}${String(v).replace(".", ",")} Punkte pro Monat`);
  }
  if (a.window_months) teile.push(`über ${a.window_months} Monate`);
  if (a.value_now != null && Number.isFinite(a.value_now)) teile.push(`Stand ${Math.round(a.value_now)}`);
  const mtc = a.projection?.months_to_cross;
  if (mtc != null && Number.isFinite(mtc)) {
    teile.push(`erreicht die kritische Marke in ${mtc} Monat${mtc === 1 ? "" : "en"}`);
  }
  if (teile.length === 0) return a.message || "kein Detail überliefert";
  return teile.join(" · ");
}

/** Kurzer Titel: was betroffen ist plus die Art des Alarms. */
export function buildSignal(a: CapAlert): string {
  const art = ALERT_KIND_LABEL[a.kind] ?? a.kind;
  const wo = a.scope === "health" ? SCOPE_LABEL.health : `${SCOPE_LABEL[a.scope]} ${a.subject_key}`;
  return `${art}: ${wo}`;
}

/**
 * Baut Ampel und Tabelle. Ohne offene Alarme steht die Ampel auf "Stabil";
 * das ist eine echte Aussage und keine Entwarnung ins Blaue, denn sie beruht
 * auf demselben Feed, der sonst warnt.
 */
export function buildSignalOverview(
  alerts: CapAlert[] | undefined,
  now: Date = new Date(),
): SignalOverview {
  const open = (alerts ?? []).filter((a) => a.status === "open");
  const rows: SignalRow[] = open.map((a) => {
    const q = classifyAlert(a as unknown as AlertQualityInput, now);
    return {
      id: a.id,
      signal: buildSignal(a),
      ausloeser: buildAusloeser(a),
      erkannt: fmtDateDe(a.first_detected_at),
      vorschlag: VORSCHLAG[a.kind] ?? "Sachverhalt prüfen.",
      tier: q.tier,
      severity: a.severity,
      heldLabelDe: q.heldLabelDe,
      isIllustrative: !!a.is_illustrative,
    };
  });

  // Bestätigt zuerst, darin die schwersten oben.
  const rank: Record<CapAlert["severity"], number> = { critical: 3, warning: 2, info: 1 };
  rows.sort(
    (x, y) =>
      Number(y.tier === "confirmed") - Number(x.tier === "confirmed") ||
      rank[y.severity] - rank[x.severity],
  );

  const confirmed = rows.filter((r) => r.tier === "confirmed").length;
  const watch = rows.length - confirmed;
  return {
    state: confirmed > 0 ? "confirmed" : watch > 0 ? "watch" : "stable",
    confirmed,
    watch,
    rows,
  };
}
