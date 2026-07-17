// ─────────────────────────────────────────────────────────────────────────────
// memory-api.ts — Read-Client fuer die useeasy-memory-engine (B1/B2 Gedaechtnis).
// Endpunkte (LIVE seit memory-engine v1.0.1, Kontrakt aus api.js v1.6.1):
//   GET /v1/memory/entities  ?limit&offset&q&role&sort  -> { ok, entities[] }
//   GET /v1/memory/episodes  ?scope&limit&offset        -> { ok, episodes[] }
// Auth: Bearer = Supabase-Console-Session-Token (gleiches Muster wie api-client);
// der Tenant wird SERVERSEITIG aus dem Token aufgeloest (Tenant-Isolation Layer 0).
// Alle Aufrufer degradieren still: Fehler -> Karte/Chip erscheint nicht.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";

const MEMORY_API_BASE = "https://api.useeasy.ai/v1/memory";

export interface MemoryEntity {
  entity_hash: string;
  entity_email: string | null;
  entity_domain: string | null;
  display_name: string | null;
  role_guess: "automated" | "counterpart" | "unknown" | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  msgs_90d: number | string | null;
  escalations_90d: number | string | null;
  high_prio_90d: number | string | null;
  threads_total: number | string | null;
  threads_open: number | string | null;
  threads_resolved: number | string | null;
  open_commitments: number | string | null;
  next_deadline_at: string | null;
  avg_resolution_hours: number | string | null;
  label_mix: unknown;
  calls_total: number | string | null;
  last_call_at: string | null;
  summary_note: string | null;
  summary_note_at: string | null;
  computed_at: string | null;
}

export interface MemoryEpisode {
  scope: "day" | "week" | "month";
  period_start: string;
  period_end: string;
  headline: string | null;
  narrative: string | null;
  stats: unknown;
  refs: unknown;
  source: string | null;
  model_id: string | null;
  updated_at: string | null;
}

async function memoryFetch<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) throw new Error("nicht_authentifiziert");
  const res = await fetch(`${MEMORY_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`memory_api_${res.status}`);
  return res.json();
}

export function fetchMemoryEntities(opts?: { q?: string; limit?: number; offset?: number; sort?: "msgs" }) {
  const p = new URLSearchParams();
  if (opts?.q) p.set("q", opts.q);
  if (opts?.limit) p.set("limit", String(opts.limit));
  if (opts?.offset) p.set("offset", String(opts.offset));
  if (opts?.sort) p.set("sort", opts.sort);
  const qs = p.toString();
  return memoryFetch<{ ok: boolean; entities: MemoryEntity[] }>(`/entities${qs ? `?${qs}` : ""}`);
}

export function fetchMemoryEpisodes(scope: "day" | "week" | "month", limit = 1) {
  return memoryFetch<{ ok: boolean; episodes: MemoryEpisode[] }>(`/episodes?scope=${scope}&limit=${limit}`);
}

// "Name <mail@x.de>" | "mail@x.de" -> nackte Adresse (lowercase) oder null.
export function extractEmailAddress(sender?: string | null): string | null {
  if (!sender) return null;
  const m = sender.match(/<([^<>\s]+@[^<>\s]+)>/);
  const addr = (m ? m[1] : sender).trim().toLowerCase();
  return addr.includes("@") && !addr.includes(" ") ? addr : null;
}

// pg numeric kommt als String an -> tolerant zu Number koerzieren.
export function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
