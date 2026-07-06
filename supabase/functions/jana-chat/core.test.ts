// jana-chat/core.test.ts — umfangreiche Unit-Tests der reinen Logik.
// Lauf: node --experimental-strip-types core.test.ts
import assert from "node:assert/strict";
import {
  redactPII, shapeContext, contextForPrompt, buildChatPrompt, buildExplainDivergencePrompt,
  parseLLMJson, validateAnswer, knownKeys, weeklyPriorities, handlungForAlert,
  resolveModelId, resolveMaxTokens, extractProxyText, bandFor, trailingSlope, alertTier,
  classifyComplexity, bedrockInvokeUrl,
  DEFAULT_MODEL_ID, HAIKU_MODEL_ID,
  type RawBundle,
} from "./core.ts";

let passed = 0;
function ok(cond: unknown, msg: string) { assert.ok(cond, msg); passed++; }
function eq(a: unknown, b: unknown, msg: string) { assert.deepEqual(a, b, msg); passed++; }

// ── Fixture: my-signals-artiges Buendel (PII-frei) ──────────────────────────
const bundle: RawBundle = {
  account: { name: "Muster GmbH", slug: "muster", vertical: "ecom" },
  latest_period: "2026-06-01",
  source_names: { comms_inbox: "Postfach", hubspot_crm: "HubSpot", stripe: "Stripe" },
  health_series: [
    { period: "2026-01-01", health_score: 82 },
    { period: "2026-02-01", health_score: 80 },
    { period: "2026-03-01", health_score: 78 },
    { period: "2026-04-01", health_score: 71 },
    { period: "2026-05-01", health_score: 66 },
    { period: "2026-06-01", health_score: 61 },
  ],
  categories: [
    { category_key: "comms", name: "Kommunikation", category_score: 58, period: "2026-06-01" },
    { category_key: "finance", name: "Finanzen", category_score: 74, period: "2026-06-01" },
  ],
  metrics: [
    { metric_key: "rhi", name: "Antwort-Handling (Postfach)", category_key: "comms", value: 42, period: "2026-06-01", confidence: 0.7, direction: "higher_better", measures: "Reaktions-/Antwortlast im Postfach; hoeher = entlasteter", provenance: { method: "kemaris_8w_baseline_v1", sources_used: ["comms_inbox"], formula: "100*(draft+auto)/total * (1-0.4*backlog48h)", input: { backlog48h: 12 } } },
    { metric_key: "sales_conversion", name: "Conversion (HubSpot)", category_key: "finance", value: 71, period: "2026-06-01", confidence: 0.6, provenance: { method: "hubspot_crm", sources_used: ["hubspot_crm"] } },
    { metric_key: "cri", name: "Commitment-Treue", category_key: "comms", value: null, period: null, provenance: {} },
  ],
  alerts: [
    { id: 501, scope: "metric", subject_key: "rhi", kind: "trend_down", severity: "warning", severity_rank: 2, status: "open", message: "Abwärtstrend bei rhi", value_now: 42, slope: -3.2, period: "2026-06-01", window_months: 6, first_detected_at: "2026-05-01" },
    { id: 502, scope: "health", subject_key: "health", kind: "distress_risk", severity: "critical", severity_rank: 3, status: "open", message: "Distress-Risiko: Health faellt", value_now: 61, slope: -4.1, period: "2026-06-01", first_detected_at: "2026-04-01" },
    { id: 503, scope: "metric", subject_key: "cri", kind: "anomaly", severity: "info", severity_rank: 1, status: "resolved", message: "resolved sollte raus", value_now: 30, slope: null, period: "2026-06-01", first_detected_at: "2026-06-01" },
  ],
  freshness: [
    { metric_key: "sales_conversion", source_key: "hubspot_crm", status: "stale", last_period: "2026-04-01" },
    { metric_key: "rhi", source_key: "comms_inbox", status: "fresh", last_period: "2026-06-01" },
  ],
  divergence: { comms_score: 58, financial_score: 74, external_score: 66, comms_minus_financial: -16, signal_class: "comms_weaker", divergence_score: 16 },
};

