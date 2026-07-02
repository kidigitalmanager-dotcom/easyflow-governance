import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { capital } from "@/integrations/capital/client";
import { supabase as authClient } from "@/integrations/supabase/client";
import type {
  CapAccount, CapCategory, CapMetric, CapSource,
  HealthPoint, CategoryPoint, MetricValue,
  CapAlert, CapHealthBenchmark, CapCategoryBenchmark, FreshnessRow,
} from "@/lib/capital";
import { uploadCapitalStatement, getCapitalBankStatus, connectCapitalBank, callbackCapitalBank, syncCapitalBank, getCapitalAccountingStatus, connectCapitalAccounting, callbackCapitalAccounting, syncCapitalAccounting, getCapitalStripeStatus, connectCapitalStripe, callbackCapitalStripe, syncCapitalStripe, getCapitalShopifyStatus, connectCapitalShopify, callbackCapitalShopify, syncCapitalShopify, connectCapitalShopifyToken } from "@/lib/api-client";

export function useCapCatalog() {
  return useQuery({
    queryKey: ["cap", "catalog"],
    queryFn: async () => {
      const [cats, mets, srcs] = await Promise.all([
        capital.from("cap_categories").select("*").order("display_order"),
        capital.from("cap_metrics").select("*").order("display_order"),
        capital.from("cap_sources").select("*").order("display_order"),
      ]);
      if (cats.error) throw cats.error;
      if (mets.error) throw mets.error;
      if (srcs.error) throw srcs.error;
      return {
        categories: (cats.data ?? []) as CapCategory[],
        metrics: (mets.data ?? []) as CapMetric[],
        sources: (srcs.data ?? []) as CapSource[],
      };
    },
  });
}

export function useCapAccounts(opts?: { consentedOnly?: boolean; type?: "demo" | "tenant" | "external" }) {
  return useQuery({
    queryKey: ["cap", "accounts", opts],
    queryFn: async () => {
      let q = capital.from("cap_accounts").select("*").order("name");
      if (opts?.consentedOnly) q = q.eq("consent_data_sharing", true);
      if (opts?.type) q = q.eq("account_type", opts.type);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CapAccount[];
    },
  });
}

export function useCapLatest(opts?: { consentedOnly?: boolean }) {
  return useQuery({
    queryKey: ["cap", "latest", opts],
    queryFn: async () => {
      const { data, error } = await capital.from("cap_account_latest").select("*");
      if (error) throw error;
      let rows = (data ?? []) as any[];
      if (opts?.consentedOnly) rows = rows.filter((r) => r.consent_data_sharing);
      return rows;
    },
  });
}

export function useHealthSeries(accountId?: string) {
  return useQuery({
    enabled: !!accountId,
    queryKey: ["cap", "health", accountId],
    queryFn: async () => {
      const { data, error } = await capital
        .from("cap_health_scores").select("*").eq("account_id", accountId!).order("period");
      if (error) throw error;
      return (data ?? []) as HealthPoint[];
    },
  });
}

export function useCategorySeries(accountId?: string) {
  return useQuery({
    enabled: !!accountId,
    queryKey: ["cap", "categories", accountId],
    queryFn: async () => {
      const { data, error } = await capital
        .from("cap_category_scores").select("*").eq("account_id", accountId!).order("period");
      if (error) throw error;
      return (data ?? []) as CategoryPoint[];
    },
  });
}

export function useMetricValues(accountId?: string) {
  return useQuery({
    enabled: !!accountId,
    queryKey: ["cap", "values", accountId],
    queryFn: async () => {
      const { data, error } = await capital
        .from("cap_metric_values").select("*").eq("account_id", accountId!).order("period");
      if (error) throw error;
      return (data ?? []) as MetricValue[];
    },
  });
}

export function useCapAccountBySlug(slug: string, opts?: { enabled?: boolean }) {
  return useQuery({
    enabled: opts?.enabled ?? true,
    queryKey: ["cap", "account", slug],
    queryFn: async () => {
      const { data, error } = await capital.from("cap_accounts").select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as CapAccount | null;
    },
  });
}

const CAPITAL_CONSENT_URL = "https://vunhcexnwbvxrwecymiy.functions.supabase.co/consent";
const CAPITAL_ANON = "sb_publishable_FXGJwwQt69sfmWS3cuF37g_hYALbbe2";

// Consent goes through the verified 'consent' edge function: it validates the console
// session (auth project) via x-console-token and writes with service-role. The anon RPC
// path was revoked server-side.
async function callConsent(slug: string, action: "grant" | "revoke", version: string) {
  const { data: { session } } = await authClient.auth.getSession();
  const token = session?.access_token ?? "";
  const res = await fetch(CAPITAL_CONSENT_URL, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: CAPITAL_ANON, "x-console-token": token },
    body: JSON.stringify({ slug, action, version }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) throw new Error(j.error || ("consent_failed_" + res.status));
  return j;
}

