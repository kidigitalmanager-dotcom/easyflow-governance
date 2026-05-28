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

// v4.39.0 — GET gegen die absolute /v1-Basis (außerhalb /dashboard), z.B.
// /v1/spreadsheet/* . Spiegelt die Base-URL-Logik von apiPost (apiFetch kann das
// nicht, weil es immer /dashboard voranstellt).
async function apiGetV1<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");

  const baseUrl = path.startsWith("/v1/knowledge") || path.startsWith("/v1/spreadsheet")
    ? "https://api.useeasy.ai"
    : API_BASE.replace("/dashboard", "");
  const url = path.startsWith("/v1/") ? `${baseUrl}${path}` : `${API_BASE}${path}`;

  const res = await fetch(url, {
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
    is_super_admin?: boolean;   // v4.23.0 (3B-0): Super-Admin-Gate (Backend /me)
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
  // v4.19.0 (Stufe 1): 7 Core-Keys mit DOMAIN-korrekten Anzeigenamen fuer den
  // "Richtiges Label setzen"-Picker (ecom-Default vs. real_estate/HV vs. ...).
  core_labels?: Array<{ core_key: string; display: string }>;
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
  draft_id?: string | null;   // v4.18.0: ECHTER draft_queue.draft_id (statt synthetisch)
  draft_body?: string | null; // v4.18.0: Draft-Text für Vorschau + Edit-Vorbefüllung
  response_type?: "reply" | "action" | "info"; // v4.18.8: empfohlene Reaktion (read-time)
  response_type_reason?: string;               // v4.18.8: Begründung der Ableitung
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
  confidence: number | null; // v4.18.0: null => "—" statt "0 %"
  policy_hits: string[];
  user_action: string;
  actor: string;
  shadow_decision?: string | null;   // v4.18.4: was der Autopilot autonom getan hätte
  shadow_reasons?: unknown;
  response_type?: "reply" | "action" | "info"; // v4.18.8: empfohlene Reaktion (read-time)
  response_type_reason?: string;               // v4.18.8
  applied_label?: string | null;               // v4.21.0: tatsächlich gesetztes UE-Label (Display)
  applied_core_key?: string | null;            // v4.21.0: Core-Key des gesetzten Labels (Picker-Markierung)
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

export interface SpreadsheetStyleRiskFeature {
  type: string;
  count: number;
  label: string;
}

export interface SpreadsheetStyleRisk {
  risk_score: "green" | "yellow" | "red" | "blocked" | "unknown";
  features: {
    red: SpreadsheetStyleRiskFeature[];
    yellow: SpreadsheetStyleRiskFeature[];
    green: SpreadsheetStyleRiskFeature[];
  };
  summary_de: string;
  warnings: string[];
  inspected_at: string;
}

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
  // v4.38.0 — XLSX-Diff-Tool: Style-Risk-Score auf Upload
  style_risk?: SpreadsheetStyleRisk | null;
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

// ── OneDrive / SharePoint Live-Sync Types (v4.39.0) ──
export interface SpreadsheetOneDriveFile {
  drive_id: string;
  item_id: string;
  name: string;
  size: number | null;
  web_url: string | null;
  last_modified: string | null;
  parent_path: string | null;
}

export interface SpreadsheetOneDriveListResponse {
  ok: boolean;
  files: SpreadsheetOneDriveFile[];
  total: number;
  error?: string;
  reconnect_required?: boolean;
}

export interface SpreadsheetConnectOneDriveResponse {
  ok: boolean;
  spreadsheet_id: number;
  sheet_name: string;
  provider: "microsoft_graph";
  detected_headers: string[];
  auto_mapped: boolean;
  mappings_count?: number;
  style_risk?: SpreadsheetStyleRisk | null;
  message?: string;
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
// v4.29.0 (1c): Operations-Assistenz — Timeout-Einstellung (Geduldig/Zügig).
export interface AssistantConfig {
  enabled: boolean;
  timeout_preset: "patient" | "brisk";
  default_max_steps: number;
  allowed_actions: string[];
  nudge_after_hours: number;
  expire_after_hours: number;
}
export const fetchAssistantConfig = () => apiFetch<AssistantConfig>("/assistant-config");
export const saveAssistantConfig = (body: {
  timeout_preset: "patient" | "brisk";
  enabled?: boolean;
  default_max_steps?: number;
  allowed_actions?: string[];
}) => apiSend<AssistantConfig>("PUT", "/assistant-config", body);
export const fetchPlaybooks = () => apiFetch<PlaybooksResponse>("/playbooks?legacy=1");

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

// ── OneDrive / SharePoint Live-Sync Fetchers (v4.39.0) ──
// listOneDriveFiles: .xlsx/.xlsm-Dateien im OneDrive des Tenants (Console-Picker).
// connectOneDrive: ausgewählte Datei als Live-Sync-Quelle verbinden (kein S3-Upload).
export const listOneDriveFiles = (q?: string) =>
  apiGetV1<SpreadsheetOneDriveListResponse>(
    `/v1/spreadsheet/onedrive/list${q ? `?q=${encodeURIComponent(q)}` : ""}`
  );

export const connectOneDrive = (payload: {
  drive_id: string;
  item_id: string;
  name?: string;
}) => apiPost<SpreadsheetConnectOneDriveResponse>("/v1/spreadsheet/connect/onedrive", payload);

/**
 * v4.36.0 — Download S3-Version der Tenant-Spreadsheet als .xlsx-Blob.
 * Backend setzt Content-Disposition mit Original-Dateinamen. Frontend triggert
 * den Browser-Download per anchor.click().
 */
export async function downloadSpreadsheet(spreadsheetId: number): Promise<void> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");

  const url = `https://api.useeasy.ai/v1/spreadsheet/download?spreadsheet_id=${encodeURIComponent(String(spreadsheetId))}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    await supabase.auth.signOut();
    throw new ApiError(401, "Sitzung abgelaufen");
  }
  if (!res.ok) {
    // Backend liefert bei Fehler JSON — versuchen zu lesen.
    let msg = `Download fehlgeschlagen (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }

  // Filename aus Content-Disposition extrahieren — Backend setzt
  // \`attachment; filename="<name>.xlsx"\`. Fallback auf generischen Namen.
  const cd = res.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename="?([^";]+)"?/i);
  const filename = match ? match[1] : `spreadsheet-${spreadsheetId}.xlsx`;

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Kleiner Verzögerung, dann Object-URL freigeben (Browser sonst hartnäckig).
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

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

// ════════════════════════════════════════════════════════════════════════════
// Voice & Sales-Calls — Customer Console v4.9.0 (Blöcke 2/3/4/6)
// Backend: useeasy-api-router /v1/dashboard/voice/* (JWT-authed)
// ════════════════════════════════════════════════════════════════════════════

// ── PATCH / PUT helper (gleiche Auth-Mechanik wie apiPost) ───────────

async function apiSend<T>(method: "PATCH" | "PUT", path: string, body: Record<string, unknown>): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");

  const url = path.startsWith("/v1/") ? `https://api.useeasy.ai${path}` : `${API_BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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

// ── Types ────────────────────────────────────────────────────────────

export type CallerIdStatus = "validated" | "pending" | "unverified";

export interface VoiceRep {
  rep_id: string;
  name: string;
  email: string | null;
  twilio_number: string | null;
  caller_id_status: CallerIdStatus;
  hubspot_user_id: string | null;
  active: boolean;
  vertriebler_id: string | null;
  client_id: string;
  deployed_url: string | null;
  call_count: number;
  last_call_at: string | null;
  created_at: string | null;
}

export interface VoiceRepsResponse {
  ok: boolean;
  tenant_id: string;
  copilot_tenant_id: string;
  reps: VoiceRep[];
  total: number;
  note?: string;
}

export interface VoiceRepMutationResponse {
  ok: boolean;
  rep?: Partial<VoiceRep>;
  vertriebler?: Record<string, unknown> | null;
  provisioning_hint?: string;
  rep_id?: string;
  deactivated?: boolean;
}

export interface SalesCall {
  call_id: string;
  rep_id: string;
  rep_name: string;
  direction: string | null;
  twilio_call_sid: string | null;
  lead_number: string | null;
  lead_id: string | null;
  to_number: string | null;
  from_number: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  outcome: string | null;
  recording_url: string | null;
  recording_sid: string | null;
  hubspot_activity_id: string | null;
  hubspot_url: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface SalesCallsResponse {
  ok: boolean;
  tenant_id: string;
  copilot_tenant_id: string;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  calls: SalesCall[];
  note?: string;
}

export interface RecordingConsentAuditEntry {
  id: string;
  action: "enabled" | "disabled" | "banner_updated";
  old_value: { enabled?: boolean; banner_text?: string | null } | null;
  new_value: { enabled?: boolean; banner_text?: string | null } | null;
  changed_by: string | null;
  created_at: string | null;
}

export interface RecordingConsentResponse {
  ok: boolean;
  tenant_id: string;
  recording_consent_enabled: boolean;
  recording_consent_banner_text: string | null;
  default_banner_text: string;
  updated_at: string | null;
  updated_by: string | null;
  config_row_exists: boolean;
  audit: RecordingConsentAuditEntry[];
  note?: string;
}

// ── Fetchers: Voice Reps (Block 2 + 4) ───────────────────────────────

export const fetchVoiceReps = () => apiFetch<VoiceRepsResponse>("/voice/reps");

export const createVoiceRep = (payload: {
  rep_id: string;
  name: string;
  email?: string;
  twilio_number?: string;
  caller_id_status?: CallerIdStatus;
}) => apiPost<VoiceRepMutationResponse>("/voice/reps", payload);

export const updateVoiceRep = (repId: string, payload: {
  name?: string;
  email?: string | null;
  twilio_number?: string | null;
  caller_id_status?: CallerIdStatus;
  active?: boolean;
}) => apiSend<VoiceRepMutationResponse>("PATCH", `/voice/reps/${encodeURIComponent(repId)}`, payload);

export const deleteVoiceRep = (repId: string) =>
  apiDelete<VoiceRepMutationResponse>(`/voice/reps/${encodeURIComponent(repId)}`);

// ── Fetchers: Sales Calls (Block 3) ──────────────────────────────────

export const fetchSalesCalls = (params?: {
  rep_id?: string;
  outcome?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) => {
  const qs = new URLSearchParams();
  if (params?.rep_id) qs.set("rep_id", params.rep_id);
  if (params?.outcome) qs.set("outcome", params.outcome);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch<SalesCallsResponse>(`/voice/calls${suffix}`);
};

// ── Fetchers: Recording Consent (Block 6) ────────────────────────────

export const fetchRecordingConsent = () =>
  apiFetch<RecordingConsentResponse>("/voice/consent");

export const updateRecordingConsent = (payload: {
  recording_consent_enabled?: boolean;
  recording_consent_banner_text?: string | null;
}) => apiSend<{
  ok: boolean;
  action: string;
  recording_consent_enabled: boolean;
  recording_consent_banner_text: string | null;
}>("PUT", "/voice/consent", payload);
// ════════════════════════════════════════════════════════════════════════════
// Jana-Autopilot — Customer Console v4.12.0 (Phase 3C, Block C)
// Backend: useeasy-api-router /v1/dashboard/autonomy-policy* (JWT-authed)
// ════════════════════════════════════════════════════════════════════════════

export type AutopilotChannel = "voice" | "email";

export interface AutonomyPolicy {
  tenant_id: string;
  channel: AutopilotChannel;
  enabled: boolean;
  allowed_intents: string[];
  confidence_threshold: number;
  trigger_on_inbound: boolean;
  trigger_on_stalled: boolean;
  stalled_days_threshold: number;
  active_hours_start: string;   // HH:MM
  active_hours_end: string;     // HH:MM
  active_days: number[];        // 1..7 (Mo..So)
  timezone: string;
  daily_cap: number;
  per_contact_cooldown_days: number;
  test_mode_enabled: boolean;
  test_phone_whitelist: string[];
  email_cta_enabled: boolean;
  hard_blocked_intents: string[];
  known_intents: string[];
  updated_at: string | null;
}

export interface AutonomyPolicyPayload {
  channel?: AutopilotChannel;
  enabled?: boolean;
  allowed_intents?: string[];
  confidence_threshold?: number;
  trigger_on_inbound?: boolean;
  trigger_on_stalled?: boolean;
  stalled_days_threshold?: number;
  active_hours_start?: string;
  active_hours_end?: string;
  active_days?: number[];
  timezone?: string;
  daily_cap?: number;
  per_contact_cooldown_days?: number;
  test_mode_enabled?: boolean;
  test_phone_whitelist?: string[];
  email_cta_enabled?: boolean;
}

export interface AutonomyPolicyResponse {
  ok: boolean;
  policy: AutonomyPolicy;
  warnings?: string[];
  filtered_hard_blocked?: string[];
}

export interface AutonomyPolicyNotFoundResponse {
  ok: false;
  error: "policy_not_found" | "autonomy_policy_table_missing";
  tenant_id?: string;
  channel?: AutopilotChannel;
  hard_blocked_intents?: string[];
  known_intents?: string[];
}

export interface AutonomyTestCallPayload {
  intent: string;
  confidence: number;
  phone?: string;
  subject?: string;
  risk_flags?: string[];
  channel?: AutopilotChannel;
}

export interface AutonomyTestCallGate {
  name: string;
  pass: boolean;
  reason?: string;
  detail?: unknown;
}

export interface AutonomyTestCallResponse {
  ok: boolean;
  overall_pass: boolean;
  gates: AutonomyTestCallGate[];
  input?: AutonomyTestCallPayload;
  note?: string;
}

export const fetchAutonomyPolicy = (channel: AutopilotChannel = "voice") =>
  apiFetch<AutonomyPolicyResponse | AutonomyPolicyNotFoundResponse>(
    `/autonomy-policy?channel=${encodeURIComponent(channel)}`,
  );

export const saveAutonomyPolicy = (payload: AutonomyPolicyPayload) =>
  apiSend<AutonomyPolicyResponse>("PUT", "/autonomy-policy", payload as Record<string, unknown>);

export const testAutonomyPolicy = (payload: AutonomyTestCallPayload) =>
  apiPost<AutonomyTestCallResponse>("/autonomy-policy/test-call", payload as unknown as Record<string, unknown>);

// ════════════════════════════════════════════════════════════════════════════
// Playbook-Picker — Customer Console v4.13.0 (Phase 3D)
// Backend: useeasy-api-router /v1/dashboard/playbooks{,/active} (JWT-authed)
// ════════════════════════════════════════════════════════════════════════════

export interface PlaybookPack {
  key: string;
  name: string;
  display_name: string;
  description: string | null;
  domain: string | null;
  is_system: boolean;
  is_pack_active: boolean;            // Pack auf System-Ebene aktiv (hat Rules)?
  is_active_for_tenant: boolean;      // Dieser Tenant nutzt ihn (im active_pack_keys)?
  rules_count: number;
  sort_order: number;
}

export interface PlaybookCatalogResponse {
  ok: boolean;
  tenant_id: string;
  plan: string;
  plan_pack_limit: number;
  active_pack_count: number;
  slots_remaining: number;
  packs: PlaybookPack[];
}

export interface PlaybookActivePayload {
  pack_keys: string[];
}

export interface PlaybookActiveResponse {
  ok: boolean;
  tenant_id: string;
  plan: string;
  plan_pack_limit: number;
  active_pack_keys: string[];
  primary_pack: string | null;
  rejected_unknown: string[];
  rejected_system: string[];
}

export const fetchPlaybookCatalog = () =>
  apiFetch<PlaybookCatalogResponse>("/playbooks");

export const savePlaybookActive = (payload: PlaybookActivePayload) =>
  apiSend<PlaybookActiveResponse>("PUT", "/playbooks/active", payload as unknown as Record<string, unknown>);


// ════════════════════════════════════════════════════════════════════════════
// Autopilot Email (Chat B + C, v4.16.0 + v4.17.x)
// Backend: useeasy-api-router /v1/dashboard/autopilot/* (JWT-authed)
//          + /v1/admin/ops/autopilot/* (Super-Admin)
// ════════════════════════════════════════════════════════════════════════════

export type AutopilotCoreKey = "status_fulfillment" | "request_order" | "returns_refund";
export type AutopilotHumanVerdict = "approve" | "edit" | "reject";
export type AutopilotMode = "shadow" | "assisted" | "autonomous";

// -- Feedback (Approve/Edit/Reject) -----------------------------------------
export interface AutopilotFeedbackInput {
  draft_id: string;
  human_verdict: AutopilotHumanVerdict;
  draft_body_final?: string;
}
export interface AutopilotFeedbackResponse {
  ok: boolean;
  draft_id: string;
  human_verdict: AutopilotHumanVerdict;
  autopilot_verdict: string | null;
  is_mismatch: boolean;
  edit_distance: number;
  new_status: "approved" | "rejected";
  created_by: string;
}
export const submitAutopilotFeedback = (input: AutopilotFeedbackInput) =>
  apiPost<AutopilotFeedbackResponse>("/autopilot/feedback", input as unknown as Record<string, unknown>);

// ── v4.18.0: Console Review-Queue (operativ) ───────────────────────────────
// Trennung von der Lernschleife (Briefing 0b): /review/verdict legt den Entwurf
// in den Gmail/Outlook-Entwürfe-Ordner (approve/edit) bzw. verwirft (reject) UND
// schreibt — nur bei Tenant in shadow/assisted — autopilot_feedback als
// Backend-Side-Effect. /draft/generate erzeugt on-demand einen Entwurf.
export interface ReviewVerdictInput {
  draft_id: string;
  human_verdict: AutopilotHumanVerdict;
  draft_body_final?: string;
}
export interface ReviewVerdictResponse {
  ok: boolean;
  draft_id: string;
  human_verdict: AutopilotHumanVerdict;
  new_status: "approved" | "rejected";
  mailbox_draft: { ok: boolean; provider: string | null; draft_message_id: string | null } | null;
  learning_recorded: boolean;
  is_mismatch: boolean;
  edit_distance: number;
  created_by: string;
}
export const submitReviewVerdict = (input: ReviewVerdictInput) =>
  apiPost<ReviewVerdictResponse>("/review/verdict", input as unknown as Record<string, unknown>);

export interface GenerateDraftResponse {
  ok: boolean;
  draft_id: string;
  event_id: string;
  subject: string;
  body: string;
  provider: string | null;
}
export const generateDraft = (eventId: string) =>
  apiPost<GenerateDraftResponse>("/draft/generate", { event_id: eventId });

// v4.18.3: Review-Queue-Items verwerfen/leeren (ohne Draft-Generierung).
export interface DismissReviewInput {
  event_id?: string;
  event_ids?: string[];
  scope?: "without_subject" | "all";
}
export interface DismissReviewResponse { ok: boolean; dismissed: number; by?: string }
export const dismissReview = (input: DismissReviewInput) =>
  apiPost<DismissReviewResponse>("/review/dismiss", input as unknown as Record<string, unknown>);

// v4.18.5: sicheres DB-Undo (Versand-Abbruch im Cooldown / verworfenes Item wieder öffnen).
export interface UndoInput { event_id: string; undo_type: "cancel_send" | "reopen"; }
export const undoAuditAction = (input: UndoInput) =>
  apiPost<{ ok: boolean; undo_type?: string; affected?: number }>("/audit/undo", input as unknown as Record<string, unknown>);

// v4.18.9: Label-Undo im Postfach — entfernt NUR UseEasy-Labels/Kategorien (UE/) einer Mail.
export interface RemoveLabelResponse {
  ok: boolean;
  provider?: string;
  removed?: string[];
  target_type?: string;
  target_id?: string | null;
  note?: string;
}
export const removeLabel = (eventId: string) =>
  apiPost<RemoveLabelResponse>("/label/remove", { event_id: eventId });

// v4.19.0 (Stufe 1): "Richtiges Label setzen" — UE-Label EINER Mail durch die korrekte
// Kategorie ersetzen (to_core_key = 7 Core-Keys | 'noise' = nur entfernen) und die
// Korrektur als Lern-Signal protokollieren.
export interface CorrectLabelResponse {
  ok: boolean;
  provider?: string;
  removed?: string[];
  applied?: string | null;
  from_core_key?: string | null;
  to_core_key?: string;
  target_id?: string | null;
}
export const correctLabel = (eventId: string, toCoreKey: string) =>
  apiPost<CorrectLabelResponse>("/label/correct", { event_id: eventId, to_core_key: toCoreKey });

// -- Promotion (Tenant-Anfrage) ---------------------------------------------
export interface AutopilotPromoteRequestInput {
  core_key: AutopilotCoreKey;
  target_mode: AutopilotMode;
}
export const requestAutopilotPromotion = (input: AutopilotPromoteRequestInput) =>
  apiPost<{ ok: boolean; request: Record<string, unknown> }>("/autopilot/promote-request", input as unknown as Record<string, unknown>);

// -- Few-Shot (Console-Anzeige) ----------------------------------------------
export interface AutopilotFewShotExample {
  draft_body_final: string | null;
  draft_body_original: string | null;
  human_verdict: "approve" | "edit";
  edit_distance: number;
  core_key: string | null;
  created_at: string;
}
export interface AutopilotFewShotResponse {
  ok: boolean;
  tenant_id: string;
  core_key: string | null;
  scope?: "per_core_key" | "tenant_wide";
  count: number;
  examples: AutopilotFewShotExample[];
  prompt_block: string;
}
export const fetchAutopilotFewShot = (coreKey: AutopilotCoreKey, n = 5) =>
  apiFetch<AutopilotFewShotResponse>(`/autopilot/few-shot?core_key=${encodeURIComponent(coreKey)}&n=${n}`);

// -- Audit-Log ---------------------------------------------------------------
export interface AutopilotLogRow {
  id: string;
  tenant_id: string;
  draft_id: string;
  event_id: string | null;
  core_key: string | null;
  confidence: number | null;
  action_type: string;
  decision: string;
  reasons: unknown;
  cooldown_until: string | null;
  sent_at: string | null;
  created_at: string;
}
export interface AutopilotLogResponse {
  ok: boolean;
  tenant_id: string;
  filters: { decision: string | null; action_type: string | null; since: string | null };
  pagination: { limit: number; offset: number; total: number; has_more: boolean };
  rows: AutopilotLogRow[];
}
export const fetchAutopilotLog = (params: { limit?: number; offset?: number; decision?: string; action_type?: string; since?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.limit != null)        qs.set("limit", String(params.limit));
  if (params.offset != null)       qs.set("offset", String(params.offset));
  if (params.decision)             qs.set("decision", params.decision);
  if (params.action_type)          qs.set("action_type", params.action_type);
  if (params.since)                qs.set("since", params.since);
  const q = qs.toString();
  return apiFetch<AutopilotLogResponse>(`/autopilot/log${q ? "?" + q : ""}`);
};

// -- Audit-Samples (Stichproben "nachträglich prüfen") -----------------------
export interface AutopilotAuditSampleRow {
  id: string;
  tenant_id: string;
  draft_id: string;
  event_id: string | null;
  core_key: string | null;
  confidence: number | null;
  autopilot_verdict: string | null;
  human_verdict: string | null;
  draft_body_original: string | null;
  draft_body_final: string | null;
  edit_distance: number;
  is_mismatch: boolean;
  created_by: string;
  created_at: string;
}
export interface AutopilotAuditSamplesResponse {
  ok: boolean;
  tenant_id: string;
  pagination: { limit: number; offset: number; total: number; has_more: boolean };
  rows: AutopilotAuditSampleRow[];
}
export const fetchAutopilotAuditSamples = (params: { limit?: number; offset?: number } = {}) => {
  const qs = new URLSearchParams();
  if (params.limit != null)  qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const q = qs.toString();
  return apiFetch<AutopilotAuditSamplesResponse>(`/autopilot/audit-samples${q ? "?" + q : ""}`);
};

// -- Policy GET + PUT --------------------------------------------------------
export interface AutopilotPolicy {
  tenant_id: string;
  enabled: boolean;
  kill_switch: boolean;
  global_mode: AutopilotMode;
  intent_whitelist: AutopilotCoreKey[];
  thresholds: Partial<Record<AutopilotCoreKey, number>>;
  cooldown_minutes: number;
  daily_cap: number;
  audit_sample_rate: number;
  legal_basis_ack: boolean;
  legal_basis_ack_at: string | null;
  legal_basis_ack_by: string | null;
  footer_enabled: boolean;
  footer_text: string | null;
  created_at: string;
  updated_at: string;
}
export interface AutopilotMaturityRow {
  core_key: string;
  mode: AutopilotMode;
  sample_count: number;
  shadow_mismatch_rate: number | null;
  edit_rate: number | null;
  reject_rate: number | null;
  audit_complaint_rate: number | null;
  promotion_ready: boolean;
  promotion_requested: boolean;
  promotion_requested_at: string | null;
  last_promoted_at: string | null;
  last_promoted_by: string | null;
  updated_at: string;
}
export interface AutopilotPolicyResponse {
  ok: boolean;
  policy: AutopilotPolicy;
  maturity: AutopilotMaturityRow[];
  hard_ceiling: { intents: string[]; intent_modes: Record<string, string> };
}
export const fetchAutopilotPolicy = () =>
  apiFetch<AutopilotPolicyResponse>("/autopilot/policy");

export interface AutopilotPolicyPutInput {
  enabled?: boolean;
  kill_switch?: boolean;
  global_mode?: AutopilotMode;
  intent_whitelist?: AutopilotCoreKey[];
  thresholds?: Partial<Record<AutopilotCoreKey, number>>;
  cooldown_minutes?: number;
  daily_cap?: number;
  audit_sample_rate?: number;
  footer_enabled?: boolean;
  footer_text?: string | null;
  legal_basis_ack?: boolean;
}
export const saveAutopilotPolicy = (input: AutopilotPolicyPutInput) =>
  apiSend<AutopilotPolicyResponse>("PUT", "/autopilot/policy", input as unknown as Record<string, unknown>);

// -- Super-Admin Promotion ---------------------------------------------------
export interface AutopilotPromotionPending {
  tenant_id: string;
  core_key: string;
  current_mode: AutopilotMode;
  sample_count: number;
  shadow_mismatch_rate: number | null;
  edit_rate: number | null;
  reject_rate: number | null;
  promotion_ready: boolean;
  promotion_requested: boolean;
  promotion_requested_at: string | null;
  promotion_requested_by: string | null;
  legal_basis_ack: boolean;
  legal_basis_ack_at: string | null;
}
export interface AutopilotPromotionPendingResponse {
  ok: boolean;
  count: number;
  pending: AutopilotPromotionPending[];
}
export const fetchAutopilotPromotionPending = () =>
  apiFetch<AutopilotPromotionPendingResponse>("/admin/ops/autopilot/promotion-pending".replace("/dashboard", ""));
// Hinweis: apiFetch nutzt API_BASE = /v1/dashboard. Wir trick'sen via path-replace
// auf /v1/admin/ops/... — apiFetch checkt path.startsWith("/v1/") nicht spezial,
// also explizit absoluten URL bauen:

export const fetchAutopilotPromotionPendingAdmin = async (): Promise<AutopilotPromotionPendingResponse> => {
  const token = await (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  })();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");
  const res = await fetch("https://api.useeasy.ai/v1/admin/ops/autopilot/promotion-pending", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 403) throw new ApiError(403, "super_admin_required");
  if (!res.ok) throw new ApiError(res.status, `promotion_pending_failed_${res.status}`);
  return res.json();
};

export interface AutopilotPromoteInput {
  tenant_id: string;
  core_key: string;
  target_mode: AutopilotMode;
}
export const promoteAutopilot = async (input: AutopilotPromoteInput) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) throw new ApiError(401, "Nicht authentifiziert");
  const res = await fetch("https://api.useeasy.ai/v1/admin/ops/autopilot/promote", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.error || `promote_failed_${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; promoted: Record<string, unknown>; promoted_by: string }>;
};

