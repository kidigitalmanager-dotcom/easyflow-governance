import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { capital } from "@/integrations/capital/client";
import { supabase as authClient } from "@/integrations/supabase/client";
import type {
  CapAccount, CapCategory, CapMetric, CapSource,
  HealthPoint, CategoryPoint, MetricValue,
} from "@/lib/capital";
import { uploadCapitalStatement, getCapitalBankStatus, connectCapitalBank, callbackCapitalBank, syncCapitalBank } from "@/lib/api-client";

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