export function useRecordConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { slug: string; email?: string; version: string }) => callConsent(v.slug, "grant", v.version),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cap"] }); },
  });
}

export function useRevokeConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { slug: string }) => callConsent(v.slug, "revoke", "v1.0"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cap"] }); },
  });
}

// Capital-Layer F2 — Finanz-Export hochladen → fin_*-Indizes neu berechnen.
export function useUploadCapitalStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { file_name: string; file_content_base64: string }) => uploadCapitalStatement(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cap"] }); },
  });
}

// ── Capital-Layer F3: Live-Bank-Connect (finAPI) ──
export function useCapitalBankStatus() {
  return useQuery({
    queryKey: ["cap", "bank", "status"],
    queryFn: () => getCapitalBankStatus(),
    retry: false,
  });
}
export function useConnectCapitalBank() {
  return useMutation({ mutationFn: () => connectCapitalBank() });
}
export function useCapitalBankCallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { state: string }) => callbackCapitalBank(vars.state),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cap"] }); },
  });
}
export function useSyncCapitalBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncCapitalBank(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cap"] }); },
  });
}

// ── Capital-Layer Schicht 2: Buchhaltungs-Connector (Maesn) ──
export function useCapitalAccountingStatus() {
  return useQuery({
    queryKey: ["cap", "accounting", "status"],
    queryFn: () => getCapitalAccountingStatus(),
    retry: false,
  });
}
export function useConnectCapitalAccounting() {
  return useMutation({ mutationFn: (vars: { target: string }) => connectCapitalAccounting(vars.target) });
}
export function useCapitalAccountingCallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { state: string; account_key?: string; ts?: string; signature?: string }) => callbackCapitalAccounting(vars),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cap"] }); },
  });
}
export function useSyncCapitalAccounting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncCapitalAccounting(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cap"] }); },
  });
}

// ── Capital-Layer Step 3: Stripe ──
export function useCapitalStripeStatus() {
  return useQuery({
    queryKey: ["cap", "stripe", "status"],
    queryFn: () => getCapitalStripeStatus(),
    retry: false,
  });
}
export function useConnectCapitalStripe() {
  return useMutation({ mutationFn: () => connectCapitalStripe() });
}
export function useCapitalStripeCallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { code: string; state: string }) => callbackCapitalStripe(vars.code, vars.state),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cap"] }); },
  });
}
export function useSyncCapitalStripe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncCapitalStripe(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cap"] }); },
  });
}

// ── Capital-Layer Step 3: Shopify ──
export function useCapitalShopifyStatus() {
  return useQuery({
    queryKey: ["cap", "shopify", "status"],
    queryFn: () => getCapitalShopifyStatus(),
    retry: false,
  });
}
export function useConnectCapitalShopify() {
  return useMutation({ mutationFn: (vars: { shop: string }) => connectCapitalShopify(vars.shop) });
}
export function useCapitalShopifyCallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { params: Record<string, string> }) => callbackCapitalShopify(vars.params),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cap"] }); },
  });
}
export function useConnectCapitalShopifyToken() {
  return useMutation({ mutationFn: (vars: { shop: string; token: string }) => connectCapitalShopifyToken(vars.shop, vars.token) });
}
export function useSyncCapitalShopify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncCapitalShopify(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cap"] }); },
  });
}

// ── Forecast / alerts (Step 1) ───────────────────────────────────────────────
// cap_alert_feed is a pre-joined, RLS-respecting view (anon sees demo+consented).
export function useAlerts(opts?: { openOnly?: boolean }) {
  const openOnly = opts?.openOnly ?? true;
  return useQuery({
    queryKey: ["cap", "alerts", { openOnly }],
    queryFn: async () => {
      let q = capital.from("cap_alert_feed").select("*")
        .order("severity_rank", { ascending: false })
        .order("last_evaluated_at", { ascending: false });
      if (openOnly) q = q.eq("status", "open");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CapAlert[];
    },
    refetchOnWindowFocus: false,
  });
}


export function useFreshness(accountId?: string) {
  return useQuery({
    enabled: !!accountId,
    queryKey: ["cap", "freshness", accountId],
    queryFn: async () => {
      const { data, error } = await capital.from("cap_freshness").select("*")
        .eq("account_id", accountId!);
      if (error) throw error;
      return (data ?? []) as FreshnessRow[];
    },
    refetchOnWindowFocus: false,
  });
}