// ── Stufe 3B: Regel-Vorschläge (Super-Admin) ───────────────────────────────
export interface RuleSuggestion {
  pattern_key: string;
  tenant_id: string;
  to_core_key: string;
  sender_domain: string;
  tenant_domain: string | null;
  proposed_pack_key: string | null;
  sample_count: number;
  sample_subjects: string[];
  last_at: string | null;
  cross_tenant_count: number;
  cross_tenant_same_domain: boolean;
  suggested_scope: "tenant" | "pack" | "global";
}
export interface RuleSuggestionsResponse { ok: boolean; count: number; suggestions: RuleSuggestion[]; error?: string; }

export const fetchRuleSuggestions = async (): Promise<RuleSuggestionsResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) throw new ApiError(401, "Nicht authentifiziert");
  const res = await fetch("https://api.useeasy.ai/v1/admin/ops/rule-suggestions", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 403) throw new ApiError(403, "super_admin_required");
  if (!res.ok) throw new ApiError(res.status, `rule_suggestions_failed_${res.status}`);
  return res.json();
};

export interface DecideRuleSuggestionInput {
  pattern_key: string;
  decision: "approve" | "reject" | "dismiss";
  tenant_id?: string; to_core_key?: string; sender_domain?: string;
  tenant_domain?: string | null; pack_key?: string | null;
  scope?: "tenant" | "pack" | "global"; sample_count?: number; sample_subjects?: string[];
}
export const decideRuleSuggestion = async (input: DecideRuleSuggestionInput) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) throw new ApiError(401, "Nicht authentifiziert");
  const res = await fetch("https://api.useeasy.ai/v1/admin/ops/rule-suggestions/decide", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.error || `decide_failed_${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; id: number | null; pattern_key: string; status: string; scope: string }>;
};

// ── Stufe 3C: freigegebene Vorschläge anwenden/aktivieren ──────────────────
export interface ApprovedRuleSuggestion {
  pattern_key: string; tenant_id: string; to_core_key: string; sender_domain: string;
  tenant_domain: string | null; pack_key: string | null; scope: string; sample_count: number | null;
  applied_rule_key: string | null; applied_pack_key: string | null;
  applied_at: string | null; activated_at: string | null; decided_at: string | null;
  applied: boolean; active: boolean;
}
export interface ApprovedRuleSuggestionsResponse { ok: boolean; count: number; approved: ApprovedRuleSuggestion[]; error?: string; }

export const fetchApprovedRuleSuggestions = async (): Promise<ApprovedRuleSuggestionsResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) throw new ApiError(401, "Nicht authentifiziert");
  const res = await fetch("https://api.useeasy.ai/v1/admin/ops/rule-suggestions?status=approved", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 403) throw new ApiError(403, "super_admin_required");
  if (!res.ok) throw new ApiError(res.status, `approved_failed_${res.status}`);
  return res.json();
};

async function _adminPost(pathSuffix: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) throw new ApiError(401, "Nicht authentifiziert");
  const res = await fetch(`https://api.useeasy.ai/v1/admin/ops/rule-suggestions/${pathSuffix}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new ApiError(res.status, e.error || `${pathSuffix}_failed_${res.status}`); }
  return res.json();
}
export interface ApplyRuleInput {
  pattern_key: string; to_core_key: string; sender_domain: string;
  tenant_domain?: string | null; scope: "pack" | "global";
}
export const applyRuleSuggestion = (input: ApplyRuleInput) => _adminPost("apply", input as unknown as Record<string, unknown>);
export const activateRuleSuggestion = (patternKey: string) => _adminPost("activate", { pattern_key: patternKey });

