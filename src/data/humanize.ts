/**
 * humanize.ts — Uebersetzt technische Engine-Keys in menschenlesbares Deutsch
 * fuer die Console-Anzeige (Audit Trail, Review Queue). Reine Praesentation;
 * unbekannte Keys werden generisch „verschoenert" (kein Absturz, kein Roh-Key).
 */

const PLAYBOOK_LABELS: Record<string, string> = {
  ecom_core_v1: "E-Commerce (Standard)",
  ecom_core: "E-Commerce (Standard)",
  real_estate_core_v1: "Hausverwaltung",
  bau_core_v1: "Bau & Handwerk",
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
  code_noise: "Verifizierungscode – kein Handlungsbedarf",
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

// ── v4.18.4: Konfidenz-Ampel + Entscheidungs-Story ──────────────────────────
export type ConfTone = "high" | "mid" | "low" | "none";

export function confidenceTone(c?: number | null): ConfTone {
  if (c == null || !(c > 0)) return "none";
  if (c >= 0.9) return "high";
  if (c >= 0.75) return "mid";
  return "low";
}

export function confidenceWord(c?: number | null): string {
  switch (confidenceTone(c)) {
    case "high": return "Sehr sicher";
    case "mid": return "Eher sicher";
    case "low": return "Unsicher – bitte prüfen";
    default: return "nicht ermittelt";
  }
}

export interface DecisionStep {
  icon: string;            // Key → Lucide-Icon in der Komponente
  title: string;
  detail?: string;
  tone?: "default" | "good" | "warn" | "stop";
}

// Baut aus einem Audit-Eintrag eine verständliche Schritt-für-Schritt-Story.
export function buildDecisionSteps(e: Record<string, unknown>): DecisionStep[] {
  const get = (k: string) => (e?.[k] as string) ?? "";
  const decision = humanizeDecision(get("decision"));
  const steps: DecisionStep[] = [];

  steps.push({
    icon: "mail",
    title: "E-Mail empfangen",
    detail: get("mailbox") && get("mailbox") !== "—" ? `von ${get("mailbox")}` : undefined,
  });

  steps.push({
    icon: "tag",
    title: `Eingeordnet als „${humanizeCategory(get("category"))}"`,
    detail: [humanizePlaybook(get("playbook"), get("playbook_version")), confidenceWord(e?.confidence as number)]
      .filter(Boolean).join(" · "),
  });

  let decIcon = "route";
  let decTone: DecisionStep["tone"] = "default";
  const dp = (get("decision") || "").toLowerCase();
  if (dp.includes("opt") || /gestoppt/i.test(decision)) { decIcon = "stop"; decTone = "stop"; }
  else if (/risiko|eskal/i.test(decision)) { decIcon = "alert"; decTone = "warn"; }
  else if (/erledigt|geschlossen/i.test(decision)) { decIcon = "check"; decTone = "good"; }
  else if (/pr[üu]fung/i.test(decision)) { decIcon = "user"; decTone = "warn"; }
  const why = humanizeReason(get("reason"));
  steps.push({ icon: decIcon, tone: decTone, title: decision, detail: why !== "—" ? why : undefined });

  const OUT: Record<string, { t: string; i: string; tone: DecisionStep["tone"] }> = {
    approved: { t: "Freigegeben & als Entwurf abgelegt", i: "check", tone: "good" },
    rejected: { t: "Verworfen", i: "x", tone: "stop" },
    sent: { t: "Gesendet", i: "send", tone: "good" },
    pending: { t: "Wartet auf deine Freigabe", i: "clock", tone: "warn" },
    needs_review: { t: "Wartet auf deine Prüfung", i: "clock", tone: "warn" },
    dismissed: { t: "Aus der Queue entfernt", i: "x", tone: "default" },
    processed: { t: "Eingeordnet & gelabelt – keine Antwort nötig", i: "tag", tone: "default" },
  };
  const ua = get("user_action");
  const o = OUT[ua] || { t: humanizeCategory(ua) || "Verarbeitet", i: "tag", tone: "default" };
  steps.push({ icon: o.i, tone: o.tone, title: o.t, detail: get("actor") ? `durch ${humanizeActor(get("actor"))}` : undefined });

  return steps;
}

export function decisionTakeaway(e: Record<string, unknown>): string {
  const ua = (e?.user_action as string) ?? "";
  if (ua === "pending" || ua === "needs_review") return "Bitte prüfen und freigeben – oder verwerfen.";
  if (ua === "approved") return "Erledigt: liegt als Entwurf in deinem Postfach, du musst nur noch senden.";
  if (ua === "sent") return "Wurde versendet.";
  if (ua === "rejected" || ua === "dismissed") return "Wurde verworfen – keine weitere Aktion nötig.";
  return "Automatisch eingeordnet – keine Aktion von dir nötig.";
}


// ── v4.18.4: Shadow-Transparenz (autopilot_log.decision → Deutsch) ──────────
const SHADOW_LABELS: Record<string, string> = {
  shadow_would_send: "Hätte automatisch geantwortet",
  shadow_would_hold: "Hätte zurückgehalten (zur Prüfung)",
  queued_for_send: "Hätte automatisch versendet",
  sent: "Automatisch versendet",
  held_low_conf: "Zurückgehalten: Konfidenz zu niedrig",
  held_risk_flag: "Zurückgehalten: Risiko-Markierung",
  held_not_whitelisted: "Zurückgehalten: Kategorie nicht für Autopilot freigegeben",
  held_no_maturity: "Zurückgehalten: noch nicht genug gelernt",
  held_disabled: "Autopilot ist aus",
  held_kill_switch: "Not-Aus aktiv",
  held_daily_cap: "Tageslimit erreicht",
  not_implemented_yet: "Aktion im Autopilot noch nicht aktiv",
  killed: "Abgebrochen",
  send_failed_fallback_human: "Auto-Versand fehlgeschlagen → an Mensch übergeben",
};
export function humanizeShadow(decision?: string | null): string {
  const k = String(decision || "").trim();
  if (!k) return "";
  return SHADOW_LABELS[k] || prettify(k);
}

// ── v4.43.0: Autopilot-Modus → Klartext + Pille ("Would-Do"-Anzeige) ────────
// Bestätigte Copy (Leon, 2026-05-30): shadow=Vorschau, assisted=Vorbereitet,
// autonomous=Automatisch. Voller Satz fuer Tooltip/Zeile.
export type AutopilotMode = "shadow" | "assisted" | "autonomous" | "off";
const MODE_PILL: Record<string, string> = {
  shadow: "Vorschau",
  assisted: "Vorbereitet",
  autonomous: "Automatisch",
};
export function modePillLabel(mode?: string | null): string {
  return MODE_PILL[String(mode || "").trim()] || "";
}
const MODE_SENTENCE: Record<string, string> = {
  shadow: "So würde UseEasy das erledigen",
  assisted: "UseEasy hat das vorbereitet — du gibst frei",
  autonomous: "UseEasy erledigt das automatisch",
};
export function modeSentence(mode?: string | null): string {
  return MODE_SENTENCE[String(mode || "").trim()] || "";
}
export function modeTone(mode?: string | null): "shadow" | "assisted" | "autonomous" | "off" {
  const m = String(mode || "").trim();
  if (m === "shadow" || m === "assisted" || m === "autonomous") return m;
  return "off";
}


// ── v4.18.7/v4.18.8: Antwort-Typ (reply | action | info) ────────────────────
// Primär aus dem Backend-Feld response_type (v4.18.8, read-time abgeleitet).
// Fallback (Altbestand / fehlendes Feld): No-Reply-/Benachrichtigungs-Absender
// → info, sonst reply.
export type ResponseType = "reply" | "action" | "info";

const NOREPLY_RE = /(no-?reply|do-?not-?reply|donotreply|notification|notifications|mailer-daemon|postmaster|automated|^security@|noreply@|no-reply@)/i;
export function isNoReplySender(addr?: string): boolean {
  const a = String(addr || "");
  return NOREPLY_RE.test(a);
}

export function responseType(e: Record<string, unknown>): ResponseType {
  const rt = String((e?.response_type ?? "") as string).trim();
  if (rt === "reply" || rt === "action" || rt === "info") return rt;
  // Fallback für Rows vor v4.18.8 / fehlendes Feld.
  const sender = String((e?.sender ?? e?.mailbox ?? "") as string);
  return isNoReplySender(sender) ? "info" : "reply";
}

const RESPONSE_TYPE_LABELS: Record<ResponseType, string> = {
  reply: "Antwort empfohlen",
  action: "Aktion empfohlen",
  info: "Kein Handlungsbedarf",
};
export function responseTypeLabel(rt: ResponseType): string {
  return RESPONSE_TYPE_LABELS[rt] ?? RESPONSE_TYPE_LABELS.reply;
}

// Rückwärtskompatibel: Label-Override für PriorityBadge. reply → undefined
// (PriorityBadge nutzt sein Standard-Label), sonst der Antwort-Typ-Text.
export function responseLabel(e: Record<string, unknown>): string | undefined {
  const rt = responseType(e);
  return rt === "reply" ? undefined : responseTypeLabel(rt);
}

// Ersetzt die technischen Pseudonymisierungs-Marker (aus der PII-Redaktion vor
// dem LLM) durch lesbare Platzhalter fuer die Anzeige, z. B. [PHONE] -> [Telefonnummer].
const REDACTION_LABELS: Record<string, string> = {
  PHONE: "Telefonnummer",
  EMAIL: "E-Mail",
  IBAN: "IBAN",
  NAME: "Name",
  ADDRESS: "Adresse",
  CARD: "Kartennummer",
  URL: "Link",
};
export function prettyRedaction(text?: string | null): string {
  if (!text) return text ?? "";
  return text.replace(/\[([A-Z_]+)\]/g, (full, key: string) => {
    const label = REDACTION_LABELS[key];
    return label ? `[${label}]` : full;
  });
}
