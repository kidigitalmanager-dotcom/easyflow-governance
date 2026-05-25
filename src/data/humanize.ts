/**
 * humanize.ts — Uebersetzt technische Engine-Keys in menschenlesbares Deutsch
 * fuer die Console-Anzeige (Audit Trail, Review Queue). Reine Praesentation;
 * unbekannte Keys werden generisch „verschoenert" (kein Absturz, kein Roh-Key).
 */

const PLAYBOOK_LABELS: Record<string, string> = {
  ecom_core_v1: "E-Commerce (Standard)",
  ecom_core: "E-Commerce (Standard)",
  real_estate_core_v1: "Hausverwaltung",
  hv_real_estate_v1: "Hausverwaltung",
  global_core: "Allgemein",
  coaching_core_v1: "Coaching",
};

const DECISION_LABELS: Record<string, string> = {
  llm_judge: "KI-Einordnung",
  deterministic_match: "Eindeutiger Regel-Treffer",
  normal_flow: "Standard-Verarbeitung",
  "normal flow": "Standard-Verarbeitung",
  risk_hard_escalate: "Eskalation (Risiko erkannt)",
  pack_engine_auto_close: "Automatisch erledigt",
  pack_engine_human_review: "Zur manuellen Pruefung",
  opt_out_hard_stop: "Opt-out (gestoppt)",
  tenant_resolve_error: "Zuordnungsfehler",
};

const CATEGORY_LABELS: Record<string, string> = {
  label: "Eingeordnet & gelabelt",
  send: "Gesendet",
  reply: "Antwort-Entwurf",
  draft: "Entwurf erstellt",
  billing_payment: "Rechnung & Zahlung",
  request_order: "Anfrage & Auftrag",
  contract_legal: "Vertrag & Recht",
  support_issue: "Support & Stoerung",
  status_fulfillment: "Status & Abwicklung",
  returns_refund: "Rueckgabe & Erstattung",
  manual_review: "Manuelle Pruefung",
};

// Bekannte Pack-Rule-Keys → Klartext. Fallback: Praefix weg + Title-Case.
const RULE_LABELS: Record<string, string> = {
  E_noise_verification: "System-/Verifizierungs-Mail (i. d. R. keine Antwort noetig)",
  E_contract_agb_privacy: "Vertrag / AGB / Datenschutz",
  E_return_widerruf: "Rueckgabe / Widerruf",
  E_billing_invoice: "Rechnung / Zahlung",
  E_support_ticket: "Support-Anfrage",
  E_order_confirmation: "Bestellbestaetigung",
  E_delivery_notification: "Versandbenachrichtigung",
};

function prettify(raw: string): string {
  return String(raw || "")
    .replace(/^(E|RE|G|HV)_/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function humanizePlaybook(playbook?: string, version?: string): string {
  const key = String(playbook || "").trim();
  if (!key || key === "—") return "—";
  const name = PLAYBOOK_LABELS[key] || prettify(key);
  const v = String(version || "").trim();
  return v && v !== "" ? `${name} · Regelstand ${v}` : name;
}

export function humanizeDecision(decision?: string): string {
  const key = String(decision || "").trim();
  if (!key || key === "—") return "—";
  return DECISION_LABELS[key] || prettify(key);
}

export function humanizeCategory(category?: string): string {
  const key = String(category || "").trim();
  if (!key) return "—";
  return CATEGORY_LABELS[key] || prettify(key);
}

export function humanizeRule(ruleKey?: string): string {
  const key = String(ruleKey || "").trim();
  if (!key) return "";
  return RULE_LABELS[key] || prettify(key);
}

/**
 * „Warum": macht aus Maschinen-Summaries wie
 * "Deterministic match: E_noise_verification" lesbares Deutsch. Echte
 * LLM-Summaries (bereits Deutsch) bleiben unveraendert.
 */
export function humanizeReason(reason?: string): string {
  const r = String(reason || "").trim();
  if (!r) return "—";
  const m = r.match(/^Deterministic match:\s*(.+)$/i);
  if (m) return `Eindeutiger Regel-Treffer: ${humanizeRule(m[1])}`;
  const m2 = r.match(/^Matched rule:\s*(.+)$/i);
  if (m2) return `Regel-Treffer: ${humanizeRule(m2[1])}`;
  return r;
}

export function humanizeActor(actor?: string): string {
  const a = String(actor || "").trim();
  if (!a || a === "UseEasy") return "UseEasy (automatisch)";
  if (a === "autopilot") return "Autopilot";
  const h = a.match(/^human:(.+)$/i);
  if (h) return `Du (${h[1]})`;
  return a;
}

/** Konfidenz: null/0 → „nicht ermittelt", sonst Prozent. */
export function humanizeConfidence(confidence?: number | null): string {
  if (confidence == null || !(confidence > 0)) return "nicht ermittelt";
  return `${(confidence * 100).toFixed(0)} %`;
}