// ── Stufe 3A: Kunden-"System verbessern?"-Karte (tenant-scoped) ────────────
export interface ImproveSuggestion { pattern_key: string; to_core_key: string; sender_domain: string; count: number; }
export interface ImproveSuggestionResponse { ok: boolean; suggestion: ImproveSuggestion | null; }
export const fetchImproveSuggestion = () => apiFetch<ImproveSuggestionResponse>("/improve-suggestions");
export const consentImproveSuggestion = (patternKey: string, toCoreKey: string, senderDomain: string) =>
  apiPost<{ ok: boolean; pattern_key: string }>("/improve-suggestions/consent", { pattern_key: patternKey, to_core_key: toCoreKey, sender_domain: senderDomain });

// ════════════════════════════════════════════════════════════════════════════
// v4.32.0 — Tenant-Setup (Voice/Assistenz, konsolidiert)
//   Super-Admin (tenant-wählbar):  /v1/admin/ops/tenant-setup*
//   Self-Serve (eigener Tenant):   /v1/dashboard/tenant-setup
// ════════════════════════════════════════════════════════════════════════════

export interface TenantSetupKnownValues {
  assistants: Array<{ id: string; label: string; is_default?: boolean }>;
  default_assistant_id: string;
  caller_ids: string[];
  packs: Array<{ pack_key: string; label: string; domain: string }>;
  action_options: Array<{ action: string; label: string }>;
  timeout_presets: Array<{ value: string; label: string }>;
  default_consent_banner: string;
  status_options?: string[];
  plan_options?: string[];
  protected_tenants?: string[];
}
export interface TenantSetupChecklistItem { key: string; label: string; ok: boolean; }
export interface TenantSetup {
  ok: boolean;
  scope: "admin" | "self";
  tenant_exists: boolean;
  tenant: {
    tenant_id: string; tenant_name: string; status: string | null; plan: string | null;
    admin_email: string | null; mailbox_profile: string | null; domain: string | null;
    active_pack_keys: string[]; gmail_enabled: boolean; outlook_enabled: boolean;
    protected?: boolean;
  };
  mailboxes?: Array<{ provider: string | null; email: string | null; token_expiry: string | null; expired: boolean | null }>;
  flags?: {
    spreadsheet_enabled: boolean; autopilot_enabled: boolean; autopilot_mode: string | null;
    autopilot_kill_switch: boolean; autopilot_legal_basis_ack: boolean; autopilot_policy_exists: boolean;
    auto_consent_on_inquiry?: boolean; email_cta_enabled?: boolean;
    telegram_enabled?: boolean; whatsapp_enabled?: boolean;
    hubspot_connected?: boolean; mailbox_count?: number;
  };
  voice: {
    jana_enabled: boolean; vapi_assistant_id: string | null; twilio_phone_number: string | null;
    vapi_phone_number_id: string | null; caller_id: string | null; domain: string | null;
    auto_consent_on_inquiry: boolean; config_row_exists: boolean;
  };
  consent: {
    recording_consent_enabled: boolean; recording_consent_banner_text: string | null;
    default_banner_text: string; updated_at: string | null; updated_by: string | null;
    audit: Array<{ id: number; action: string; changed_by: string | null; created_at: string | null }>;
  };
  assistant: {
    enabled: boolean; timeout_preset: string; default_max_steps: number;
    allowed_actions: string[]; voice_call_allowed: boolean;
    nudge_after_hours: number; expire_after_hours: number; config_row_exists: boolean;
  };
  voice_policy: {
    enabled: boolean; active_hours_start: string; active_hours_end: string;
    active_days: number[]; timezone: string; daily_cap: number;
    per_contact_cooldown_days: number; config_row_exists: boolean;
  };
  voice_ready: boolean;
  voice_ready_checklist: TenantSetupChecklistItem[];
  editable_sections: string[];
  known_values: TenantSetupKnownValues;
  applied?: string[];
  preset_applied?: boolean;
}

