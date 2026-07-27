/**
 * Kennzahlen fuer den Geld-Bereich (Briefing §3).
 *
 * Der Entwurf zeigt Altersstruktur, Ø Zahlungsdauer und eine Belege-Quote.
 * Das Backend liefert diese Werte (noch) nicht fertig — die Rohdaten aber
 * schon: tenant_documents traegt issue_date / due_date / paid_at / amount_gross,
 * die AP-Liste traegt needs_confirmation. Statt auf ein Backend-Add zu warten,
 * wird hier aus genau diesen Feldern gerechnet.
 *
 * Regeln:
 *  - Nur rechnen, was aus den vorhandenen Feldern folgt. Fehlt ein Datum, faellt
 *    der Datensatz aus der Kennzahl — er wird nicht geschaetzt.
 *  - Gibt es keine belastbare Grundlage, ist das Ergebnis null. Die Karte zeigt
 *    dann "–" statt einer Fantasiezahl.
 */

const DAY_MS = 86_400_000;

export interface AgingDoc {
  amount_gross?: number | null;
  due_date?: string | null;
  paid_at?: string | null;
  issue_date?: string | null;
  status?: string | null;
}

export type AgingBucketKey = "notyet" | "d1_30" | "d31_60" | "d61_90" | "d90plus";

export interface AgingBucket {
  key: AgingBucketKey;
  label: string;
  count: number;
  amount: number;
}

const BUCKET_LABELS: Record<AgingBucketKey, string> = {
  notyet: "nicht fällig",
  d1_30: "1–30 Tage",
  d31_60: "31–60 Tage",
  d61_90: "61–90 Tage",
  d90plus: "über 90 Tage",
};

/** Tage seit Faelligkeit; negativ = noch nicht faellig. null ohne Faelligkeitsdatum. */
export function daysOverdue(dueDate: string | null | undefined, now = Date.now()): number | null {
  if (!dueDate) return null;
  const t = Date.parse(dueDate);
  if (!Number.isFinite(t)) return null;
  return Math.floor((now - t) / DAY_MS);
}

/**
 * Altersstruktur der OFFENEN Forderungen (paid_at leer). Betraege in EUR.
 * Posten ohne Faelligkeitsdatum zaehlen nicht mit — sie haben kein Alter.
 */
export function agingBuckets(docs: AgingDoc[] | undefined, now = Date.now()): AgingBucket[] {
  const acc: Record<AgingBucketKey, AgingBucket> = {
    notyet: { key: "notyet", label: BUCKET_LABELS.notyet, count: 0, amount: 0 },
    d1_30: { key: "d1_30", label: BUCKET_LABELS.d1_30, count: 0, amount: 0 },
    d31_60: { key: "d31_60", label: BUCKET_LABELS.d31_60, count: 0, amount: 0 },
    d61_90: { key: "d61_90", label: BUCKET_LABELS.d61_90, count: 0, amount: 0 },
    d90plus: { key: "d90plus", label: BUCKET_LABELS.d90plus, count: 0, amount: 0 },
  };

  for (const d of docs ?? []) {
    if (d.paid_at) continue;
    if (d.status === "void" || d.status === "cancelled") continue;
    const od = daysOverdue(d.due_date, now);
    if (od === null) continue;
    const key: AgingBucketKey =
      od <= 0 ? "notyet" : od <= 30 ? "d1_30" : od <= 60 ? "d31_60" : od <= 90 ? "d61_90" : "d90plus";
    acc[key].count += 1;
    acc[key].amount += Number(d.amount_gross ?? 0) || 0;
  }

  return [acc.notyet, acc.d1_30, acc.d31_60, acc.d61_90, acc.d90plus];
}

/**
 * Ø Zahlungsdauer in Tagen: Mittel ueber (paid_at − issue_date) aller bezahlten
 * Rechnungen. null, wenn kein Datensatz beide Daten hat.
 */
