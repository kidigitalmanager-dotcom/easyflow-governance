// jana-chat/core.ts — reine, seiteneffektfreie Logik fuer den Jana-Chat.
// Deno-frei + Netzwerk-frei, damit sie mit `node --experimental-strip-types`
// testbar ist (die eigentliche I/O-Schale liegt in index.ts).
//
// Kernaufgabe: aus dem (bereits PII-freien) cap_*-Datenbuendel einen kompakten
// CONTEXT bauen, den das LLM zitieren MUSS, dazu die Anti-Blackbox-Regeln, eine
// robuste JSON-Extraktion + Zitat-Validierung (kein erfundener Beleg) und die
// deterministische Wochen-Prioritaeten-Rangliste (KEIN LLM noetig).

// ── Typen ──────────────────────────────────────────────────────────────────
export type Provenance = {
  method?: string;
  sources_used?: string[];
  formula?: string;
  input?: Record<string, unknown>;
};

export type RawMetric = {
  metric_key: string;
  name?: string | null;
  short_code?: string | null;
  category_key?: string | null;
  value: number | null;
  period?: string | null;
  confidence?: number | null;
  coverage?: number | null;
  direction?: string | null;
  unit?: string | null;
  measures?: string | null;
  is_predictive?: boolean | null;
  provenance?: Provenance | null;
};

export type RawAlert = {
  id?: number | string;
  scope?: string;
  subject_key?: string;
  kind?: string;
  severity?: string;
  severity_rank?: number;
  status?: string;
  message?: string;
  value_now?: number | null;
  slope?: number | null;
  period?: string | null;
  window_months?: number | null;
  confidence?: number | null;
  first_detected_at?: string | null;
};

export type RawCategory = {
  category_key: string;
  name?: string | null;
  category_score: number | null;
  period?: string | null;
};

export type RawHealth = { period: string; health_score: number | null };
export type RawFreshness = { metric_key?: string; source_key?: string; status?: string; last_period?: string | null };
export type RawDivergence = {
  comms_score?: number | null;
  comms_slope6?: number | null;
  financial_score?: number | null;
  financial_slope6?: number | null;
  external_score?: number | null;
  comms_minus_financial?: number | null;
  signal_class?: string | null;
  divergence_score?: number | null;
} | null;

export type RawBundle = {
  account?: { name?: string | null; slug?: string | null; vertical?: string | null };
  latest_period?: string | null;
  health_series?: RawHealth[];
  categories?: RawCategory[];
  metrics?: RawMetric[];
  alerts?: RawAlert[];
  freshness?: RawFreshness[];
  divergence?: RawDivergence;
  source_names?: Record<string, string>;
};

export type CtxMetric = {
  key: string;
  name: string;
  category_key: string | null;
  value: number | null;
  period: string | null;
  band: string;
  confidence: number | null;
  direction: string | null;
  measures: string | null;
  sources: string[];
  method: string | null;
  formula: string | null;
};

export type CtxAlert = {
  id: string;
  scope: string;
  subject_key: string;
  kind: string;
  severity: string;
  severity_rank: number;
  message: string;
  value_now: number | null;
  slope: number | null;
  period: string | null;
  window_months: number | null;
  tier: string;
};

export type CtxCategory = { key: string; name: string; score: number | null; period: string | null; band: string };

export type JanaContext = {
  account: { name: string; vertical: string | null; latest_period: string | null };
  health_now: number | null;
  health_prev: number | null;
  health_slope6: number | null;
  categories: CtxCategory[];
  metrics: CtxMetric[];
  alerts: CtxAlert[];
  divergence: RawDivergence;
  stale_signals: Array<{ metric_key: string; source_key: string; status: string; last_period: string | null }>;
  sources: Record<string, string>;
};

export type Citation = {
  type: "kpi" | "source" | "alert" | "category" | "health" | "divergence";
  key: string;
  label?: string;
  value?: number | null;
  period?: string | null;
};

export type WeeklyPriority = {
  rank: number;
  title: string;
  severity: string;
  kind: string;
  handlung: string;
  beleg: { kpi: string | null; value: number | null; period: string | null; sources: string[] };
  tier: string;
  alert_id: string;
};

// ── Bänder (gespiegelt aus src/lib/capital.ts) ───────────────────────────────
export const RED_THRESHOLD = 50;
export function bandFor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "unbekannt";
  if (v >= 70) return "gesund";
  if (v >= RED_THRESHOLD) return "beobachten";
  return "kritisch";
}

