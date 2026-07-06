import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// onboarding-progress: per-console-user onboarding UI progress for the V6 Jana-Onboarding-Coach.
// Stores ONLY small onboarding UI flags (tour seen, milestones celebrated, first-value shown).
// No signal data, no PII beyond the email key.
//
// Auth model (mirror of my-signals / consent):
//   1. Read the console session token from header `x-console-token`.
//   2. Validate it against the UseEasy-auth project (/auth/v1/user) - NOT the Capital project.
//   3. Key the row by the lowercased account email; read/write via service_role (RLS bypass).
// The table (public.jana_onboarding_progress) is deny-by-default for anon/authenticated, so this
// function is the only path in. Works from the very first login - even before a cap_account exists.

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

// Whitelist of onboarding flags. Anything else in a patch is dropped, so this store
// can never become a dumping ground for arbitrary data via a valid console token.
const BOOL_KEYS = new Set([
  "tour_completed", "tour_skipped", "welcome_dismissed", "checklist_dismissed",
  "first_value_seen", "asked_jana", "seen_weekly", "badges_intro_dismissed",
]);
const NUM_KEYS = new Set(["tour_step"]);
const STR_KEYS = new Set(["first_value_kind"]);
const ARR_KEYS = new Set(["explained_kpis", "seen_overlays", "nudges_dismissed"]);

const MAX_ARR = 200;
const MAX_STR = 120;

function sanitizePatch(raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (BOOL_KEYS.has(k)) { if (typeof v === "boolean") out[k] = v; }
    else if (NUM_KEYS.has(k)) { if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(0, Math.min(999, Math.round(v))); }
    else if (STR_KEYS.has(k)) { if (typeof v === "string") out[k] = v.slice(0, MAX_STR); }
    else if (ARR_KEYS.has(k)) {
      if (Array.isArray(v)) {
        const seen = new Set<string>();
        for (const item of v) {
          if (typeof item !== "string") continue;
          const s = item.slice(0, MAX_STR);
          if (!seen.has(s)) seen.add(s);
          if (seen.size >= MAX_ARR) break;
        }
        out[k] = Array.from(seen);
      }
    }
    // unknown key -> dropped
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const consoleToken = req.headers.get("x-console-token") ?? "";
    if (!consoleToken) return json(401, { ok: false, error: "missing_console_token" });

    // 1) Validate the console session against the AUTH project.
    const ur = await fetch(`${AUTH_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${consoleToken}`, apikey: AUTH_ANON },
    });
    if (!ur.ok) return json(401, { ok: false, error: "invalid_console_session" });
    const user = await ur.json();
    const email = String(user?.email ?? "").toLowerCase().trim();
    if (!email) return json(401, { ok: false, error: "no_email" });

    let body: any = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }
    const action = String(body?.action ?? "get");

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (action === "set") {
      const patch = sanitizePatch(body?.patch);
      // read-modify-write shallow merge (single-user, low-frequency -> race-tolerant).
      const { data: existing, error: re } = await svc
        .from("jana_onboarding_progress").select("progress").eq("user_email", email).maybeSingle();
      if (re) return json(500, { ok: false, error: re.message });
      const merged = { ...((existing?.progress as Record<string, unknown>) ?? {}), ...patch };
      const { data: up, error: ue } = await svc
        .from("jana_onboarding_progress")
        .upsert({ user_email: email, progress: merged, updated_at: new Date().toISOString() }, { onConflict: "user_email" })
        .select("progress").maybeSingle();
      if (ue) return json(500, { ok: false, error: ue.message });
      return json(200, { ok: true, has_user: true, progress: up?.progress ?? merged });
    }

    // default: get
    const { data, error } = await svc
      .from("jana_onboarding_progress").select("progress").eq("user_email", email).maybeSingle();
    if (error) return json(500, { ok: false, error: error.message });
    return json(200, { ok: true, has_user: !!data, progress: (data?.progress as Record<string, unknown>) ?? {} });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
});
