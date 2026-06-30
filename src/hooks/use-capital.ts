import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { capital } from "@/integrations/capital/client";
import { supabase as authClient } from "@/integrations/supabase/client";
import type {
  CapAccount, CapCategory, CapMetric, CapSource,
  HealthPoint, CategoryPoint, MetricValue,
  CapAlert, CapHealthBenchmark, CapCategoryBenchmark,
} from "@/lib/capital";
import { uploadCapitalStatement, getCapitalBankStatus, connectCapitalBank, callbackCapitalBank, syncCapitalBank, getCapitalAccountingStatus, connectCapitalAccounting, callbackCapitalAccounting, syncCapitalAccounting, getCapitalStripeStatus, connectCapitalStripe, callbackCapitalStripe, syncCapitalStripe, getCapitalShopifyStatus, connectCapitalShopify, callbackCapitalShopify, syncCapitalShopify } from "@/lib/api-client";

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

export function useCapAccounts(opts?: { consentedOnly?: boolean; type?: "demo" | "tenant" }) {
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

export function useCapAccountBySlug(slug: string) {
  return useQuery({
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