export interface TenantListItem {
  tenant_id: string; tenant_name: string; status: string | null; plan: string | null;
  mailbox_profile: string | null; gmail_enabled: boolean; outlook_enabled: boolean;
  jana_enabled: boolean; recording_consent_enabled: boolean;
  voice_call_allowed: boolean; voice_ready: boolean;
  archived?: boolean; protected?: boolean;
}
export interface TenantListResponse {
  ok: boolean; total: number; tenants: TenantListItem[]; known_values: TenantSetupKnownValues;
  archived_count?: number; include_archived?: boolean;
}

// Partielle Write-Payload (alle Sektionen optional).
export interface TenantSetupWriteBody {
  voice?: Partial<{ jana_enabled: boolean; vapi_assistant_id: string | null; twilio_phone_number: string | null; vapi_phone_number_id: string | null; domain: string; auto_consent_on_inquiry: boolean }>;
  consent?: Partial<{ recording_consent_enabled: boolean; recording_consent_banner_text: string | null }>;
  assistant?: Partial<{ enabled: boolean; timeout_preset: string; default_max_steps: number; allowed_actions: string[] }>;
  voice_policy?: Partial<{ enabled: boolean; active_hours_start: string; active_hours_end: string; active_days: number[]; timezone: string; daily_cap: number; per_contact_cooldown_days: number }>;
  tenant?: Partial<{ status: string; plan: string }>;
  pack?: Partial<{ mailbox_profile: string; domain: string; active_pack_keys: string[] }>;
  flags?: Partial<{ spreadsheet_enabled: boolean; autopilot_kill_switch: boolean; auto_consent_on_inquiry: boolean; email_cta_enabled: boolean; telegram_enabled: boolean; whatsapp_enabled: boolean }>;
  apply_voice_preset?: boolean;
}
export interface CreateTenantBody {
  tenant_id: string; tenant_name?: string; pack_key?: string;
  provider?: string; plan?: string; admin_email?: string;
}