// trailing least-squares slope (spiegelt trailingSlope in src/lib/capital.ts)
export function trailingSlope(values: Array<number | null | undefined>, window = 6): number | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x)).slice(-window);
  if (v.length < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < v.length; i++) { sx += i; sy += v[i]; sxx += i * i; sxy += i * v[i]; }
  const d = v.length * sxx - sx * sx;
  return d === 0 ? null : (v.length * sxy - sx * sy) / d;
}

// ── PII-Redaktion des Nutzer-Freitexts (cap_* ist PII-frei, aber der Nutzer
//    koennte Namen/Mails/Nummern tippen) ────────────────────────────────────
export function redactPII(text: string): string {
  let s = String(text ?? "");
  // E-Mail
  s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]");
  // IBAN (grob: 2 Buchstaben + 2 Ziffern + 10-30 alnum)
  s = s.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, "[iban]");
  // Telefon (internationale + nationale Formen, mind. 7 Ziffern)
  s = s.replace(/(?:\+?\d[\d\s()/.-]{6,}\d)/g, (m) => (m.replace(/\D/g, "").length >= 7 ? "[telefon]" : m));
  // lange Ziffernfolgen (Kunden-/Vertragsnummern) — nach Telefon, damit Jahre bleiben
  s = s.replace(/\b\d{7,}\b/g, "[nummer]");
  return s.replace(/\s+/g, " ").trim();
}

// ── CONTEXT-Aufbau (kompakt, PII-frei, zitierbar) ────────────────────────────
export function shapeContext(raw: RawBundle): JanaContext {
  const sourceNames = raw.source_names ?? {};
  const series = (raw.health_series ?? []).filter((h) => h && h.period);
  const healthVals = series.map((h) => h.health_score);
  const health_now = series.length ? series[series.length - 1].health_score : null;
  const health_prev = series.length >= 2 ? series[series.length - 2].health_score : null;
  const health_slope6 = trailingSlope(healthVals, 6);

  const metrics: CtxMetric[] = (raw.metrics ?? []).map((m) => {
    const prov = (m.provenance && typeof m.provenance === "object" ? m.provenance : {}) as Provenance;
    return {
      key: m.metric_key,
      name: stripSuffix(m.name ?? m.metric_key),
      category_key: m.category_key ?? null,
      value: numOrNull(m.value),
      period: m.period ?? null,
      band: bandFor(numOrNull(m.value)),
      confidence: numOrNull(m.confidence),
      direction: m.direction ?? null,
      measures: firstClause(m.measures),
      sources: Array.isArray(prov.sources_used) ? prov.sources_used.map(String) : [],
      method: prov.method ? String(prov.method) : null,
      formula: typeof prov.formula === "string" && prov.formula.trim() ? prov.formula.trim() : null,
    };
  });

  const categories: CtxCategory[] = (raw.categories ?? []).map((c) => ({
    key: c.category_key,
    name: c.name ?? c.category_key,
    score: numOrNull(c.category_score),
    period: c.period ?? null,
    band: bandFor(numOrNull(c.category_score)),
  }));

  const alerts: CtxAlert[] = (raw.alerts ?? [])
    .filter((a) => (a.status ?? "open") === "open")
    .map((a) => ({
      id: String(a.id ?? `${a.scope ?? "?"}:${a.subject_key ?? "?"}:${a.kind ?? "?"}`),
      scope: a.scope ?? "",
      subject_key: a.subject_key ?? "",
      kind: a.kind ?? "",
      severity: a.severity ?? "info",
      severity_rank: numOr(a.severity_rank, 0),
      message: a.message ?? "",
      value_now: numOrNull(a.value_now),
      slope: numOrNull(a.slope),
      period: a.period ?? null,
      window_months: numOrNull(a.window_months),
      tier: alertTier(a),
    }))
    .sort((x, y) => y.severity_rank - x.severity_rank);

  const stale = (raw.freshness ?? [])
    .filter((f) => f && (f.status === "stale" || f.status === "dead"))
    .map((f) => ({ metric_key: f.metric_key ?? "", source_key: f.source_key ?? "", status: f.status ?? "", last_period: f.last_period ?? null }));

  return {
    account: { name: raw.account?.name ?? "Ihr Profil", vertical: raw.account?.vertical ?? null, latest_period: raw.latest_period ?? (series.length ? series[series.length - 1].period : null) },
    health_now: numOrNull(health_now),
    health_prev: numOrNull(health_prev),
    health_slope6,
    categories,
    metrics,
    alerts,
    divergence: raw.divergence ?? null,
    stale_signals: stale,
    sources: sourceNames,
  };
}

