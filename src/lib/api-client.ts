import { supabase } from "@/integrations/supabase/client";

const API_BASE = "https://api.useeasy.ai/v1/dashboard";

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    // Force sign-out so ProtectedRoute redirects to /login
    await supabase.auth.signOut();
    throw new ApiError(401, "Sitzung abgelaufen");
  }

  if (!res.ok) {
    throw new ApiError(res.status, `API Fehler ${res.status}`);
  }

  return res.json();
}

// ── POST / DELETE helpers ────────────────────────────

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");

  const baseUrl = path.startsWith("/v1/knowledge") || path.startsWith("/v1/spreadsheet")
    ? "https://api.useeasy.ai"   // knowledge + spreadsheet endpoints sit outside /dashboard
    : API_BASE.replace("/dashboard", "");

  const url = path.startsWith("/v1/") ? `${baseUrl}${path}` : `${API_BASE}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    await supabase.auth.signOut();
    throw new ApiError(401, "Sitzung abgelaufen");
  }

  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, data.error || `API Fehler ${res.status}`);
  }
  return data;
}

async function apiDelete<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");

  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    await supabase.auth.signOut();
    throw new ApiError(401, "Sitzung abgelaufen");
  }

  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, data.error || `API Fehler ${res.status}`);
  }
  return data;
}

// ── Types ──────────────────────────────────────────────

export interface TenantInfo {
  tenant_id: string;
  tenant_name?: string;
  status: string;
  mailbox_profile?: string;
  gmail_enabled?: boolean;
  outlook_enabled?: boolean;
  spreadsheet_enabled?: boolean;
  plan?: string;
  [key: string]: unknown;
}

export interface SetupInfo {
  status: "ready" | "needs_mailbox" | "needs_pack" | "not_onboarded" | "inactive";
  complete: boolean;
  checks?: {
    tenant_exists?: boolean;
    tenant_active?: boolean;
    mailbox_connected?: boolean;
    pack_assigned?: boolean;
    rules_loaded?: boolean;
  };
}

export interface PlanInfo {
  name: string;
  mailbox_limit: number;
  active_mailboxes: number;
  email_limit: number;
  emails_used: number;
  draft_limit: number;
  drafts_used: number;
}

export interface UserInfo {
  user: {
    email: string;
    domain?: string;
    tenant_id?: string;
    role?: string;
    [key: string]: unknown;
  };
  tenant?: TenantInfo;
  plan?: PlanInfo;
  playbooks?: {
    pack_key?: string;
    active_rules_count?: number;
    rules?: Array<Record<string, unknown>>;
  };
  setup?: SetupInfo;
  [key: string]: unknown;
}

export interface PlaybookRule {
  name: string;
  priority: string;
  action: string;
  active: boolean;
  confidence_threshold: number;
}

export interface Playbook {
  name: string;
  active: boolean;
  rules_total: number;
  rules_active: number;
  rules: PlaybookRule[];
}

export interface PlaybooksResponse {
  ok: boolean;
  pack_key: string;
  playbooks: Playbook[];
  total_rules: number;
  active_rules: number;
}

export interface DashboardStatsResponse {
  ok?: boolean;
  tenant_id?: string;
  stats?: DashboardStats;
  // Also support flat format
  emails_today?: number;
  emails_week?: number;
  priority_breakdown?: Record<string, number>;
  drafts_created_week?: number;
  resolved_week?: number;
  [key: string]: unknown;
}

export interface DashboardStats {
  emails_today: number;
  emails_week: number;
  emails_total?: number;
  priority_breakdown: Record<string, number>;
  drafts_created_week: number;
  resolved_week: number;
}

export interface RecentEmail {
  id: string;
  subject: string;
  sender: string;
  priority: "P0" | "P1" | "P2" | "P3";
  action_type: string;
  status: string;
  created_at: string;
  has_draft: boolean;
  [key: string]: unknown;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  mailbox: string;
  subject: string;
  priority: "P0" | "P1" | "P2" | "P3";
  category: string;
  playbook: string;
  playbook_version: string;
  decision: string;
  reason: string;
  evidence: string[];
  confidence: number;
  policy_hits: string[];
  user_action: string;
  actor: string;
  [key: string]: unknown;
}

// ── Knowledge Base Types ─────────────────────────────

export interface KnowledgeUpload {
  upload_id: string;
  source_type: "website" | "legal" | "document";
  title: string;
  source_url: string | null;
  status: "processing" | "done" | "failed";
  chunks_created: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface KnowledgeListResponse {
  ok: boolean;
  uploads: KnowledgeUpload[];
  total_chunks: number;
  total_chars: number;
}

export interface KnowledgeUploadResponse {
  ok: boolean;
  upload_id: string;
  chunks_created: number;
}

export interface KnowledgeCrawlResponse {
  ok: boolean;
  upload_id: string;
  pages_crawled: number;
  chunks_created: number;
  status: string;
}

export interface KnowledgeDeleteResponse {
  ok: boolean;
  deleted_chunks: number;
}

// ── Spreadsheet / Excel Live-Sync Types (v4.4.1) ────

export interface SpreadsheetConnection {
  id: number;
  sheet_name: string;
  provider: "google_sheets" | "microsoft_graph" | "local";
  tab_name: string;
  purpose: "general" | "appointments" | "tenants" | "maintenance";
  purpose_keywords: string[];
  is_active: boolean;
  allow_row_insert: boolean;
  auto_provisioned: boolean;
  created_at: string;
  updated_at: string;
  mappings_count?: number;
}

export interface SpreadsheetColumnMapping {
  id: number;
  spreadsheet_id: number;
  semantic_field: string;
  column_ref: string;
  match_type: "exact" | "contains" | "regex";
  is_search_key: boolean;
  is_updatable: boolean;
}

export interface SpreadsheetAuditEntry {
  id: number;
  spreadsheet_id: number;
  sheet_name?: string;
  event_id: string | null;
  action: string;
  row_index: number | null;
  column_ref: string | null;
  old_value: string | null;
  new_value: string | null;
  performed_by: string;
  bulk_id: string | null;
  row_snapshot: Record<string, unknown> | null;
  source_email_subject: string | null;
  source_email_from: string | null;
  created_at: string;
}

export interface SpreadsheetListResponse {
  ok: boolean;
  spreadsheets: SpreadsheetConnection[];
  total: number;
}

export interface SpreadsheetMappingsResponse {
  ok: boolean;
  mappings: SpreadsheetColumnMapping[];
}

export interface SpreadsheetAuditResponse {
  ok: boolean;
  entries: SpreadsheetAuditEntry[];
  total: number;
  page: number;
  per_page: number;
}

export interface SpreadsheetUploadResponse {
  ok: boolean;
  spreadsheet_id: number;
  sheet_name: string;
  detected_headers: string[];
  auto_mapped: number;
  purpose: string;
}

export interface SpreadsheetRevertResponse {
  ok: boolean;
  reverted: number;
  bulk_id: string;
}

export interface SpreadsheetDeleteResponse {
  ok: boolean;
  deleted: boolean;
}

// ── Provider Token Storage ─────────────────────────────

let providerTokensStored = false;

export async function storeProviderTokens(): Promise<void> {
  if (providerTokensStored) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.provider_token) return;

  providerTokensStored = true;

  try {
    const res = await fetch('https://api.useeasy.ai/v1/auth/provider-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        provider_token: session.provider_token,
        provider_refresh_token: session.provider_refresh_token || null,
        provider: 'gmail',
      }),
    });
    const data = await res.json();
    console.log('[UseEasy] Provider tokens stored:', data.tenant_id, data.is_new_tenant ? '(new)' : '(existing)');
  } catch (e) {
    console.error('[UseEasy] Failed to store provider tokens:', e);
    providerTokensStored = false;
  }
}

// ── Fetchers ───────────────────────────────────────────

export const fetchMe = () => apiFetch<UserInfo>("/me");
export const fetchStats = async (): Promise<DashboardStats> => {
  const raw = await apiFetch<DashboardStatsResponse>("/stats");
  const s = raw.stats;
  return {
    emails_today: s?.emails_today ?? raw.emails_today ?? 0,
    emails_week: s?.emails_week ?? raw.emails_week ?? 0,
    emails_total: s?.emails_total ?? 0,
    priority_breakdown: s?.priority_breakdown ?? raw.priority_breakdown ?? {},
    drafts_created_week: s?.drafts_created_week ?? raw.drafts_created_week ?? 0,
    resolved_week: s?.resolved_week ?? raw.resolved_week ?? 0,
  };
};
export const fetchRecentEmails = () => apiFetch<RecentEmail[]>("/emails/recent");
export const fetchAuditLog = () => apiFetch<AuditLogEntry[]>("/audit");
export const fetchPlaybooks = () => apiFetch<PlaybooksResponse>("/playbooks");

// ── Knowledge Base Fetchers ──────────────────────────

export const fetchKnowledge = () => apiFetch<KnowledgeListResponse>("/knowledge");

export const uploadKnowledgeText = (payload: {
  source_type: "legal" | "document";
  title: string;
  content_text: string;
}) => apiPost<KnowledgeUploadResponse>("/v1/knowledge/upload", payload);

export const crawlKnowledgeUrl = (payload: {
  source_url: string;
  max_pages?: number;
}) => apiPost<KnowledgeCrawlResponse>("/v1/knowledge/crawl", {
  source_type: "website",
  ...payload,
});

export const deleteKnowledgeUpload = (uploadId: string) =>
  apiDelete<KnowledgeDeleteResponse>(`/knowledge/${uploadId}`);

// ── Spreadsheet / Excel Live-Sync Fetchers (v4.4.1) ──

export const fetchSpreadsheets = () =>
  apiFetch<SpreadsheetListResponse>("/spreadsheets");

export const fetchSpreadsheetMappings = (spreadsheetId: number) =>
  apiFetch<SpreadsheetMappingsResponse>(`/spreadsheets/${spreadsheetId}/mappings`);

export const fetchSpreadsheetAudit = (params?: {
  spreadsheet_id?: number;
  page?: number;
  per_page?: number;
}) => {
  const qs = new URLSearchParams();
  if (params?.spreadsheet_id) qs.set("spreadsheet_id", String(params.spreadsheet_id));
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch<SpreadsheetAuditResponse>(`/spreadsheets/audit${suffix}`);
};

export const uploadSpreadsheetFile = (payload: {
  file_name: string;
  file_content_base64: string;
}) => apiPost<SpreadsheetUploadResponse>("/v1/spreadsheet/upload", payload);

export const revertSpreadsheetAction = (bulkId: string) =>
  apiPost<SpreadsheetRevertResponse>("/v1/spreadsheet/revert", { bulk_id: bulkId });

export const deleteSpreadsheet = (spreadsheetId: number) =>
  apiDelete<SpreadsheetDeleteResponse>(`/spreadsheets/${spreadsheetId}`);

export const toggleSpreadsheet = (spreadsheetId: number, isActive: boolean) =>
  apiPost<{ ok: boolean }>(`/v1/spreadsheet/toggle`, {
    spreadsheet_id: spreadsheetId,
    is_active: isActive,
  });

// ── Stripe ────────────────────────────────────────────

export async function createStripePortalSession(): Promise<{ ok?: boolean; url?: string; fallback?: boolean; error?: string }> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");

  const res = await fetch(`${API_BASE.replace("/dashboard", "")}/stripe/create-portal-session`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  return res.json();
}