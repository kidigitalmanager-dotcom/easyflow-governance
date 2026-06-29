// Capital-Layer signal store — SEPARATE Supabase project.
// Holds only aggregated 0–100 indices + provenance. No PII, no raw mail.
// Auth/operational data stays in the primary client (integrations/supabase/client.ts).
import { createClient } from "@supabase/supabase-js";

const CAPITAL_URL = "https://vunhcexnwbvxrwecymiy.supabase.co";
// Publishable (anon) key — read-only via RLS (demo + consented accounts only).
const CAPITAL_ANON_KEY = "sb_publishable_FXGJwwQt69sfmWS3cuF37g_hYALbbe2";

export const capital = createClient(CAPITAL_URL, CAPITAL_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