// ── redactPII ───────────────────────────────────────────────────────────────
eq(redactPII("Schreib an max.mustermann@firma.de bitte"), "Schreib an [email] bitte", "email redigiert");
ok(redactPII("Ruf 0176 1234567 an").includes("[telefon]"), "telefon redigiert");
ok(redactPII("Ruf +49 30 123456789 an").includes("[telefon]"), "intl telefon redigiert");
ok(redactPII("Konto DE44500105175407324931 pruefen").includes("[iban]"), "iban redigiert");
ok(!/\d{7,}/.test(redactPII("Vertrag 12345678 offen")), "lange nummer redigiert (kein roher ziffernblock)");
ok(redactPII("Warum faellt mein Score seit 2026?").includes("2026"), "jahr 2026 bleibt");
eq(redactPII("Was ist mein RHI?"), "Was ist mein RHI?", "harmlose frage unveraendert");
ok(!redactPII("kontakt: a@b.co, tel 0176 999 8888").match(/@|\d{7,}/), "mehrere PII zusammen redigiert");
{ const once = redactPII("mail x@y.de"); ok(redactPII(once) === once, "redactPII idempotent"); }

// ── bandFor / trailingSlope / alertTier ──────────────────────────────────────
eq(bandFor(90), "gesund", "band gesund"); eq(bandFor(55), "beobachten", "band beobachten");
eq(bandFor(20), "kritisch", "band kritisch"); eq(bandFor(null), "unbekannt", "band unbekannt");
ok((trailingSlope([82,80,78,71,66,61]) ?? 0) < 0, "slope faellt");
eq(trailingSlope([50]), null, "slope <2 punkte null");
eq(alertTier({ severity: "critical", status: "open", period: "2026-06-01", first_detected_at: "2026-04-01" }), "confirmed", "alt+kritisch=confirmed");
eq(alertTier({ severity: "critical", status: "open", period: "2026-06-01", first_detected_at: "2026-06-01" }, Date.parse("2026-06-02T00:00:00Z")), "watch", "frisch kritisch=watch");
eq(alertTier({ severity: "warning", status: "open" }), "watch", "warning=watch");

// ── shapeContext ─────────────────────────────────────────────────────────────
const ctx = shapeContext(bundle);
eq(ctx.health_now, 61, "health_now letzter");
eq(ctx.health_prev, 66, "health_prev vorletzter");
ok((ctx.health_slope6 ?? 0) < 0, "health_slope6 negativ");
eq(ctx.metrics.length, 3, "3 metriken");
eq(ctx.metrics.find((m) => m.key === "rhi")!.band, "kritisch", "rhi 42 = kritisch");
eq(ctx.metrics.find((m) => m.key === "rhi")!.sources, ["comms_inbox"], "rhi quelle");
eq(ctx.metrics.find((m) => m.key === "cri")!.value, null, "cri ohne wert");
eq(ctx.alerts.length, 2, "resolved alert gefiltert");
eq(ctx.alerts[0].id, "502", "hoechster severity_rank zuerst");
eq(ctx.alerts[0].tier, "confirmed", "distress alt=confirmed");
eq(ctx.alerts[1].tier, "watch", "trend_down warning=watch");
eq(ctx.stale_signals.length, 1, "1 stale signal");
eq(ctx.stale_signals[0].metric_key, "sales_conversion", "stale = sales_conversion");
eq(ctx.divergence!.signal_class, "comms_weaker", "divergence class");

// PII-Leak-Guard: der serialisierte CONTEXT enthaelt keine PII-/Identitaets-Keys.
{
  const s = JSON.stringify(contextForPrompt(ctx));
  for (const bad of ["owner_email", "tenant_id", "ats_token", "ats_provider", "@"]) {
    ok(!s.includes(bad), `CONTEXT ohne '${bad}'`);
  }
  ok(s.includes("Postfach"), "quelle als klartext (comms_inbox->Postfach)");
  ok(!s.includes("comms_inbox"), "roher quell-key ersetzt");
}

// ── contextForPrompt-Struktur ────────────────────────────────────────────────
{
  const c = contextForPrompt(ctx) as any;
  eq(c.health.now, 61, "cfp health.now");
  ok(Array.isArray(c.kpis) && c.kpis.length === 3, "cfp kpis");
  ok(Array.isArray(c.alerts) && c.alerts.length === 2, "cfp alerts");
  eq(c.divergence.comms_minus_financial, -16, "cfp divergence");
}