export function useAccountAlerts(accountId?: string) {
  return useQuery({
    enabled: !!accountId,
    queryKey: ["cap", "alerts", "account", accountId],
    queryFn: async () => {
      const { data, error } = await capital.from("cap_alert_feed").select("*")
        .eq("account_id", accountId!).eq("status", "open")
        .order("severity_rank", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CapAlert[];
    },
    refetchOnWindowFocus: false,
  });
}

export function useHealthBenchmark() {
  return useQuery({
    queryKey: ["cap", "benchmark", "health"],
    queryFn: async () => {
      const { data, error } = await capital.from("cap_health_benchmark").select("*");
      if (error) throw error;
      return (data ?? []) as CapHealthBenchmark[];
    },
  });
}

export function useCategoryBenchmark() {
  return useQuery({
    queryKey: ["cap", "benchmark", "category"],
    queryFn: async () => {
      const { data, error } = await capital.from("cap_category_benchmark").select("*");
      if (error) throw error;
      return (data ?? []) as CapCategoryBenchmark[];
    },
  });
}


// ── /signale: the logged-in tenant's OWN signals via the authenticated my-signals edge function ──
// Mirrors callConsent: the console session (auth project) is validated with x-console-token; the edge
// function reads with service_role, so a consent=false tenant still sees THEIR OWN 0–100 indices.
// Consent (grant/revoke above) now only controls investor visibility, never this own-data view.
const CAPITAL_MY_SIGNALS_URL = "https://vunhcexnwbvxrwecymiy.functions.supabase.co/my-signals";

export type MySignalsDash = { health: HealthPoint[]; categories: CategoryPoint[]; values: MetricValue[]; alerts: CapAlert[]; freshness: FreshnessRow[] };
export type MySignals = { has_own_account: boolean; owned_count: number; account: CapAccount | null; dash: MySignalsDash | null };

export function useMySignals() {
  return useQuery<MySignals>({
    queryKey: ["cap", "my-signals"],
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const empty: MySignals = { has_own_account: false, owned_count: 0, account: null, dash: null };
      const { data: { session } } = await authClient.auth.getSession();
      const token = session?.access_token ?? "";
      if (!token) return empty;
      const res = await fetch(CAPITAL_MY_SIGNALS_URL, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: CAPITAL_ANON, "x-console-token": token },
      });
      if (res.status === 401) return empty; // not a resolvable tenant -> caller falls back to demo
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok || !j.ok) throw new Error(j.error || ("my_signals_failed_" + res.status));
      if (!j.has_own_account || !j.account) return { ...empty, owned_count: j.owned_count ?? 0 };

      const aid = j.account.id as string;
      const account: CapAccount = {
        id: j.account.id, name: j.account.name, slug: j.account.slug, domain: j.account.domain ?? null,
        vertical: j.account.vertical ?? null, account_type: j.account.account_type,
        consent_data_sharing: !!j.account.consent_data_sharing, consent_at: j.account.consent_at ?? null,
        status: j.account.status, failure_month: j.account.failure_month ?? null,
      };
      const health: HealthPoint[] = (j.health_series ?? []).map((h: any) => ({
        account_id: aid, period: h.period, health_score: h.health_score,
        confidence: h.confidence, coverage: h.coverage, is_illustrative: h.is_illustrative,
      }));
      const categories: CategoryPoint[] = (j.categories ?? []).map((c: any) => ({
        account_id: aid, category_key: c.category_key, period: c.period, category_score: c.category_score,
        confidence: c.confidence, coverage: c.coverage, kpis_with_data: c.kpis_with_data, is_illustrative: c.is_illustrative,
      }));
      const values: MetricValue[] = (j.metrics ?? []).map((m: any) => ({
        account_id: aid, metric_key: m.metric_key, period: m.period, value: m.value,
        confidence: m.confidence, coverage: m.coverage, provenance: m.provenance ?? {}, is_illustrative: m.is_illustrative,
      }));
      const alerts: CapAlert[] = (j.alerts ?? []).map((a: any) => ({
        id: a.id ?? 0, account_id: aid, scope: a.scope, subject_key: a.subject_key, kind: a.kind,
        severity: a.severity, severity_rank: a.severity_rank, status: a.status, message: a.message,
        window_months: a.window_months, value_now: a.value_now, slope: a.slope, projection: a.projection ?? null,
        period: a.period, confidence: a.confidence, coverage: a.coverage, is_illustrative: a.is_illustrative,
        first_detected_at: a.first_detected_at ?? "", last_evaluated_at: a.last_evaluated_at ?? "",
      }));
      const freshness: FreshnessRow[] = (j.freshness ?? []) as FreshnessRow[];
      return { has_own_account: true, owned_count: j.owned_count ?? 1, account, dash: { health, categories, values, alerts, freshness } };
    },
  });
}
