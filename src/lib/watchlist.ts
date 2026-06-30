// Investor watchlist — localStorage primary (instant/offline), with optional
// cross-device server sync via the 'watchlist' edge function (console-session
// validated). Anon investors get localStorage only; logged-in get sync.
import { useCallback, useSyncExternalStore } from "react";
import { supabase as authClient } from "@/integrations/supabase/client";

const LS_KEY = "ue_cap_watchlist";
const FN_URL = "https://vunhcexnwbvxrwecymiy.functions.supabase.co/watchlist";
const CAPITAL_ANON = "sb_publishable_FXGJwwQt69sfmWS3cuF37g_hYALbbe2";

function load(): string[] {
  if (typeof localStorage === "undefined") return [];
  try { const v = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
let slugs: string[] = load();
const subs = new Set<() => void>();
function emit() { try { localStorage.setItem(LS_KEY, JSON.stringify(slugs)); } catch { /* private mode */ } subs.forEach((f) => f()); }

function subscribe(f: () => void) { subs.add(f); return () => subs.delete(f); }
function getSnapshot() { return slugs; }

export function isWatched(slug: string) { return slugs.includes(slug); }
export function setAllWatched(next: string[]) {
  const uniq = Array.from(new Set(next));
  if (uniq.length === slugs.length && uniq.every((s) => slugs.includes(s))) return; // no-op (stable ref)
  slugs = uniq; emit();
}

async function consoleToken(): Promise<string> {
  try { const { data: { session } } = await authClient.auth.getSession(); return session?.access_token ?? ""; }
  catch { return ""; }
}
async function callWatchlist(action: string, slug?: string) {
  const token = await consoleToken();
  if (!token) return null; // anon → localStorage only
  try {
    const res = await fetch(FN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: CAPITAL_ANON, "x-console-token": token },
      body: JSON.stringify({ action, slug }),
    });
    return await res.json().catch(() => null);
  } catch { return null; }
}

// One-time merge: pull server list, union with local, then push any local-only
// follows up so both sides converge (cross-device).
export async function syncWatchlistFromServer() {
  const j = await callWatchlist("list");
  if (!j || !j.ok) return;
  const server: string[] = Array.isArray(j.slugs) ? j.slugs : [];
  const localOnly = slugs.filter((s) => !server.includes(s));
  setAllWatched([...server, ...slugs]);
  for (const s of localOnly) callWatchlist("follow", s); // best-effort push-up
}

export async function toggleWatched(slug: string) {
  const willWatch = !slugs.includes(slug);
  slugs = willWatch ? [...slugs, slug] : slugs.filter((s) => s !== slug);
  emit(); // optimistic
  await callWatchlist(willWatch ? "follow" : "unfollow", slug); // best-effort
}

export function useWatchlist() {
  const watched = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const toggle = useCallback((slug: string) => { void toggleWatched(slug); }, []);
  return { watched, isWatched: (s: string) => watched.includes(s), toggle, count: watched.length };
}
