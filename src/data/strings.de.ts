/**
 * strings.de.ts – Centralized German microcopy for UseEasy Console
 * Single source of truth for all user-facing strings.
 */

// ─── Priority Labels ───
export const PRIORITY_LABELS: Record<string, { label: string; description: string }> = {
  P0: { label: "Sofort handeln", description: "Kritisch – sofortige Eskalation erforderlich." },
  P1: { label: "Zeitkritisch", description: "Zeitgebundene Aufgabe – baldige Bearbeitung nötig." },
  P2: { label: "Antwort empfohlen", description: "Empfohlene Antwort – kein dringendes Risiko." },
  P3: { label: "Kein Handlungsbedarf", description: "Info – keine Antwort nötig." },
};

// ─── Rejection Reasons (dropdown only, no freetext) ───
export const REJECTION_REASONS = [
  "Falscher Inhalt / Missverstanden",
  "Zu riskant / Unsicher",
  "Compliance/Legal unklar",
  "Kunde fragt etwas anderes",
  "Daten fehlen / Rückfrage nötig",
  "Tonalität passt nicht",
  "Preis/Angebot prüfen",
  "Zahlungs-/Bankdaten: manuell prüfen",
  "Sonstiges",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

// ─── Playbook Switch Warning ───
export const PLAYBOOK_SWITCH_WARNING = {
  title: "Playbook wechseln?",
  body: [
    "Du änderst das aktive Branchen-Playbook für diese Mailbox.",
    "Das kann Prioritäten (P0–P3) und Empfehlungen beeinflussen.",
    "Der Wechsel wird versioniert und im Audit protokolliert.",
  ],
  confirm: "Wechsel bestätigen",
  cancel: "Abbrechen",
};

// ─── Button Texts ───
export const BUTTONS = {
  approve: "Freigeben",
  reject: "Ablehnen",
  upgrade: "Plan upgraden",
  requestChange: "Änderung anfragen",
  createDraft: "Entwurf erstellen",
  export: "Exportieren",
  exportLocked: "Export (ab Scale-Plan)",
  activate: "Aktivieren",
  switchConfirm: "Wechsel bestätigen",
  cancel: "Abbrechen",
  close: "Schließen",
};

// ─── Locked Control ───
export const LOCKED = {
  tooltip: "Änderung nur per Ticket/Upgrade",
  description: "Diese Einstellung ist in deinem Plan gesperrt.",
  cta: "Änderung anfragen",
};

// ─── Audit Trail ───
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  approved: "Freigegeben",
  rejected: "Abgelehnt",
  sent: "Gesendet",
  pending: "Ausstehend",
  playbook_switch: "Playbook gewechselt",
};

// ─── Request Change Modal ───
export const REQUEST_CHANGE = {
  title: "Änderung anfragen",
  categories: ["Domains", "Approval-Regeln", "Mailboxen", "Playbooks", "Plan"],
  changeTypes: ["Hinzufügen", "Entfernen", "Anpassung"],
  urgencies: ["Normal", "Hoch", "Kritisch"],
  submit: "Anfrage senden",
  success: "Anfrage wurde gesendet.",
};

// ─── Review Queue ───
export const REVIEW = {
  title: "Review Queue",
  subtitle: "Sammel- & Nachhol-Ansicht: alle vorbereiteten Antworten gebündelt.",
  hint: "Einzelne Antworten gibst du am schnellsten direkt im Postfach frei (UseEasy-Button in Gmail/Outlook). Hier siehst du alles gebündelt — zum Abräumen, Nachholen und für Entwürfe mit vollem Kontext.",
  empty: "Alle Reviews erledigt",
  emptyDesc: "Keine offenen Vorschläge.",
  approvedToast: "Als Entwurf in deinem Postfach abgelegt.",
  editedToast: "Bearbeitet & als Entwurf in deinem Postfach abgelegt.",
  rejectedToast: "Vorschlag wurde verworfen.",
  generateDraft: "Entwurf generieren",
  generatingDraft: "Entwurf wird erstellt…",
  draftToBox: "Als Entwurf in dein Postfach legen",
  noDraftYet: "Noch kein Entwurf — kontextbasiert generieren.",
  detailHeading: "Warum diese Entscheidung?",
};

// ─── Settings ───
export const SETTINGS = {
  title: "Einstellungen",
  subtitle: "UseEasy-Konfiguration für deine Mailboxen.",
  mailboxLimitWarning: "Mailbox-Limit erreicht. Plan upgraden für mehr Mailboxen.",
  approvalRules: "Freigabe-Regeln",
  approvalRulesDesc: "Bestimme, welche E-Mails eine manuelle Freigabe erfordern.",
  domainLists: "Domain-Listen",
  businessHours: "Geschäftszeiten & SLA",
  planLimits: "Plan & Limits",
};

// ─── Playbooks Page ───
export const PLAYBOOKS_PAGE = {
  title: "Playbooks",
  subtitle: (active: number, limit: number) =>
    `Branchen-Playbooks für deine Mailboxen. ${active} / ${limit} aktiv.`,
  statusLabels: {
    aktiv: "aktiv",
    verfügbar: "verfügbar",
    gesperrt: "gesperrt",
  },
  activeFor: (mailbox: string) => `Aktives Playbook für ${mailbox}`,
  upgradeCta: "Plan upgraden / Ticket",
};