// Bestaetigt vs. beobachten (Spiegel von src/lib/alert-quality.ts / risk-shield).
const CONFIRM_MIN_MONTH_ROLLS = 1;
const CONFIRM_MIN_DAYS_HELD = 28;
function ymIndex(iso: string): number { const y = Number(iso.slice(0, 4)); const m = Number(iso.slice(5, 7)); return y * 12 + (m - 1); }
export function alertTier(a: RawAlert, nowMs: number = Date.now()): string {
  if (a.severity !== "critical" || (a.status ?? "open") !== "open") return "watch";
  const rolls = (a.period && a.first_detected_at) ? ymIndex(String(a.period)) - ymIndex(String(a.first_detected_at)) : 0;
  const t = a.first_detected_at ? Date.parse(a.first_detected_at) : NaN;
  const days = Number.isFinite(t) ? Math.max(0, Math.floor((nowMs - t) / 86400000)) : 0;
  return (rolls >= CONFIRM_MIN_MONTH_ROLLS || days >= CONFIRM_MIN_DAYS_HELD) ? "confirmed" : "watch";
}

// ── Wochen-Prioritaeten (deterministisch, KEIN LLM) ──────────────────────────
const ALERT_KIND_LABEL: Record<string, string> = {
  distress_risk: "Distress-Risiko",
  threshold_breach: "Rot-Schwelle unterschritten",
  trend_down: "Abwärtstrend",
  anomaly: "Einbruch",
};
export function handlungForAlert(a: CtxAlert): string {
  const subj = a.subject_key || "Kennzahl";
  switch (a.kind) {
    case "distress_risk":
      return `Ursache von ${subj} priorisiert klären und die zugrunde liegende Datenquelle prüfen; bei Bedarf mit dem betroffenen Bereich gegensteuern.`;
    case "threshold_breach":
      return `${subj} liegt unter der Rot-Schwelle — konkrete Gegenmaßnahme im betroffenen Bereich einleiten und in den Folgewochen nachverfolgen.`;
    case "trend_down":
      return `Abwärtstrend bei ${subj} beobachten: Treiber im Kategorie-Detail ansehen und früh gegensteuern, bevor die Rot-Schwelle erreicht wird.`;
    case "anomaly":
      return `Einmaligen Einbruch bei ${subj} verifizieren (echtes Signal vs. Datenlücke) und die Quelle auf Vollständigkeit prüfen.`;
    default:
      return `${subj} prüfen und Ursache im Detail nachvollziehen.`;
  }
}

export function weeklyPriorities(ctx: JanaContext, limit = 3): WeeklyPriority[] {
  const ranked = [...ctx.alerts].sort((a, b) => {
    const t = (b.tier === "confirmed" ? 1 : 0) - (a.tier === "confirmed" ? 1 : 0);
    if (t !== 0) return t;
    if (b.severity_rank !== a.severity_rank) return b.severity_rank - a.severity_rank;
    return (a.slope ?? 0) - (b.slope ?? 0);
  });
  const metricByKey = new Map(ctx.metrics.map((m) => [m.key, m]));
  return ranked.slice(0, limit).map((a, i) => {
    const m = metricByKey.get(a.subject_key);
    const sources = m?.sources ?? [];
    return {
      rank: i + 1,
      title: a.message || `${ALERT_KIND_LABEL[a.kind] ?? a.kind}: ${a.subject_key}`,
      severity: a.severity,
      kind: a.kind,
      handlung: handlungForAlert(a),
      beleg: {
        kpi: a.subject_key || (m?.key ?? null),
        value: a.value_now ?? m?.value ?? null,
        period: a.period ?? m?.period ?? null,
        sources: sources.map((s) => ctx.sources[s] ?? s),
      },
      tier: a.tier,
      alert_id: a.id,
    };
  });
}

