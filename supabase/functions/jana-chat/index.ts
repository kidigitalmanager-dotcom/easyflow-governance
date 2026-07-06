import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  shapeContext, buildChatPrompt, buildExplainDivergencePrompt, weeklyPriorities,
  validateAnswer, extractProxyText, resolveModelId, resolveMaxTokens,
  classifyComplexity, bedrockInvokeUrl, extractProxyModel,
  type RawBundle,
} from "./core.ts";

// ── jana-chat ────────────────────────────────────────────────────────────────
// Read-only Chat + Wochen-Prioritaeten ueber die EIGENEN Capital-Signale des
// eingeloggten Tenants. Jede Aussage wird mit KPI + Quelle belegt (Anti-Blackbox).
//
// Auth (Spiegel von my-signals/risk-shield): x-console-token -> UseEasy-Auth-
// Projekt (/auth/v1/user) -> email -> cap_accounts. Alles via service_role.
// cap_* ist PII-frei (nur aggregierte 0-100-Werte); der Nutzer-Freitext wird
// zusaetzlich redactPII-gefiltert, BEVOR er ans LLM (Bedrock-Proxy) geht.
//
// Aktionen: chat | weekly_priorities | explain_divergence
// Modi:     tenant (eigene Signale) | investor (freigegebenes/externes Konto per slug)
// weekly_priorities laeuft OHNE LLM (deterministisch) -> Karte funktioniert auch
// bevor das Bedrock-Secret gesetzt ist.