// ── buildChatPrompt / explain ────────────────────────────────────────────────
{
  const p = buildChatPrompt(ctx, "Warum faellt mein Score? Schreib an chef@x.de", [{ role: "user", content: "hi 0176 1234567" }]);
  ok(p.includes("STRIKTE REGELN"), "prompt hat regeln");
  ok(p.includes('"health"') || p.includes("CONTEXT"), "prompt hat context");
  ok(p.includes("[email]"), "frage redigiert im prompt");
  ok(p.includes("[telefon]"), "history redigiert im prompt");
  ok(p.includes("Antworte jetzt als JSON"), "prompt fordert JSON");
}
ok(buildExplainDivergencePrompt(ctx).includes("wichtigste Auffälligkeit"), "explain-prompt aufgabe");

// ── parseLLMJson ─────────────────────────────────────────────────────────────
eq(parseLLMJson('{"answer":"x"}').answer, "x", "plain json");
eq(parseLLMJson('```json\n{"answer":"y"}\n```').answer, "y", "fenced json");
eq(parseLLMJson('Hier: {"answer":"z","n":1} fertig').answer, "z", "json mit umgebungstext");
eq(parseLLMJson('{"answer":"a {b} c"}').answer, "a {b} c", "geschweifte klammer im string");
eq(parseLLMJson("kein json"), null, "kein json -> null");
eq(parseLLMJson('{"a":'), null, "kaputtes json -> null");

// ── validateAnswer (Anti-Halluzination) ──────────────────────────────────────
{
  const good = JSON.stringify({ answer: "RHI ist bei 42.", citations: [{ type: "kpi", key: "rhi" }, { type: "alert", key: "502" }, { type: "health", key: "health" }], used_data: true, confidence: 0.9 });
  const v = validateAnswer(good, ctx);
  ok(v.parse_ok, "valid parse_ok");
  eq(v.citations.length, 3, "3 gueltige zitate");
  eq(v.citations.find((c) => c.type === "kpi")!.value, 42, "kpi zitat angereichert");
  eq(v.dropped_citations, 0, "keine verworfen");
  eq(v.confidence, 0.9, "confidence uebernommen");
}
{
  const bad = JSON.stringify({ answer: "erfunden", citations: [{ type: "kpi", key: "does_not_exist" }, { type: "alert", key: "999" }, { type: "category", key: "comms" }], confidence: 5 });
  const v = validateAnswer(bad, ctx);
  eq(v.dropped_citations, 2, "2 nicht existierende zitate verworfen");
  eq(v.citations.length, 1, "nur category comms bleibt");
  eq(v.citations[0].type, "category", "gueltiges category-zitat");
  eq(v.confidence, 1, "confidence auf [0,1] geklemmt");
}
{
  const v = validateAnswer("Reiner Text ohne JSON, 42.", ctx);
  ok(!v.parse_ok, "rohtext parse_ok false");
  ok(v.answer.includes("Reiner Text"), "rohtext als antwort durchgereicht");
  eq(v.citations.length, 0, "rohtext keine zitate");
}
{
  const dup = JSON.stringify({ answer: "x", citations: [{ type: "kpi", key: "rhi" }, { type: "kpi", key: "rhi" }] });
  eq(validateAnswer(dup, ctx).citations.length, 1, "dedupe zitate");
}

// ── knownKeys ────────────────────────────────────────────────────────────────
{
  const k = knownKeys(ctx);
  ok(k.kpi.has("rhi") && k.kpi.has("cri"), "known kpi keys");
  ok(k.alert.has("502"), "known alert id"); ok(k.category.has("finance"), "known category");
}

// ── weeklyPriorities (deterministisch) ───────────────────────────────────────
{
  const wp = weeklyPriorities(ctx);
  eq(wp.length, 2, "2 offene alerts -> 2 prioritaeten");
  eq(wp[0].alert_id, "502", "confirmed distress zuerst");
  eq(wp[0].rank, 1, "rank 1");
  ok(wp[0].handlung.length > 10, "handlung text");
  eq(wp[0].tier, "confirmed", "tier durchgereicht");
  eq(wp[1].beleg.kpi, "rhi", "beleg kpi rhi");
  eq(wp[1].beleg.value, 42, "beleg value");
  eq(wp[1].beleg.sources, ["Postfach"], "beleg quelle klartext");
  eq(weeklyPriorities({ ...ctx, alerts: [] }).length, 0, "keine alerts -> leer");
  eq(weeklyPriorities(ctx, 1).length, 1, "limit greift");
}