// ── Prompt-Bau (Anti-Blackbox: nur CONTEXT zitieren, nie Zahlen erfinden) ─────
export function buildSystemPrompt(): string {
  return [
    "Du bist Jana, die Signal-Erklärerin von UseEasy. Du beantwortest Fragen eines Kunden zu SEINEN eigenen Kennzahlen (Capital-Layer, Frühwarn-Signale).",
    "STRIKTE REGELN:",
    "1. Nutze AUSSCHLIESSLICH Zahlen und Fakten aus dem bereitgestellten CONTEXT (JSON). Erfinde NIEMALS Werte, Perioden oder Quellen.",
    "2. Jede quantitative Aussage MUSS mit einer Zitat-Referenz aus dem CONTEXT belegt sein (KPI-Key, Kategorie-Key, Alert-ID, 'health' oder 'divergence').",
    "3. Wenn der CONTEXT eine Frage nicht beleglos beantworten kann, sage das ehrlich statt zu raten.",
    "4. Antworte kurz, klar und auf Deutsch. Keine Sende-/Schreibaktionen — du erklärst nur (read-only).",
    "5. Werte sind 0-100 (höher = gesünder), sofern nicht anders angegeben. Score-Bänder: >=70 gesund, 50-69 beobachten, <50 kritisch.",
    "ANTWORTFORMAT: Gib NUR ein JSON-Objekt zurück, ohne Markdown-Zaun, mit den Feldern:",
    '{ "answer": "<deutsche Antwort, Werte im Text nennen>", "citations": [ { "type": "kpi|category|alert|health|divergence", "key": "<key/id>" } ], "used_data": true|false, "confidence": 0.0-1.0 }',
    "used_data=false, wenn der CONTEXT die Frage nicht belegen kann.",
  ].join("\n");
}

// kompakter, token-schonender CONTEXT (nur zitierbare Felder)
export function contextForPrompt(ctx: JanaContext): Record<string, unknown> {
  return {
    account: ctx.account,
    health: { now: ctx.health_now, prev: ctx.health_prev, slope6: round2(ctx.health_slope6) },
    categories: ctx.categories.map((c) => ({ key: c.key, name: c.name, score: c.score, band: c.band, period: c.period })),
    kpis: ctx.metrics.map((m) => ({
      key: m.key, name: m.name, value: m.value, band: m.band, period: m.period,
      category: m.category_key, measures: m.measures,
      sources: m.sources.map((s) => ctx.sources[s] ?? s), method: m.method,
    })),
    alerts: ctx.alerts.map((a) => ({
      id: a.id, kind: a.kind, severity: a.severity, tier: a.tier, subject: a.subject_key,
      message: a.message, value_now: a.value_now, slope: round2(a.slope), period: a.period,
    })),
    divergence: ctx.divergence
      ? {
          comms: ctx.divergence.comms_score ?? null,
          financial: ctx.divergence.financial_score ?? null,
          external: ctx.divergence.external_score ?? null,
          comms_minus_financial: ctx.divergence.comms_minus_financial ?? null,
          signal_class: ctx.divergence.signal_class ?? null,
        }
      : null,
    stale_signals: ctx.stale_signals,
  };
}

export function buildChatPrompt(ctx: JanaContext, message: string, history: Array<{ role: string; content: string }> = []): string {
  const hist = (history ?? [])
    .slice(-6)
    .map((h) => `${h.role === "assistant" ? "Jana" : "Nutzer"}: ${redactPII(String(h.content ?? "")).slice(0, 600)}`)
    .join("\n");
  const parts = [
    buildSystemPrompt(),
    "",
    "CONTEXT (die eigenen Signale des Kunden, PII-frei):",
    JSON.stringify(contextForPrompt(ctx)),
  ];
  if (hist) { parts.push("", "BISHERIGER VERLAUF:", hist); }
  parts.push("", `FRAGE DES KUNDEN: ${redactPII(message).slice(0, 1200)}`, "", "Antworte jetzt als JSON:");
  return parts.join("\n");
}

// Proaktive Abweichungs-Erklaerung (V2-Seed fuer Push).
export function buildExplainDivergencePrompt(ctx: JanaContext): string {
  const parts = [
    buildSystemPrompt(),
    "",
    "AUFGABE: Erkläre dem Kunden proaktiv in 2-3 Sätzen die aktuell wichtigste Auffälligkeit (stärkster offener Alert oder größte Divergenz zwischen Kommunikations- und Finanz-Signal). Nenne konkret die betroffene Kennzahl mit Wert und Periode und was das bedeutet. Belege alles aus dem CONTEXT.",
    "",
    "CONTEXT:",
    JSON.stringify(contextForPrompt(ctx)),
    "",
    "Antworte jetzt als JSON:",
  ];
  return parts.join("\n");
}