export function avgPaymentDays(docs: AgingDoc[] | undefined): number | null {
  let sum = 0;
  let n = 0;
  for (const d of docs ?? []) {
    if (!d.paid_at || !d.issue_date) continue;
    const paid = Date.parse(d.paid_at);
    const issued = Date.parse(d.issue_date);
    if (!Number.isFinite(paid) || !Number.isFinite(issued)) continue;
    const days = (paid - issued) / DAY_MS;
    if (days < 0) continue; // kaputte Daten nicht mitmitteln
    sum += days;
    n += 1;
  }
  return n === 0 ? null : Math.round((sum / n) * 10) / 10;
}

export interface ConfirmShare {
  total: number;
  confirmed: number;
  /** 0…100, gerundet. null wenn es nichts zu quoten gibt. */
  pct: number | null;
}

/**
 * Belege-Quote: wie viel Prozent der erfassten Eingangsrechnungen UseEasy
 * eindeutig zuordnen konnte (needs_confirmation === false).
 */
export function confirmedShare(
  items: Array<{ needs_confirmation?: boolean | null }> | undefined,
): ConfirmShare {
  const list = items ?? [];
  const total = list.length;
  const confirmed = list.filter((i) => i.needs_confirmation === false).length;
  return { total, confirmed, pct: total === 0 ? null : Math.round((confirmed / total) * 100) };
}

/* ------------------------------------------------------------------ Umsatz */

export interface RevenueMonth {
  /** yyyy-mm */
  month: string;
  /** Kurzlabel fuer die Achse, z.B. "Jul". */
  label: string;
  /** Bereits bezahlter Anteil des Monats, in EUR. */
  paid: number;
  /** Noch offener Anteil, in EUR. */
  open: number;
  total: number;
  count: number;
}

export interface RevenueSeries {
  months: RevenueMonth[];
  /** Groesster Monatsumsatz, mindestens 1 (Divisionsschutz). */
  max: number;
  /** Summe ueber den gesamten Zeitraum. */
  total: number;
  /** true, sobald irgendein Monat einen Betrag traegt. */
  hasData: boolean;
}

const MONTH_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/**
 * Umsatz je Monat aus den Rechnungen, gestapelt in bezahlt und offen
 * (Leon-Entscheid 27.07.: Balken, 12 Monate, bezahlt + offen).
 *
 * Zugeordnet wird nach AUSSTELLUNGSDATUM (issue_date), nicht nach Zahlungs-
 * eingang: der Balken zeigt, was in dem Monat fakturiert wurde, und die
 * Zweiteilung zeigt, wie viel davon schon hereingekommen ist.
 *
 * Regeln wie im Rest der Datei: nur rechnen, was aus vorhandenen Feldern folgt.
 * Rechnungen ohne Ausstellungsdatum oder ohne Betrag zaehlen nicht mit, stornierte
 * ebenfalls nicht. Monate ohne Umsatz bleiben als leere Saeule stehen, damit die
 * Zeitachse nicht luegt.
 */
export function monthlyRevenue(
  docs: AgingDoc[] | undefined,
  now: Date = new Date(),
  monthCount = 12,
): RevenueSeries {
  const slots: RevenueMonth[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    slots.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: MONTH_SHORT[d.getMonth()],
      paid: 0,
      open: 0,
      total: 0,
      count: 0,
    });
  }
  const byMonth = new Map(slots.map((s) => [s.month, s]));

  for (const doc of docs ?? []) {
    if (!doc.issue_date) continue;
    if (doc.status === "void" || doc.status === "cancelled") continue;
    const t = Date.parse(doc.issue_date);
    if (!Number.isFinite(t)) continue;
    const d = new Date(t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const slot = byMonth.get(key);
    if (!slot) continue; // ausserhalb des Fensters

    const amount = Number(doc.amount_gross ?? 0) || 0;
    if (amount <= 0) continue;
    if (doc.paid_at) slot.paid += amount;
    else slot.open += amount;
    slot.total += amount;
    slot.count += 1;
  }

  const total = slots.reduce((n, s) => n + s.total, 0);
  return {
    months: slots,
    max: Math.max(1, ...slots.map((s) => s.total)),
    total,
    hasData: total > 0,
  };
}