// ── handlungForAlert je kind ──────────────────────────────────────────────────
for (const k of ["distress_risk", "threshold_breach", "trend_down", "anomaly", "sonstwas"]) {
  ok(handlungForAlert({ id: "x", scope: "metric", subject_key: "rhi", kind: k, severity: "warning", severity_rank: 1, message: "", value_now: null, slope: null, period: null, window_months: null, tier: "watch" }).length > 5, `handlung ${k}`);
}

// ── Modell / max_tokens / Proxy-Text ─────────────────────────────────────────
// Auto-Routing: einfach -> Haiku, komplex -> Sonnet
eq(resolveModelId({}, "complex"), DEFAULT_MODEL_ID, "komplex -> sonnet");
eq(resolveModelId({}, "simple"), HAIKU_MODEL_ID, "einfach -> haiku");
eq(resolveModelId({}), DEFAULT_MODEL_ID, "default (ohne complexity) -> sonnet");
eq(resolveModelId({ JANA_CHAT_MODEL: "haiku" }, "complex"), HAIKU_MODEL_ID, "ops-pin haiku schlaegt routing");
eq(resolveModelId({ JANA_CHAT_MODEL: "sonnet" }, "simple"), DEFAULT_MODEL_ID, "ops-pin sonnet schlaegt routing");
eq(resolveModelId({ JANA_CHAT_MODEL_ID: "custom-x" }, "simple"), "custom-x", "explizite model id pin");
// classifyComplexity
eq(classifyComplexity("Was ist mein RHI?"), "simple", "kurze faktfrage einfach");
eq(classifyComplexity("Wie hoch ist mein Score?"), "simple", "wert-abfrage einfach");
eq(classifyComplexity("Warum ist mein Score gefallen?"), "complex", "warum -> komplex");
eq(classifyComplexity("Vergleiche meine letzten Monate."), "complex", "vergleich -> komplex");
eq(classifyComplexity("Was ist der Treiber der Divergenz?"), "complex", "treiber/divergenz -> komplex");
eq(classifyComplexity("Welche Kennzahl ist am staerksten gefallen und was bedeutet das fuer naechste Woche?"), "complex", "mehrschritt -> komplex");
eq(classifyComplexity("x", { action: "explain_divergence" }), "complex", "explain_divergence immer komplex");
eq(classifyComplexity("Zeig mir bitte nur meinen ganz aktuellen Health Wert als nackte Zahl fuer heute ohne alles andere drum herum", { historyLen: 0 }), "complex", ">14 woerter -> komplex");
eq(classifyComplexity("Und im Mai?", { historyLen: 3 }), "simple", "kurze follow-up bleibt einfach");
// bedrockInvokeUrl
eq(bedrockInvokeUrl("https://gpl60wd3uj.execute-api.eu-central-1.amazonaws.com"), "https://gpl60wd3uj.execute-api.eu-central-1.amazonaws.com/v1/llm/bedrock/invoke", "basis-host -> voller pfad");
eq(bedrockInvokeUrl("https://x.test/"), "https://x.test/v1/llm/bedrock/invoke", "trailing slash");
eq(bedrockInvokeUrl("https://x.test/v1/llm/bedrock"), "https://x.test/v1/llm/bedrock/invoke", "pfad ohne invoke");
eq(bedrockInvokeUrl("https://x.test/v1/llm/bedrock/invoke"), "https://x.test/v1/llm/bedrock/invoke", "voller pfad unveraendert");
eq(resolveMaxTokens({}), 1200, "default max tokens");
eq(resolveMaxTokens({ JANA_CHAT_MAX_TOKENS: "800" }), 800, "gueltige max tokens");
eq(resolveMaxTokens({ JANA_CHAT_MAX_TOKENS: "99" }), 1200, "zu klein -> default");
eq(extractProxyText("roh"), "roh", "proxy string");
eq(extractProxyText({ completion: "c" }), "c", "proxy completion");
eq(extractProxyText({ content: [{ text: "t" }] }), "t", "proxy content[0].text");
eq(extractProxyText({ output_text: "o" }), "o", "proxy output_text");
eq(extractProxyText({ message: { content: [{ text: "m" }] } }), "m", "proxy message.content");
eq(extractProxyText({ nope: 1 }), "", "proxy unbekannt -> leer");

console.log(`\nOK — ${passed} Assertions bestanden.`);