const AUTH_URL = "https://trxsbknlwyysnlpgahav.supabase.co";
const AUTH_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyeHNia25sd3l5c25scGdhaGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODg3NjEsImV4cCI6MjA4NzI2NDc2MX0.84_We5HM6ZaJSe7hc5p_LY-BHiLQ0_ZAlu5mJKCCRFs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-console-token, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Laedt das (PII-freie) Signal-Buendel fuer EIN Konto — dieselben Quellen wie
// my-signals, plus cap_source_divergence + cap_sources-Namen.
async function loadBundle(svc: any, acc: any): Promise<RawBundle> {
  const [mvRes, catalogRes, csRes, hsRes, catRes, srcRes, alRes, frRes, dvRes] = await Promise.all([
    svc.from("cap_metric_values")
      .select("metric_key, period, value, confidence, coverage, is_illustrative, provenance")
      .eq("account_id", acc.id).order("period", { ascending: false }),
    svc.from("cap_metrics")
      .select("key, name, category_key, direction, unit, measures, is_predictive, display_order"),
    svc.from("cap_category_scores")
      .select("category_key, period, category_score")
      .eq("account_id", acc.id).order("period", { ascending: false }),
    svc.from("cap_health_scores")
      .select("period, health_score")
      .eq("account_id", acc.id).order("period", { ascending: true }),
    svc.from("cap_categories").select("key, name, display_order").order("display_order", { ascending: true }),
    svc.from("cap_sources").select("key, name"),
    svc.from("cap_alerts")
      .select("id, scope, subject_key, kind, severity, severity_rank, status, message, window_months, value_now, slope, period, first_detected_at")
      .eq("account_id", acc.id).eq("status", "open").order("severity_rank", { ascending: false }),
    svc.from("cap_freshness")
      .select("metric_key, source_key, status, last_period")
      .eq("account_id", acc.id),
    svc.from("cap_source_divergence")
      .select("comms_score, comms_slope6, financial_score, financial_slope6, external_score, comms_minus_financial, signal_class, divergence_score")
      .eq("account_id", acc.id).maybeSingle(),
  ]);
  for (const r of [mvRes, catalogRes, csRes, hsRes, catRes, srcRes, alRes, frRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const metricMeta = new Map((catalogRes.data ?? []).map((m: any) => [m.key, m]));
  const seenMv = new Set<string>();
  const metrics: any[] = [];
  for (const r of (mvRes.data ?? [])) {
    if (seenMv.has(r.metric_key)) continue; // rows sind period-desc -> erster = neuester
    seenMv.add(r.metric_key);
    const m: any = metricMeta.get(r.metric_key) ?? {};
    metrics.push({
      metric_key: r.metric_key, name: m.name ?? r.metric_key, category_key: m.category_key ?? null,
      value: r.value, period: r.period, confidence: r.confidence, direction: m.direction ?? null,
      unit: m.unit ?? null, measures: m.measures ?? null, is_predictive: m.is_predictive ?? null,
      provenance: r.provenance ?? {},
    });
  }

  const catMeta = new Map((catRes.data ?? []).map((c: any) => [c.key, c]));
  const seenCat = new Set<string>();
  const categories: any[] = [];
  for (const r of (csRes.data ?? [])) {
    if (seenCat.has(r.category_key)) continue;
    seenCat.add(r.category_key);
    const meta: any = catMeta.get(r.category_key) ?? {};
    categories.push({ category_key: r.category_key, name: meta.name ?? r.category_key, category_score: r.category_score, period: r.period });
  }

  const source_names: Record<string, string> = {};
  for (const s of (srcRes.data ?? [])) source_names[s.key] = s.name ?? s.key;

  const health_series = (hsRes.data ?? []).map((h: any) => ({ period: h.period, health_score: h.health_score }));
  const latest_period = health_series.length ? health_series[health_series.length - 1].period : (metrics[0]?.period ?? null);

  return {
    account: { name: acc.name, slug: acc.slug, vertical: acc.vertical },
    latest_period,
    health_series,
    categories,
    metrics,
    alerts: (alRes.data ?? []),
    freshness: (frRes.data ?? []),
    divergence: (dvRes && !dvRes.error) ? (dvRes.data ?? null) : null,
    source_names,
  };
}

// Ruft den UseEasy-Bedrock-Proxy (Frankfurt, PII-minimiert). Vertrag aus dem
// bestehenden Stack: POST {URL}/v1/invoke, Header x-auth-token, Body
// { model_id, prompt, max_tokens }. Antworthuelle wird defensiv extrahiert.
async function callBedrock(url: string, token: string, prompt: string, model: string, maxTokens: number): Promise<{ ok: boolean; text: string; error?: string; proxyModel?: string | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(bedrockInvokeUrl(url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-auth-token": token },
      body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, model_id: model }),
      signal: ctrl.signal,
    });
    const raw = await r.text();
    if (!r.ok) return { ok: false, text: "", error: `proxy_${r.status}` };
    let payload: any; try { payload = JSON.parse(raw); } catch { payload = raw; }
    return { ok: true, text: extractProxyText(payload), proxyModel: extractProxyModel(payload) };
  } catch (e) {
    return { ok: false, text: "", error: String((e as any)?.name === "AbortError" ? "proxy_timeout" : e) };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const consoleToken = req.headers.get("x-console-token") ?? "";
    if (!consoleToken) return json(401, { error: "missing_console_token" });

    const ur = await fetch(`${AUTH_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${consoleToken}`, apikey: AUTH_ANON } });
    if (!ur.ok) return json(401, { error: "invalid_console_session" });
    const user = await ur.json();
    const email = String(user?.email ?? "").toLowerCase();
    if (!email) return json(401, { error: "no_email" });

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({} as any));
    const action = String(body.action ?? "chat");
    const mode = String(body.mode ?? "tenant");

    // Konto aufloesen.
    let acc: any = null;
    if (mode === "investor") {
      const slug = String(body.slug ?? "").trim();
      if (!slug) return json(400, { error: "missing_slug" });
      // Investor-Sichtbarkeit: extern ODER ausdruecklich freigegeben.
      const { data, error } = await svc.from("cap_accounts").select("*").eq("slug", slug)
        .or("account_type.eq.external,consent_data_sharing.eq.true").maybeSingle();
      if (error) return json(500, { error: error.message });
      acc = data;
      if (!acc) return json(200, { ok: true, mode, has_own_account: false, account: null, visible: false });
    } else {
      const { data, error } = await svc.from("cap_accounts").select("*").eq("owner_email", email)
        .order("created_at", { ascending: true });
      if (error) return json(500, { error: error.message });
      acc = (data ?? [])[0];
      if (!acc) return json(200, { ok: true, mode, has_own_account: false, owned_count: 0, account: null });
    }

    const bundle = await loadBundle(svc, acc);
    const ctx = shapeContext(bundle);
    const accountOut = { name: acc.name, slug: acc.slug, vertical: acc.vertical };

    if (action === "weekly_priorities") {
      return json(200, {
        ok: true, mode, has_own_account: true, account: accountOut,
        latest_period: ctx.account.latest_period,
        priorities: weeklyPriorities(ctx, Number(body.limit) || 3),
        open_alert_count: ctx.alerts.length,
        generated_at: new Date().toISOString(),
      });
    }

    if (action !== "chat" && action !== "explain_divergence") return json(400, { error: "unknown_action" });

    const message = String(body.message ?? "").trim();
    if (action === "chat" && !message) return json(400, { error: "empty_message" });

    const BEDROCK_URL = (Deno.env.get("USEEASY_BEDROCK_PROXY_URL") ?? "").trim();
    const BEDROCK_TOKEN = (Deno.env.get("USEEASY_BEDROCK_AUTH_TOKEN") ?? Deno.env.get("USEEASY_SHARED_AUTH_TOKEN") ?? "").trim();
    if (!BEDROCK_URL || !BEDROCK_TOKEN) {
      // LLM noch nicht scharfgeschaltet -> Frontend zeigt Hinweis, Karte bleibt nutzbar.
      return json(200, { ok: true, mode, has_own_account: true, account: accountOut, llm_configured: false, answer: null, citations: [], latest_period: ctx.account.latest_period });
    }

    const env = { JANA_CHAT_MODEL_ID: Deno.env.get("JANA_CHAT_MODEL_ID"), JANA_CHAT_MODEL: Deno.env.get("JANA_CHAT_MODEL"), JANA_CHAT_MAX_TOKENS: Deno.env.get("JANA_CHAT_MAX_TOKENS") };
    const history = Array.isArray(body.history) ? body.history : [];
    const complexity = classifyComplexity(message, { action, historyLen: history.length });
    const model = resolveModelId(env, complexity);
    const maxTokens = resolveMaxTokens(env);
    const prompt = action === "explain_divergence" ? buildExplainDivergencePrompt(ctx) : buildChatPrompt(ctx, message, history);

    const llm = await callBedrock(BEDROCK_URL, BEDROCK_TOKEN, prompt, model, maxTokens);
    if (!llm.ok) return json(200, { ok: true, mode, has_own_account: true, account: accountOut, llm_configured: true, llm_error: llm.error, answer: null, citations: [], latest_period: ctx.account.latest_period });

    const v = validateAnswer(llm.text, ctx);
    return json(200, {
      ok: true, mode, action, has_own_account: true, account: accountOut, llm_configured: true,
      answer: v.answer, citations: v.citations, used_data: v.used_data, confidence: v.confidence,
      dropped_citations: v.dropped_citations, parse_ok: v.parse_ok, model, complexity, proxy_model: llm.proxyModel ?? null,
      latest_period: ctx.account.latest_period, generated_at: new Date().toISOString(),
    });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