// ── LLM-Antwort robust parsen + Zitate validieren ────────────────────────────
export function parseLLMJson(text: string): any | null {
  if (text == null) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(s); } catch { /* weiter */ }
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { const cand = s.slice(start, i + 1); try { return JSON.parse(cand); } catch { return null; } } }
    }
  }
  return null;
}

export type ValidatedAnswer = {
  answer: string;
  citations: Citation[];
  used_data: boolean | null;
  confidence: number | null;
  dropped_citations: number;
  parse_ok: boolean;
};

export function knownKeys(ctx: JanaContext): { kpi: Set<string>; category: Set<string>; alert: Set<string> } {
  return {
    kpi: new Set(ctx.metrics.map((m) => m.key)),
    category: new Set(ctx.categories.map((c) => c.key)),
    alert: new Set(ctx.alerts.map((a) => a.id)),
  };
}

export function validateAnswer(rawText: string, ctx: JanaContext): ValidatedAnswer {
  const parsed = parseLLMJson(rawText);
  const known = knownKeys(ctx);
  if (!parsed || typeof parsed !== "object") {
    const fallback = String(rawText ?? "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    return { answer: fallback || "Ich konnte dazu gerade keine belegte Antwort bilden.", citations: [], used_data: null, confidence: null, dropped_citations: 0, parse_ok: false };
  }
  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  const rawCites: any[] = Array.isArray(parsed.citations) ? parsed.citations : [];
  const citations: Citation[] = [];
  let dropped = 0;
  for (const c of rawCites) {
    if (!c || typeof c !== "object") { dropped++; continue; }
    const type = String(c.type ?? "").toLowerCase();
    const key = String(c.key ?? "").trim();
    if (type === "health" || type === "divergence") { citations.push({ type: type as Citation["type"], key: type }); continue; }
    if (!key) { dropped++; continue; }
    if (type === "kpi" && known.kpi.has(key)) {
      const m = ctx.metrics.find((x) => x.key === key)!;
      citations.push({ type: "kpi", key, label: m.name, value: m.value, period: m.period });
    } else if (type === "category" && known.category.has(key)) {
      const cat = ctx.categories.find((x) => x.key === key)!;
      citations.push({ type: "category", key, label: cat.name, value: cat.score, period: cat.period });
    } else if (type === "alert" && known.alert.has(key)) {
      const al = ctx.alerts.find((x) => x.id === key)!;
      citations.push({ type: "alert", key, label: al.message, value: al.value_now, period: al.period });
    } else {
      dropped++;
    }
  }
  const seen = new Set<string>();
  const deduped = citations.filter((c) => { const id = `${c.type}:${c.key}`; if (seen.has(id)) return false; seen.add(id); return true; });
  const used_data = typeof parsed.used_data === "boolean" ? parsed.used_data : (deduped.length > 0 ? true : null);
  let confidence = numOrNull(parsed.confidence);
  if (confidence != null) confidence = Math.max(0, Math.min(1, confidence));
  return { answer: answer || "Ich konnte dazu gerade keine belegte Antwort bilden.", citations: deduped, used_data, confidence, dropped_citations: dropped, parse_ok: true };
}

// ── Bedrock-Proxy-Vertrag ────────────────────────────────────────────────────
export const DEFAULT_MODEL_ID = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0";
export const HAIKU_MODEL_ID = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";
export type Complexity = "simple" | "complex";
// Marker fuer Mehrschritt-/Analyse-/Vergleichsfragen (DE + EN). Trifft einer zu -> komplex.
const COMPLEX_RE = /\b(warum|weshalb|wieso|vergleich\w*|verglichen|versus|unterschied\w*|treiber|ursach\w*|grund|gr[\u00fcu]nde|zusammenhang|entwicklung|trend\w*|prognos\w*|erwart\w*|bedeut\w*|erkl[\u00e4a]r\w*|begr[\u00fcu]nd\w*|analys\w*|einbruch|gefallen|gesunken|gestiegen|ver[\u00e4a]ndert|schw[\u00e4a]chst\w*|st[\u00e4a]rkst\w*|gr[\u00f6o][\u00dfs]t\w*|niedrigst\w*|h[\u00f6o]chst\w*|ma[\u00dfs]nahm\w*|priorit\w*|risik\w*|divergenz|abweichung|why|compare|driver|reason|forecast|explain)\b/i;
// Serverseitige Komplexitaets-Klassifikation (deterministisch, KEIN LLM). NICHT vom Frontend steuerbar.
export function classifyComplexity(message: string, opts?: { action?: string; historyLen?: number }): Complexity {
  if (opts?.action === "explain_divergence") return "complex";
  const m = String(message ?? "");
  if (COMPLEX_RE.test(m)) return "complex";
  const words = m.trim().split(/\s+/).filter(Boolean).length;
  if (words > 14) return "complex";
  if ((m.match(/\?/g) || []).length >= 2) return "complex";
  if ((opts?.historyLen ?? 0) >= 2 && words > 8) return "complex";
  return "simple";
}
// Auto-Routing: einfache Fragen -> Haiku (guenstig/schnell), komplexe -> Sonnet 4.5 (belegtreu).
// NICHT im Frontend waehlbar. Ops-Override: JANA_CHAT_MODEL_ID (pin) ODER JANA_CHAT_MODEL=haiku|sonnet.
export function resolveModelId(env: Record<string, string | undefined>, complexity: Complexity = "complex"): string {
  const explicit = (env.JANA_CHAT_MODEL_ID ?? "").trim();
  if (explicit) return explicit;
  const pref = (env.JANA_CHAT_MODEL ?? "").trim().toLowerCase();
  if (pref === "haiku") return HAIKU_MODEL_ID;
  if (pref === "sonnet") return DEFAULT_MODEL_ID;
  return complexity === "simple" ? HAIKU_MODEL_ID : DEFAULT_MODEL_ID;
}
// Baut die Bedrock-Proxy-Invoke-URL robust (Basis-Host ODER schon mit Pfad).
export function bedrockInvokeUrl(base: string): string {
  const u = String(base ?? "").trim().replace(/\/+$/, "");
  if (/\/invoke$/i.test(u)) return u;
  if (/\/v1\/llm\/bedrock$/i.test(u)) return u + "/invoke";
  return u + "/v1/llm/bedrock/invoke";
}
export function resolveMaxTokens(env: Record<string, string | undefined>): number {
  const n = Number(env.JANA_CHAT_MAX_TOKENS ?? "");
  return Number.isFinite(n) && n >= 256 && n <= 4096 ? Math.floor(n) : 1200;
}
// Liest das vom Proxy tatsaechlich verwendete Modell (Anthropic-Antwort traegt `model`).
// Damit ist das Modell-Auto-Routing LIVE verifizierbar: proxy_model muss zum angeforderten Modell passen.
export function extractProxyModel(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.model === "string" && payload.model.trim()) return payload.model.trim();
  if (payload.message && typeof payload.message.model === "string") return payload.message.model;
  return null;
}
export function extractProxyText(payload: any): string {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload.completion === "string") return payload.completion;
  if (typeof payload.output_text === "string") return payload.output_text;
  if (typeof payload.text === "string") return payload.text;
  if (Array.isArray(payload.content) && payload.content[0]) {
    const c0 = payload.content[0];
    if (typeof c0 === "string") return c0;
    if (c0 && typeof c0.text === "string") return c0.text;
  }
  if (payload.message && Array.isArray(payload.message.content) && payload.message.content[0]?.text) return String(payload.message.content[0].text);
  if (typeof payload.body === "string") return payload.body;
  return "";
}

// ── kleine Helfer ────────────────────────────────────────────────────────────
function numOrNull(x: unknown): number | null { if (typeof x === "number" && Number.isFinite(x)) return x; if (x != null && x !== "" && !Number.isNaN(Number(x))) return Number(x); return null; }
function numOr(x: unknown, d: number): number { const n = numOrNull(x); return n == null ? d : n; }
function round2(x: number | null): number | null { return x == null ? null : Math.round(x * 100) / 100; }
function stripSuffix(name: string): string { return String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim(); }
function firstClause(measures: string | null | undefined): string | null { const m = (measures || "").trim(); if (!m) return null; const first = m.split(/[;.]/)[0].trim(); return first || m; }