async function _authToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) throw new ApiError(401, "Nicht authentifiziert");
  return token;
}
async function _adminTsFetch<T>(method: string, urlPath: string, body?: unknown): Promise<T> {
  const token = await _authToken();
  const res = await fetch(`https://api.useeasy.ai${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 403) throw new ApiError(403, "super_admin_required");
  if (res.status === 401) { await supabase.auth.signOut(); throw new ApiError(401, "Sitzung abgelaufen"); }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new ApiError(res.status, (e as { error?: string }).error || `tenant_setup_${res.status}`); }
  return res.json() as Promise<T>;
}

// ── Super-Admin ──
export const fetchAdminTenants = (includeArchived = false) =>
  _adminTsFetch<TenantListResponse>("GET", `/v1/admin/ops/tenant-setup${includeArchived ? "?include_archived=1" : ""}`);
export const archiveAdminTenant = (tenantId: string, archived: boolean) =>
  _adminTsFetch<{ ok: boolean; tenant_id: string; status: string; archived: boolean }>("POST", `/v1/admin/ops/tenant-setup/${encodeURIComponent(tenantId)}/archive`, { archived });
export const deleteAdminTenant = (tenantId: string) =>
  _adminTsFetch<{ ok: boolean; tenant_id: string; deleted: string[] }>("DELETE", `/v1/admin/ops/tenant-setup/${encodeURIComponent(tenantId)}`, { confirm: tenantId });
export const fetchAdminTenantSetup = (tenantId: string) =>
  _adminTsFetch<TenantSetup>("GET", `/v1/admin/ops/tenant-setup/${encodeURIComponent(tenantId)}`);
export const saveAdminTenantSetup = (tenantId: string, body: TenantSetupWriteBody) =>
  _adminTsFetch<TenantSetup>("PUT", `/v1/admin/ops/tenant-setup/${encodeURIComponent(tenantId)}`, body);
export const createAdminTenant = (body: CreateTenantBody) =>
  _adminTsFetch<{ ok: boolean; tenant_id: string; tenant_name: string; domain: string; mailbox_profile: string; provider: string; plan: string | null; admin_email: string | null; next_step: string }>("POST", "/v1/admin/ops/tenant-setup", body);

// ── Self-Serve (eigener Tenant) ──
export const fetchTenantSetupSelf = () => apiFetch<TenantSetup>("/tenant-setup");
export const saveTenantSetupSelf = async (body: TenantSetupWriteBody): Promise<TenantSetup> => {
  const token = await _authToken();
  const res = await fetch(`${API_BASE}/tenant-setup`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) { await supabase.auth.signOut(); throw new ApiError(401, "Sitzung abgelaufen"); }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new ApiError(res.status, (e as { error?: string }).error || `tenant_setup_${res.status}`); }
  return res.json();
};
