/**
 * humanize.ts — Uebersetzt technische Engine-Keys in menschenlesbares Deutsch
 * fuer die Console-Anzeige (Audit Trail, Review Queue). Reine Praesentation;
 * unbekannte Keys werden generisch „verschoenert" (kein Absturz, kein Roh-Key).
 */

// Anzeigenamen der Regel-Pakete. Bewusst identisch zum Backend
// (_packDisplayDe in index.js), damit Console und MiniUI dasselbe sagen.
const PLAYBOOK_LABELS: Record<string, string> = {
  ecom_core_v1: "E-Commerce-Paket",
  ecom_core: "E-Commerce-Paket",
  real_estate_core_v1: "Hausverwaltungs-Paket",
  hv_real_estate_v1: "Hausverwaltungs-Paket",
  bau_core_v1: "Bau & Handwerk-Paket",
  global_core: "Basis-Paket",
  global_core_v1: "Basis-Paket",
  coaching_core_v1: "Coaching-Paket",
  finanzen_core_v1: "Finanz-Paket",
  telecom_core_v1: "Telekommunikations-Paket",
};

const DECISION_LABELS: Record<string, string> = {
  llm_judge: "KI-Einordnung",
  llm_judge_none: "KI-Einordnung (ohne Regel-Treffer)",
  llm_judge_fallback_deterministic: "KI unsicher, Regelwerk hat uebernommen",
  llm_judge_fallback_force_review: "KI unsicher, zur Pruefung gegeben",
  llm_judge_disabled: "Regelwerk (KI nicht befragt)",
  deterministic_match: "Eindeutiger Regel-Treffer",
  deterministic_assisted: "Regel-Treffer mit Freigabe",
  deterministic_force_review: "Regel-Treffer, zur Pruefung",
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

// audit_log.category traegt bei Label-Zeilen nur den AKTIONSTYP ("label"),
// nicht den Kategorienamen. Diese Keys duerfen nie als Label ausgegeben werden.
const ACTION_TYPE_KEYS = new Set(["label", "send", "reply", "draft", "noop", "read"]);

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

/** Paketname ohne Versions-Anhang (fuer die Story). */
export function playbookName(playbook?: string): string {
  const key = String(playbook || "").trim();
  if (!key || key === "—") return "";
  return PLAYBOOK_LABELS[key] || prettify(key);
}

/** Paketname mit Regelwerk-Stand (fuer die technischen Details). */
export function humanizePlaybook(playbook?: string, version?: string): string {
  const name = playbookName(playbook);
  if (!name) return "—";
  const v = String(version || "").trim();
  return v ? `${name} (Regelwerk-Stand ${v})` : name;
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

/**
 * Catch-all-/Default-Regeln (P9-Klasse) erkennen. Ein Treffer darauf ist KEIN
 * "eindeutiger Regel-Treffer", sondern heisst nur, dass keine spezifische Regel
 * gegriffen hat. Das als Treffer zu verkaufen war der Widerspruch im Verlauf.
 */
export function isDefaultRule(ruleKey?: string | null): boolean {
  const k = String(ruleKey || "").toLowerCase();
  if (!k) return false;
  return /default|catch_?all|fallback/.test(k);
}

/** Zieht den Regel-Key aus einer Maschinen-Summary ("Deterministic match: X"). */
export function extractRuleKey(reason?: string | null): string | null {
  const r = String(reason || "").trim();
  const m = r.match(/^(?:Deterministic match|Matched rule|Pack rule)\s*:\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

export function humanizeRule(ruleKey?: string): string {
  const key = String(ruleKey || "").trim();
  if (!key) return "";
  if (RULE_LABELS[key]) return RULE_LABELS[key];
  if (isDefaultRule(key)) return "Standard-Zuordnung (keine spezifische Regel)";
  return prettify(key);
}

/**
 * „Warum": macht aus Maschinen-Summaries wie
 * "Deterministic match: E_noise_verification" lesbares Deutsch. Echte
 * LLM-Summaries (bereits Deutsch) bleiben unveraendert.
 */
export function humanizeReason(reason?: string): string {
  const r = String(reason || "").trim();
  if (!r) return "—";
  const key = extractRuleKey(r);
  if (key) {
    return isDefaultRule(key)
      ? "Keine spezifische Regel getroffen, es griff die Standard-Zuordnung des Pakets"
      : `Regel-Treffer: ${humanizeRule(key)}`;
  }
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

/**
 * Das TATSAECHLICH im Postfach gesetzte Label (v4.21.0 applied_label).
 * Faellt auf den Core-Key zurueck; `category` wird nur genutzt, wenn dort
 * wirklich eine Kategorie steht und nicht der Aktionstyp.
 */
export function appliedLabelText(e: Record<string, unknown>): string {
  const applied = String((e?.applied_label ?? "") as string).trim();
  if (applied) return applied;
  const coreKey = String((e?.applied_core_key ?? "") as string).trim();
  if (coreKey) return humanizeCategory(coreKey);
  const cat = String((e?.category ?? "") as string).trim();
  if (cat && !ACTION_TYPE_KEYS.has(cat)) return humanizeCategory(cat);
  return "";
}

export interface DecisionStep {
  icon: string;            // Key → Lucide-Icon in der Komponente
  title: string;
  detail?: string;
  tone?: "default" | "good" | "warn" | "stop";
}

// ── Eine einzige, widerspruchsfreie Erklaerung des Entscheidungswegs ────────
// Vorher standen hier zwei Quellen nebeneinander (decision_path vs. Roh-Summary)
// und konnten sich widersprechen ("KI-Einordnung" + "Eindeutiger Regel-Treffer").
// Jetzt gewinnt die Backend-Begruendung (label_reason, v4.57.0) und ein
// Default-Regel-Treffer wird ehrlich als "keine spezifische Regel" benannt.
export interface DecisionExplanation {
  title: string;
  text: string;
  icon: string;
  tone: "default" | "good" | "warn" | "stop";
  source: string;
}

const KIND_TITLE: Record<string, string> = {
  rule: "Feste Regel hat entschieden",
  ki: "KI hat entschieden (keine feste Regel)",
  risk: "Sicherheitsregel hat eingegriffen",
  optout: "Opt-out-Schutz hat gestoppt",
  noise: "Als automatische System-Mail erkannt",
};
const KIND_ICON: Record<string, string> = {
  rule: "check", ki: "sparkles", risk: "alert", optout: "stop", noise: "stop",
};
const KIND_TONE: Record<string, DecisionExplanation["tone"]> = {
  rule: "good", ki: "default", risk: "warn", optout: "stop", noise: "default",
};
const KIND_SOURCE: Record<string, string> = {
  rule: "Feste Regel", ki: "KI-Einschätzung", risk: "Sicherheitsregel",
  optout: "Schutzregel", noise: "Feste Regel",
};

export function explainDecision(e: Record<string, unknown>): DecisionExplanation {
  const get = (k: string) => String((e?.[k] ?? "") as string).trim();
  const path = get("decision");
  const ruleKey = extractRuleKey(get("reason"));
  const usedDefaultRule = isDefaultRule(ruleKey);
  const pack = playbookName(get("playbook"));
  const packPhrase = pack.endsWith("-Paket") ? ` des ${pack}s` : "";

  // Art der Entscheidung: Backend-Feld gewinnt, sonst aus dem Pfad ableiten.
  let kind = get("label_reason_kind");
  if (!kind) {
    if (/opt_out/.test(path)) kind = "optout";
    else if (/code_noise/.test(path)) kind = "noise";
    else if (/risk_hard/.test(path)) kind = "risk";
    else if (/llm_judge/.test(path)) kind = "ki";
    else if (path) kind = "rule";
    else kind = "ki";
  }
  // Ein Default-Regel-Treffer ist kein echter Regel-Treffer.
  if (kind === "rule" && usedDefaultRule) kind = "ki";

  const parts: string[] = [];
  const backendText = get("label_reason");
  if (backendText) {
    parts.push(backendText);
  } else {
    const label = appliedLabelText(e);
    const lbl = label ? ` als „${label}"` : "";
    if (kind === "rule" && ruleKey) parts.push(`Erkannt über die feste Regel „${humanizeRule(ruleKey)}"${packPhrase}${lbl ? `, einsortiert${lbl}` : ""}.`);
    else if (kind === "rule") parts.push(`Erkannt über eine feste Regel${packPhrase}${lbl ? `, einsortiert${lbl}` : ""}.`);
    else if (kind === "risk") parts.push("Eine Sicherheitsregel hat angeschlagen, deshalb ging die E-Mail zur manuellen Prüfung.");
    else if (kind === "optout") parts.push("Abmelde- oder Widerspruchs-Hinweis erkannt, deshalb keine weitere automatische Verarbeitung.");
    else if (kind === "noise") parts.push("Automatischer Verifizierungscode erkannt, bewusst kein Kategorie-Label gesetzt.");
    else parts.push(`Keine feste Regel hat gegriffen, die KI hat den Inhalt${lbl ? ` ${lbl}` : ""} eingeordnet.`);
  }

  if (usedDefaultRule) {
    parts.push(`Es griff nur die Standard-Zuordnung${packPhrase}, keine spezifische Regel.`);
  }
  if (kind === "ki" && confidenceTone(e?.confidence as number | null) === "low") {
    parts.push("Die KI war sich dabei unsicher, eine kurze Kontrolle ist sinnvoll.");
  }

  return {
    title: KIND_TITLE[kind] || KIND_TITLE.ki,
    text: parts.join(" "),
    icon: KIND_ICON[kind] || "sparkles",
    tone: KIND_TONE[kind] || "default",
    source: get("label_reason_source") || KIND_SOURCE[kind] || KIND_SOURCE.ki,
  };
}

// Baut aus einem Audit-Eintrag eine verständliche Schritt-für-Schritt-Story.
export function buildDecisionSteps(e: Record<string, unknown>): DecisionStep[] {
  const get = (k: string) => (e?.[k] as string) ?? "";
  const steps: DecisionStep[] = [];

  steps.push({
    icon: "mail",
    title: "E-Mail empfangen",
    detail: get("mailbox") && get("mailbox") !== "—" ? `von ${get("mailbox")}` : undefined,
  });

  // Schritt 2: das TATSAECHLICH gesetzte Postfach-Label, nicht der Aktionstyp.
  const label = appliedLabelText(e);
  const pack = playbookName(get("playbook"));
  steps.push({
    icon: "tag",
    title: label ? `Einsortiert als „${label}"` : "Kein Kategorie-Label gesetzt",
    detail: pack ? `Regelwerk: ${pack}` : undefined,
  });

  // Schritt 3: EIN widerspruchsfreier Entscheidungsweg.
  const ex = explainDecision(e);
  steps.push({ icon: ex.icon, tone: ex.tone, title: ex.title, detail: ex.text });

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

/**
 * Klartext-Fazit. Beruecksichtigt die Konfidenz: bei unsicherer Einordnung
 * darf hier nicht "keine Aktion noetig" stehen, waehrend die Ampel rot ist.
 */
export function decisionTakeaway(e: Record<string, unknown>): string {
  const ua = (e?.user_action as string) ?? "";
  if (ua === "pending" || ua === "needs_review") return "Bitte prüfen und freigeben – oder verwerfen.";
  if (ua === "approved") return "Erledigt: liegt als Entwurf in deinem Postfach, du musst nur noch senden.";
  if (ua === "sent") return "Wurde versendet.";
  if (ua === "rejected" || ua === "dismissed") return "Wurde verworfen – keine weitere Aktion nötig.";

  const label = appliedLabelText(e);
  const asLabel = label ? `als „${label}" ` : "";
  if (confidenceTone(e?.confidence as number | null) === "low") {
    return `Automatisch ${asLabel}einsortiert, aber die Einordnung ist unsicher. Bitte kurz prüfen und unten korrigieren, falls die Kategorie nicht passt.`;
  }
  return `Automatisch ${asLabel}einsortiert, keine Aktion von dir nötig.`;
}


// ── v4.18.4: Shadow-Transparenz (autopilot_log.decision → Deutsch) ──────────
const SHADOW_LABELS: Record<string, string> = {
  shadow_would_send: "Hätte automatisch geantwortet",
  shadow_would_qualify: "Hätte automatisch geantwortet, sobald ein Entwurf vorliegt",
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

/**
 * Was der Autopilot-Vergleich konkret bedeutet. Die reine Zustandszeile
 * ("Hätte zurückgehalten") sagt einem Nicht-Techniker nichts.
 */
export interface ShadowExplanation {
  title: string;
  text: string;
  tone: "good" | "warn" | "neutral";
  wouldSend: boolean;
}
export function shadowExplain(decision?: string | null): ShadowExplanation | null {
  const k = String(decision || "").trim();
  if (!k) return null;
  const sendKeys = ["shadow_would_send", "queued_for_send", "sent"];
  if (sendKeys.includes(k)) {
    return {
      title: "Hätte diese E-Mail selbst beantwortet",
      text: "Mit aktivem Autopilot wäre die Antwort ohne Rückfrage rausgegangen. Weil du im Vorschau-Modus bist, ist es beim Entwurf geblieben.",
      tone: "good",
      wouldSend: true,
    };
  }
  if (k === "shadow_would_qualify") {
    return {
      title: "Hätte automatisch geantwortet, sobald ein Entwurf vorliegt",
      text: "Die Einordnung erfüllt alle Voraussetzungen für den Autopilot. Es fehlte nur der fertige Entwurf, weil UseEasy Entwürfe erst auf Anforderung schreibt.",
      tone: "good",
      wouldSend: false,
    };
  }
  if (k === "killed") {
    return { title: "Wurde abgebrochen", text: "Der Autopilot hat den Vorgang gestoppt.", tone: "warn", wouldSend: false };
  }
  if (k === "send_failed_fallback_human") {
    return {
      title: "Automatischer Versand ist fehlgeschlagen",
      text: "Der Vorgang wurde an dich zurückgegeben, damit nichts verloren geht.",
      tone: "warn",
      wouldSend: false,
    };
  }
  return {
    title: "Hätte NICHT von allein geantwortet",
    text: "Auch mit aktivem Autopilot wäre diese E-Mail bei dir gelandet. UseEasy hätte sie nicht ohne deine Freigabe beantwortet.",
    tone: "warn",
    wouldSend: false,
  };
}

// Gruende, warum der Autopilot zurueckgehalten haette (autopilot_log.reasons).
const SHADOW_REASON_LABELS: Record<string, string> = {
  held_low_conf: "Die Einordnung war der KI nicht sicher genug",
  held_risk_flag: "Ein Risiko-Signal wurde erkannt (z. B. Recht, Beschwerde, Zahlung)",
  held_not_whitelisted: "Diese Kategorie ist für den Autopilot nicht freigegeben",
  held_hard_block_intent: "Diese Kategorie darf grundsätzlich nie automatisch beantwortet werden",
  held_hard_block_action_type: "Diese Aktionsart darf nie automatisch laufen",
  held_unknown_action_type: "Unbekannte Aktionsart",
  held_no_maturity: "UseEasy hat für diese Kategorie noch nicht genug gelernt",
  held_high_mismatch: "In der Lernphase gab es zu viele Abweichungen",
  held_high_edit_rate: "Du hast zuletzt zu viele Entwürfe nachbearbeitet",
  held_disabled: "Der Autopilot ist für dieses Postfach ausgeschaltet",
  held_kill_switch: "Der Not-Aus für den Autopilot ist aktiv",
  held_no_policy: "Für dieses Postfach ist noch keine Autopilot-Regel hinterlegt",
  held_legal_basis: "Die rechtliche Freigabe für den autonomen Versand fehlt noch",
  held_no_need_reply: "Diese E-Mail braucht keine Antwort",
  held_need_reply_fallback: "Es war nicht eindeutig, ob eine Antwort nötig ist",
  held_no_body: "Es lag kein Entwurfstext vor",
  held_body_too_short: "Der Entwurf war zu kurz für einen automatischen Versand",
  held_no_confidence: "Es lag kein Sicherheitswert vor",
  held_no_threshold: "Für diese Kategorie ist keine Schwelle hinterlegt",
  held_no_core_key: "Die Kategorie konnte nicht eindeutig bestimmt werden",
  held_daily_cap: "Das Tageslimit für automatische Antworten ist erreicht",
  not_implemented_yet: "Diese Aktion kann der Autopilot noch nicht ausführen",
};

/** Nimmt autopilot_log.reasons (Array, JSON-String oder Objekt) und liefert Klartext. */
export function shadowReasonList(raw: unknown): string[] {
  let val: unknown = raw;
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return [];
    try { val = JSON.parse(s); } catch { return [SHADOW_REASON_LABELS[s] || s]; }
  }
  const arr = Array.isArray(val) ? val : val ? [val] : [];
  const out: string[] = [];
  for (const item of arr) {
    let code = "";
    if (typeof item === "string") code = item;
    else if (item && typeof item === "object") code = String((item as Record<string, unknown>).code ?? "");
    if (!code) continue;
    const label = SHADOW_REASON_LABELS[code];
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
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
