import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// my-signals: returns the logged-in tenant's OWN Capital signals.
// Aggregated 0-100 indices only — NEVER raw mail / PII.
//
// Auth model (mirror of the `consent` edge function):
//   1. Read the console session token from header `x-console-token`.
//   2. Validate it against the UseEasy-auth project (/auth/v1/user) — NOT the Capital project.
//   3. Resolve cap_accounts by owner_email (the logged-in tenant).
//   4. Read everything via service_role (RLS bypass) so consent=false tenants see THEIR OWN data.
// Consent gates ONLY investor visibility (/investoren), never the tenant's own /signale view.

const AUTH_URL = "https://trxsbknlwyysnlpgahav.supabase.co";
const AUTH_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyeHNia25sd3l5c25scGdhaGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODg3NjEsImV4cCI6MjA4NzI2NDc2MX0.84_We5HM6ZaJSe7hc5p_LY-BHiLQ0_ZAlu5mJKCCRFs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-console-token, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Whitelist the account fields we expose. Never leak owner_email / tenant_id / ats_token / ats_provider.
function publicAccount(a: any) {
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    domain: a.domain,
    vertical: a.vertical,
    account_type: a.account_type,
    consent_data_sharing: a.consent_data_sharing,
    consent_at: a.consent_at,
    status: a.status,
    signal_name: a.signal_name,
    signal_domain: a.signal_domain,
    failure_month: a.failure_month,
    created_at: a.created_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const consoleToken = req.headers.get("x-console-token") ?? "";
    if (!consoleToken) return json(401, { error: "missing_console_token" });

    // 1) Validate the console session against the AUTH project.
    const ur = await fetch(`${AUTH_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${consoleToken}`, apikey: AUTH_ANON },
    });
    if (!ur.ok) return json(401, { error: "invalid_console_session" });
    const user = await ur.json();
    const email = String(user?.email ?? "").toLowerCase();
    if (!email) return json(401, { error: "no_email" });

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 2) Resolve the tenant's OWN account by owner_email (service_role => RLS bypass).
    //    owner_email is always stored lowercased by the consent flow.
    const { data: accs, error: ae } = await svc
      .from("cap_accounts")
      .select("*")
      .eq("owner_email", email)
      .order("created_at", { ascending: true });
    if (ae) return json(500, { error: ae.message });
    const owned = accs ?? [];
    const acc = owned[0];
    if (!acc) return json(200, { ok: true, has_own_account: false, owned_count: 0, account: null });

    // 3) Read the aggregated signals for this account (all via service_role).
    const [mvRes, catalogRes, csRes, hsRes, catRes, srcRes, alRes] = await Promise.all([
      svc.from("cap_metric_values")
        .select("metric_key, period, value, confidence, coverage, sample_n, is_illustrative, provenance")
        .eq("account_id", acc.id)
        .order("period", { ascending: false }),
      svc.from("cap_metrics")
        .select("key, short_code, name, category_key, direction, unit, display_order, source_layer, measures, early_indicator_for, is_predictive"),
      svc.from("cap_category_scores")
        .select("category_key, period, category_score, confidence, coverage, kpis_with_data, is_illustrative")
        .eq("account_id", acc.id)
        .order("period", { ascending: false }),
      svc.from("cap_health_scores")
        .select("period, health_score, confidence, coverage, categories_with_data, is_illustrative")
        .eq("account_id", acc.id)
        .order("period", { ascending: true }),
      svc.from("cap_categories")
        .select("key, name, description, color, weight, display_order")
        .order("display_order", { ascending: true }),
      svc.from("cap_sources")
        .select("key, name, source_type, access, compliance_note, is_verified, display_order")
        .order("display_order", { ascending: true }),
      svc.from("cap_alerts")
        .select("id, scope, subject_key, kind, severity, severity_rank, status, message, window_months, value_now, slope, projection, period, confidence, coverage, is_illustrative, first_detected_at, last_evaluated_at")
        .eq("account_id", acc.id)
        .eq("status", "open")
        .order("severity_rank", { ascending: false }),
    ]);
    for (const r of [mvRes, catalogRes, csRes, hsRes, catRes, srcRes, alRes]) {
      if (r.error) return json(500, { error: r.error.message });
    }

    const metricMeta = new Map((catalogRes.data ?? []).map((m: any) => [m.key, m]));

    // Latest value per metric_key (rows are period-desc => first hit wins).
    const seenMv = new Set<string>();
    const metrics: any[] = [];
    for (const r of (mvRes.data ?? [])) {
      if (seenMv.has(r.metric_key)) continue;
      seenMv.add(r.metric_key);
      const m: any = metricMeta.get(r.metric_key) ?? {};
      metrics.push({
        metric_key: r.metric_key,
        short_code: m.short_code ?? null,
        name: m.name ?? r.metric_key,
        category_key: m.category_key ?? null,
        source_layer: m.source_layer ?? null,
        direction: m.direction ?? null,
        unit: m.unit ?? null,
        is_predictive: m.is_predictive ?? null,
        measures: m.measures ?? null,
        early_indicator_for: m.early_indicator_for ?? null,
        display_order: m.display_order ?? null,
        value: r.value,
        confidence: r.confidence,
        coverage: r.coverage,
        sample_n: r.sample_n,
        period: r.period,
        is_illustrative: r.is_illustrative,
        provenance: r.provenance ?? {},
      });
    }
    metrics.sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999));

    // Latest category score per category_key, enriched with catalog name/color.
    const catMeta = new Map((catRes.data ?? []).map((c: any) => [c.key, c]));
    const seenCat = new Set<string>();
    const categories: any[] = [];
    for (const r of (csRes.data ?? [])) {
      if (seenCat.has(r.category_key)) continue;
      seenCat.add(r.category_key);
      const meta: any = catMeta.get(r.category_key) ?? {};
      categories.push({
        category_key: r.category_key,
        name: meta.name ?? r.category_key,
        description: meta.description ?? null,
        color: meta.color ?? null,
        weight: meta.weight ?? null,
        display_order: meta.display_order ?? null,
        category_score: r.category_score,
        confidence: r.confidence,
        coverage: r.coverage,
        kpis_with_data: r.kpis_with_data,
        period: r.period,
        is_illustrative: r.is_illustrative,
      });
    }
    categories.sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999));

    const health_series = hsRes.data ?? [];
    const health = health_series.length ? health_series[health_series.length - 1] : null;
    const latest_period = (health as any)?.period ?? metrics[0]?.period ?? null;

    return json(200, {
      ok: true,
      has_own_account: true,
      owned_count: owned.length,
      account: publicAccount(acc),
      latest_period,
      health,
      health_series,
      categories,
      metrics,
      alerts: alRes.data ?? [],
      sources: srcRes.data ?? [],
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
