/**
 * Filter-Facetten fuer die Freigaben (Briefing §2: Chips "Alle / Fristbezug / Geld").
 *
 * WICHTIG — Ehrlichkeit vor Bequemlichkeit: der Server liefert KEINE Facetten.
 * Diese Ableitung arbeitet ausschliesslich auf Feldern, die es wirklich gibt:
 *
 *  - "Geld"       aus action_type / applied_core_key / label_reason_source,
 *                 also dem Intent, den der Klassifikator ohnehin gesetzt hat.
 *  - "Fristbezug" aus den Fristen der memory-engine (entity_profiles.
 *                 next_deadline_at) — genau die Daten, die das Fristen-Board
 *                 auf "Heute" zeigt. Kein neuer Klassifikator, keine Heuristik
 *                 auf dem Mailtext.
 *
 * Damit ist ein Chip immer erklaerbar: er filtert das, was UseEasy ohnehin
 * schon weiss. Findet sich nichts, wird der Chip gar nicht angezeigt.
 */

/** Intents/Labels, die eindeutig Geld betreffen. */
const MONEY_KEYS = [
  "invoice",
  "rechnung",
  "payment",
  "zahlung",
  "dunning",
  "mahnung",
  "offer",
  "angebot",
  "quote",
  "kostenvoranschlag",
  "gutschrift",
  "credit_note",
  "forderung",
  "billing",
  "ar_invoice",
];

function haystack(item: Record<string, unknown>): string {
  return [
    item.action_type,
    item.applied_core_key,
    item.category,
    item.label_reason_source,
    // label_reason ist der Klartext-Satz, den das Backend selbst gebildet hat
    // (buildLabelReason) — also weiterhin eine UseEasy-Aussage und kein Griff
    // in den Mailtext.
    item.label_reason,
  ]
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();
}

/** Geld-Bezug rein aus dem klassifizierten Intent — nicht aus dem Mailtext. */
export function isMoneyItem(item: Record<string, unknown>): boolean {
  const h = haystack(item);
  if (!h) return false;
  return MONEY_KEYS.some((k) => h.includes(k));
}

/**
 * Fristbezug: hat die Gegenstelle (Absender-Adresse) in der memory-engine eine
 * offene Frist innerhalb des Horizonts? `deadlineSenders` kommt als Set aus den
 * bereits geladenen entity_profiles — es wird nichts zusaetzlich gefetcht.
 */
export function isDeadlineItem(
  item: Record<string, unknown>,
  deadlineSenders: Set<string>,
): boolean {
  const sender = typeof item.sender === "string" ? item.sender.toLowerCase() : "";
  if (!sender || deadlineSenders.size === 0) return false;
  if (deadlineSenders.has(sender)) return true;
  // Absender kommen mal als "Name <mail@x.de>" — dann die Adresse herausziehen.
  const m = sender.match(/<([^>]+)>/);
  return !!m && deadlineSenders.has(m[1].trim());
}

/**
 * Baut das Set der Absender mit offener Frist aus den memory-Entities.
 * `withinDays` begrenzt auf den Horizont (Default 14 Tage); ueberfaellige
 * Fristen zaehlen immer mit.
 */
export function deadlineSenderSet(
  entities: Array<{ entity_email?: string | null; next_deadline_at?: string | null }> | undefined,
  withinDays = 14,
  now = Date.now(),
): Set<string> {
  const out = new Set<string>();
  const horizon = now + withinDays * 86_400_000;
  for (const e of entities ?? []) {
    const mail = e.entity_email?.trim().toLowerCase();
    const iso = e.next_deadline_at;
    if (!mail || !iso) continue;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    if (t <= horizon) out.add(mail);
  }
  return out;
}
