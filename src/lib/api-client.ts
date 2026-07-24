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

  const baseUrl = path.startsWith("/v1/knowledge") || path.startsWith("/v1/spreadsheet") || path.startsWith("/v1/capital") || path.startsWith("/v1/memory")
    ? "https://api.useeasy.ai"   // knowledge + spreadsheet + capital + memory endpoints sit outside /dashboard
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

// B3 Jana-Wissen — PATCH gegen die absolute /v1-Basis (Spiegel apiPost).
async function apiPatch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");

  const baseUrl = path.startsWith("/v1/memory")
    ? "https://api.useeasy.ai"
    : API_BASE.replace("/dashboard", "");
  const url = path.startsWith("/v1/") ? `${baseUrl}${path}` : `${API_BASE}${path}`;

  const res = await fetch(url, {
    method: "PATCH",
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

  const baseUrl = path.startsWith("/v1/knowledge") || path.startsWith("/v1/spreadsheet") || path.startsWith("/v1/capital") || path.startsWith("/v1/memory")
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
  // v4.103.0 — Mailbox-Governance: Status des 30-Tage-Swap-Locks aus /me.
  mailbox_swap?: MailboxSwapInfo;
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
  // v4.55: Poller-Health-Ampel — Backend schreibt last_poll_success_at/last_poll_error
  // pro Tick; /me liefert pro verbundenem Postfach einen Status (ok|stale|error|unknown).
  mailbox_health?: MailboxHealth[];
  [key: string]: unknown;
}

// v4.55: ein Eintrag pro verbundenem Postfach (provider_credentials)
// v4.58.2 (Paket 2, 2026-06-11): Reconnect-URL kommt SERVERSEITIG — der State trägt die
// IST-Tenant-Werte aus der DB (Callback-Footgun: handleAuthCallback überschreibt sonst
// governance.tenants.domain/active_pack_keys + public.tenants.plan/company aus dem State).
export interface ReconnectUrlResponse {
  ok: boolean;
  provider: "gmail" | "outlook";
  oauth_url: string;
  mailbox?: string | null;
  state_preview?: { tenant_id: string; plan: string; packs: string[]; domain_derived: string };
}

export function fetchReconnectUrl(provider: "gmail" | "outlook"): Promise<ReconnectUrlResponse> {
  return apiFetch<ReconnectUrlResponse>(`/reconnect/${provider}`);
}

export interface MailboxHealth {
  provider: string;
  email: string | null;
  status: "ok" | "stale" | "error" | "unknown";
  last_success_at: string | null;
  last_poll_at: string | null;
  last_error: string | null;
}

// v4.103.0 — Mailbox-Governance: Kunden-Disconnect + 30-Tage-Swap-Lock.
// POST /v1/dashboard/mailbox/disconnect deaktiviert die Credentials (Tokens NULL,
// Row bleibt fuers Audit); der Poller ueberspringt das Postfach ab dem naechsten Tick.
export interface MailboxSwapInfo {
  last_swap_at: string | null;
  next_swap_possible_at: string | null;
  locked: boolean;
}

export interface DisconnectMailboxResponse {
  ok: boolean;
  disconnected?: number;
  swap?: MailboxSwapInfo;
  error?: string;
}

export function disconnectMailbox(email: string): Promise<DisconnectMailboxResponse> {
  return apiPost<DisconnectMailboxResponse>("/mailbox/disconnect", { email });
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
  // v4.43.0: Shadow-Aggregat (flat)
  shadow_would_send_today?: number;
  shadow_would_hold_today?: number;
  autopilot_queued_today?: number;
  [key: string]: unknown;
}

export interface DashboardStats {
  emails_today: number;
  emails_week: number;
  emails_total?: number;
  priority_breakdown: Record<string, number>;
  drafts_created_week: number;
  resolved_week: number;
  // v4.43.0: Shadow-Aggregat fuer die Uebersicht-Kachel ("Heute haette UseEasy autonom: N").
  shadow_would_send_today?: number;
  shadow_would_hold_today?: number;
  autopilot_queued_today?: number;
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
  // v4.43.0: Shadow/Assisted "Would-Do" (Review-Queue). Aus autopilot_log + maturity.
  shadow_decision?: string | null;
  shadow_reasons?: unknown;
  autopilot_mode?: "shadow" | "assisted" | "autonomous" | null;
  // v4.57.0 (J4): "Warum dieses Label?" — read-time Begründung (eine Backend-Quelle)
  label_reason?: string | null;
  label_reason_source?: string | null;
  label_reason_kind?: "rule" | "ki" | "risk" | "optout" | "noise" | null;
  label_reason_confidence_pct?: number | null;
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
  // v4.57.0 (J4): "Warum dieses Label?" — read-time Begründung (eine Backend-Quelle)
  label_reason?: string | null;
  label_reason_source?: string | null;
  label_reason_kind?: "rule" | "ki" | "risk" | "optout" | "noise" | null;
  label_reason_confidence_pct?: number | null;
  // v4.122.0 (Spam-Rescue): audit_log.action — "spam_rescue" (aus Spam gerettet)
  // bzw. "spam_phishing_flag" (Phishing im Spam abgefangen) + Provenienz-Detail.
  audit_action?: string | null;
  audit_detail?: unknown;
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
  purpose: "general" | "appointments" | "tenants" | "maintenance" | "price_list";
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

// ── SharePoint Site-Browser Types (v4.42.0) ──
export interface SpreadsheetSharePointSite {
  site_id: string;
  name: string;
  web_url: string | null;
}
export interface SpreadsheetSharePointSitesResponse {
  ok: boolean;
  sites: SpreadsheetSharePointSite[];
  total: number;
  error?: string;
  reconnect_required?: boolean;
}
export interface SpreadsheetSharePointDrive {
  drive_id: string;
  name: string;
  web_url: string | null;
  drive_type: string | null;
}
export interface SpreadsheetSharePointDrivesResponse {
  ok: boolean;
  drives: SpreadsheetSharePointDrive[];
  total: number;
  error?: string;
  reconnect_required?: boolean;
}
// SharePoint-Datei = identische Shape wie OneDrive (drive_id:item_id) → connectOneDrive verbindet sie direkt.
export type SpreadsheetSharePointFile = SpreadsheetOneDriveFile;
export interface SpreadsheetSharePointFilesResponse {
  ok: boolean;
  files: SpreadsheetSharePointFile[];
  total: number;
  error?: string;
  reconnect_required?: boolean;
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
    // v4.43.0 Shadow-Aggregat
    shadow_would_send_today: s?.shadow_would_send_today ?? raw.shadow_would_send_today ?? 0,
    shadow_would_hold_today: s?.shadow_would_hold_today ?? raw.shadow_would_hold_today ?? 0,
    autopilot_queued_today: s?.autopilot_queued_today ?? raw.autopilot_queued_today ?? 0,
  };
};
export interface RoiWindowCounts {
  drafts_prepared: number;
  resolved: number;
  emails_triaged: number;
  deadlines_caught: number;
}
export interface RoiResponse {
  ok?: boolean;
  tenant_id?: string;
  week: RoiWindowCounts;
  month: RoiWindowCounts;
  window?: { week_days: number; month_days: number };
  generated_at?: string;
}
// v2 ROI-Kachel: gemessene Wochen- UND Monats-Zaehler (echte Monatszahlen).
export const fetchRoi = async (): Promise<RoiResponse> => {
  const raw = await apiFetch<RoiResponse>("/roi");
  const norm = (c: Partial<RoiWindowCounts> | undefined): RoiWindowCounts => ({
    drafts_prepared: c?.drafts_prepared ?? 0,
    resolved: c?.resolved ?? 0,
    emails_triaged: c?.emails_triaged ?? 0,
    deadlines_caught: c?.deadlines_caught ?? 0,
  });
  return { ...raw, week: norm(raw?.week), month: norm(raw?.month) };
};

// v4.104.0 — Retouren-Grund-Intelligenz (Shopify strukturiert + E-Mail-Fallback).
export interface ReturnsReasonBucket { reason: string; count: number; }
export interface ReturnsMonthPoint { month: string; by_reason: Record<string, number>; total: number; }
export interface ReturnsSourceSummary { source: string; count: number; last_updated?: string | null; }
export interface ReturnsInsightsResponse {
  ok?: boolean;
  tenant_id?: string;
  buckets: string[];
  distribution: ReturnsReasonBucket[];
  monthly: ReturnsMonthPoint[];
  sources: ReturnsSourceSummary[];
  total: number;
  has_data: boolean;
  window_months?: number;
  last_updated?: string | null;
  generated_at?: string;
}
export const fetchReturnsInsights = () => apiFetch<ReturnsInsightsResponse>("/returns-insights");

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

// ── Wissens-Suche (UseEasy Brain B5, memory-engine v1.4.0) ──
// GET /v1/memory/knowledge/search — semantische, zitat-treue Suche ueber die
// eigene Wissensbasis. Tenant kommt serverseitig IMMER aus dem Token.

export interface KnowledgeSearchResult {
  id: number;
  title: string;
  source_type: string;
  source_url: string | null;
  chunk_index: number;
  score: number;
  source_label: string;
  text: string;
}

export interface KnowledgeSearchResponse {
  ok: boolean;
  tenant_id: string;
  query: string;
  results: KnowledgeSearchResult[];
  reason: "no_documents" | "not_embedded_yet" | "no_relevant_match" | "migration_missing" | null;
  meta: {
    total_chunks: number;
    embedded_chunks: number;
    min_score: number;
    top_k: number;
  };
}

export const searchKnowledgeBase = (q: string, limit = 6) =>
  apiGetV1<KnowledgeSearchResponse>(
    `/v1/memory/knowledge/search?q=${encodeURIComponent(q)}&limit=${limit}`
  );

// ── Jana-Wissen (UseEasy Brain B3, memory-engine v1.5.0) ──
// GET/POST/PATCH /v1/memory/knowledge — Tenant-Wissensmodell mit Confirm-Loop.
// Tenant + Entscheider kommen serverseitig IMMER aus dem Token.

export type JanaKnowledgeCategory = "product" | "process" | "sla" | "policy" | "team" | "style";
export type JanaKnowledgeStatus = "proposed" | "confirmed" | "rejected";

export interface JanaKnowledgeFact {
  id: number;
  category: JanaKnowledgeCategory;
  fact_key: string;
  fact_text: string;
  status: JanaKnowledgeStatus;
  source: "briefing" | "manual" | "learned";
  evidence: {
    kind?: "correction_cluster" | "entity_focus" | "kb_extract";
    count?: number;
    correction_ids?: number[];
    entity_hashes?: string[];
    label_total?: number;
    // B3.1 Detektor C (Regel-Vorschlag aus hochgeladenem Dokument)
    upload_id?: string | null;
    source_type?: string | null;
    title?: string | null;
    chunk_ids?: number[];
    n_chunks?: number | null;
    [key: string]: unknown;
  } | null;
  confidence: number | string | null;
  proposed_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  updated_at: string | null;
}

export interface JanaKnowledgeListResponse {
  ok: boolean;
  tenant_id: string;
  facts: JanaKnowledgeFact[];
  counts: { proposed: number; confirmed: number; rejected: number };
  limit: number;
  offset: number;
  categories: JanaKnowledgeCategory[];
}

export interface JanaKnowledgeMutationResponse {
  ok: boolean;
  fact?: JanaKnowledgeFact;
  error?: string;
}

export const fetchJanaKnowledge = (params?: { status?: JanaKnowledgeStatus; category?: JanaKnowledgeCategory }) => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.category) qs.set("category", params.category);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiGetV1<JanaKnowledgeListResponse>(`/v1/memory/knowledge${suffix}`);
};

export const createJanaKnowledge = (body: { category: JanaKnowledgeCategory; fact_text: string }) =>
  apiPost<JanaKnowledgeMutationResponse>("/v1/memory/knowledge", body);

export const patchJanaKnowledge = (body: { id: number; action: "confirm" | "reject" | "update"; fact_text?: string }) =>
  apiPatch<JanaKnowledgeMutationResponse>("/v1/memory/knowledge", body);

// B3.1: gefuehrter Briefing-Wizard. Antworten -> Server-Destillation (Haiku) ->
// bestaetigte Jana-Fakten (source='briefing'). Selber Endpoint wie createJanaKnowledge,
// aber der Body traegt briefing_answers[] -> das Backend routet in die Destillation.
export interface JanaBriefingAnswer {
  question_id: string;
  question: string;
  answer: string;
  category: JanaKnowledgeCategory;
}

export interface JanaBriefingResponse {
  ok: boolean;
  created: JanaKnowledgeFact[];
  count: number;
  processed: number;
  skipped: number;
  llm_used: number;
  error?: string;
}

export const createJanaBriefing = (body: { briefing_answers: JanaBriefingAnswer[] }) =>
  apiPost<JanaBriefingResponse>("/v1/memory/knowledge", body);

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

// ── Capital-Layer F2: Finanz-Export-Upload (Bank/DATEV) → fin_*-Indizes ──
export interface CapitalStatementUploadResponse {
  ok: boolean;
  format: string;
  kind: string;
  months_stored: number;
  period: string | null;
  metrics: { key: string; value: number; coverage: number }[];
  skipped_keys: string[];
  sources_used: string[];
  posted: boolean;
  ingest_status?: number;
  note: string;
}

export const uploadCapitalStatement = (payload: {
  file_name: string;
  file_content_base64: string;
}) => apiPost<CapitalStatementUploadResponse>("/v1/capital/statement/upload", payload);

// ── Capital-Layer F3: Live-Bank-Connect via finAPI (AISP, BaFin-lizenziert) → fin_*-Indizes ──
export interface CapitalBankStatus {
  ok: boolean;
  configured: boolean;
  connected: boolean;
  status: string;            // not_connected|pending|connected|reauth_required|aborted|error
  provider?: string;
  accounts_count?: number;
  consent_at?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
}
export interface CapitalBankSyncResponse {
  ok: boolean;
  status?: string;
  accounts?: number;
  txns?: number;
  period?: string | null;
  metrics?: { key: string; value: number; coverage: number }[];
  skipped_keys?: string[];
  sources_used?: string[];
  has_balance?: boolean;
  posted?: boolean;
  ingest_status?: number;
  error?: string;
}
export interface CapitalBankConnectResponse {
  ok: boolean;
  redirect_url?: string;     // finAPI Web Form URL (Browser dorthin leiten → SCA)
  web_form_id?: string;
  state?: string;
  expires_in_seconds?: number;
  account_types?: string[];
  provider?: string;
  error?: string;
  hint?: string;
}
export interface CapitalBankCallbackResponse {
  ok: boolean;
  status?: string;           // connected|pending|aborted|error
  bank_connection_id?: string | null;
  web_form_status?: string;
  sync?: CapitalBankSyncResponse | null;
  error?: string;
}

export const getCapitalBankStatus = () =>
  apiGetV1<CapitalBankStatus>("/v1/capital/bank/status");

export const connectCapitalBank = () =>
  apiPost<CapitalBankConnectResponse>("/v1/capital/bank/connect", {});

export const callbackCapitalBank = (state: string) =>
  apiPost<CapitalBankCallbackResponse>("/v1/capital/bank/callback", { state });

export const syncCapitalBank = () =>
  apiPost<CapitalBankSyncResponse>("/v1/capital/bank/sync", {});

// ── Capital-Layer Schicht 2: Buchhaltungs-Connector via Maesn Unified-API (DATEV-zertifiziert) → fin_*-Indizes ──
export interface CapitalAccountingStatus {
  ok: boolean;
  configured: boolean;
  connected: boolean;
  status: string;            // not_connected|pending|connected|reauth_required|aborted|error
  provider?: string;
  target_system?: string | null;
  consent_at?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
}
export interface CapitalAccountingSyncResponse {
  ok: boolean;
  provider?: string;
  open_items?: number;
  accounts?: number;
  period?: string | null;
  metrics?: { key: string; value: number; coverage: number }[];
  skipped?: string[];
  classified_share?: number | null;
  posted?: boolean;
  ingest_status?: number;
  error?: string;
}
export interface CapitalAccountingConnectResponse {
  ok: boolean;
  redirect_url?: string;     // Aggregator-Connect-URL (Browser dorthin leiten)
  state?: string;
  provider?: string;
  target?: string;
  expires_in_seconds?: number;
  error?: string;
  hint?: string;
}
export interface CapitalAccountingCallbackResponse {
  ok: boolean;
  status?: string;           // connected|pending|aborted|error
  provider?: string;
  verified?: boolean;
  sync?: CapitalAccountingSyncResponse | null;
  error?: string;
}

export const getCapitalAccountingStatus = () =>
  apiGetV1<CapitalAccountingStatus>("/v1/capital/accounting/status");

export const connectCapitalAccounting = (target: string) =>
  apiPost<CapitalAccountingConnectResponse>("/v1/capital/accounting/connect", { target });

export const callbackCapitalAccounting = (vars: { state: string; account_key?: string; ts?: string; signature?: string }) =>
  apiPost<CapitalAccountingCallbackResponse>("/v1/capital/accounting/callback", vars);

export const syncCapitalAccounting = () =>
  apiPost<CapitalAccountingSyncResponse>("/v1/capital/accounting/sync", {});

// ── Capital-Layer Step 3: Stripe-Revenue-Connector (Connect-OAuth) → fin_*/rev_*-Indizes ──
export interface CapitalStripeStatus {
  ok: boolean;
  configured: boolean;
  connected: boolean;
  status: string;
  provider?: string;
  stripe_account?: string | null;
  consent_at?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
}
export interface CapitalStripeSyncResponse {
  ok: boolean;
  status?: string;
  subs?: number;
  charge_points?: number;
  period?: string | null;
  metrics?: { metric_key: string; value: number; coverage: number }[];
  emitted_keys?: string[];
  skipped_keys?: string[];
  posted?: boolean;
  ingest_status?: number;
  error?: string;
}
export interface CapitalStripeConnectResponse {
  ok: boolean;
  redirect_url?: string;
  state?: string;
  provider?: string;
  error?: string;
  hint?: string;
}
export interface CapitalStripeCallbackResponse {
  ok: boolean;
  status?: string;
  stripe_user_id?: string;
  sync?: CapitalStripeSyncResponse | null;
  error?: string;
}
export const getCapitalStripeStatus = () =>
  apiGetV1<CapitalStripeStatus>("/v1/capital/stripe/status");
export const connectCapitalStripe = () =>
  apiPost<CapitalStripeConnectResponse>("/v1/capital/stripe/connect", {});
export const callbackCapitalStripe = (code: string, state: string) =>
  apiPost<CapitalStripeCallbackResponse>("/v1/capital/stripe/callback", { code, state });
export const syncCapitalStripe = () =>
  apiPost<CapitalStripeSyncResponse>("/v1/capital/stripe/sync", {});
export interface CapitalStripeDisconnectResponse {
  ok: boolean;
  status?: string;
  disconnected?: boolean;
  revoked?: boolean;
  revoke_note?: string | null;
  already?: boolean;
  stripe_account?: string | null;
  error?: string;
}
export const disconnectCapitalStripe = () =>
  apiPost<CapitalStripeDisconnectResponse>("/v1/capital/stripe/disconnect", {});
export interface CapitalDisconnectResponse {
  ok: boolean;
  status?: string;
  disconnected?: boolean;
  revoked?: boolean;
  revoke_note?: string | null;
  already?: boolean;
  error?: string;
}
export const disconnectCapitalBank = () =>
  apiPost<CapitalDisconnectResponse>("/v1/capital/bank/disconnect", {});
export const disconnectCapitalAccounting = () =>
  apiPost<CapitalDisconnectResponse>("/v1/capital/accounting/disconnect", {});
export const disconnectCapitalShopify = () =>
  apiPost<CapitalDisconnectResponse>("/v1/capital/shopify/disconnect", {});
export const disconnectCapitalMetaAds = () =>
  apiPost<CapitalDisconnectResponse>("/v1/capital/meta-ads/disconnect", {});
export const disconnectCapitalTicketing = () =>
  apiPost<CapitalDisconnectResponse>("/v1/capital/ticketing/disconnect", {});

// ── Capital-Layer Step 3: Shopify-Revenue-Connector (Public-App-OAuth) → rev_*-Indizes ──
export interface CapitalShopifyStatus {
  ok: boolean;
  configured: boolean;
  connected: boolean;
  status: string;
  sync_state?: string | null;
  provider?: string;
  shop?: string | null;
  consent_at?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
}
export interface CapitalShopifySyncResponse {
  ok: boolean;
  status?: string;
  orders?: number;
  period?: string | null;
  metrics?: { metric_key: string; value: number; coverage: number }[];
  emitted_keys?: string[];
  skipped_keys?: string[];
  posted?: boolean;
  ingest_status?: number;
  error?: string;
}
export interface CapitalShopifyConnectResponse {
  ok: boolean;
  redirect_url?: string;
  state?: string;
  shop?: string;
  provider?: string;
  error?: string;
  hint?: string;
}
export interface CapitalShopifyCallbackResponse {
  ok: boolean;
  status?: string;
  shop?: string;
  sync?: CapitalShopifySyncResponse | null;
  error?: string;
}
export const getCapitalShopifyStatus = () =>
  apiGetV1<CapitalShopifyStatus>("/v1/capital/shopify/status");
export const connectCapitalShopify = (shop: string) =>
  apiPost<CapitalShopifyConnectResponse>("/v1/capital/shopify/connect", { shop });
export const callbackCapitalShopify = (params: Record<string, string>) =>
  apiPost<CapitalShopifyCallbackResponse>("/v1/capital/shopify/callback", { params });
export const syncCapitalShopify = () =>
  apiPost<CapitalShopifySyncResponse>("/v1/capital/shopify/sync", {});

export interface CapitalShopifyTokenConnectResponse {
  ok: boolean;
  status?: string;
  shop?: string;
  method?: string;
  sync?: CapitalShopifySyncResponse | null;
  error?: string;
  hint?: string;
}
// v4.76.0 — Custom-App Admin-API-Token Direkt-Verbindung (Fallback wenn Public-App-PCD blockiert).
export const connectCapitalShopifyToken = (shop: string, token: string) =>
  apiPost<CapitalShopifyTokenConnectResponse>("/v1/capital/shopify/connect-token", { shop, access_token: token });

// ── Capital-Layer: Meta-Ads-Connector (Facebook Login for Business, ads_read) → sales_cac ──
export interface CapitalMetaAdsStatus {
  ok: boolean;
  configured: boolean;
  connected: boolean;
  status: string;
  provider?: string;
  ad_account_id?: string | null;
  ad_account_name?: string | null;
  currency?: string | null;
  consent_at?: string | null;
  last_sync_at?: string | null;
  token_expires_at?: string | null;
  last_error?: string | null;
}
export interface CapitalMetaAdsSyncResponse {
  ok: boolean;
  status?: string;
  ad_account_id?: string | null;
  currency?: string | null;
  period?: string | null;
  spend_months?: number;
  metrics?: { metric_key: string; value: number; coverage: number }[];
  emitted_keys?: string[];
  skipped_keys?: string[];
  cac_basis?: "cross_source" | "self_contained" | null;
  self_contained_cac?: number | null;
  cross_source_cac?: number | null;
  cross_source?: string | null;
  posted?: boolean;
  ingest_status?: number;
  error?: string;
}
export interface CapitalMetaAdsConnectResponse {
  ok: boolean;
  redirect_url?: string;
  state?: string;
  provider?: string;
  error?: string;
  hint?: string;
}
export interface CapitalMetaAdsCallbackResponse {
  ok: boolean;
  status?: string;
  ad_account_id?: string | null;
  ad_account_name?: string | null;
  accounts?: number;
  sync?: CapitalMetaAdsSyncResponse | null;
  error?: string;
}
export const getCapitalMetaAdsStatus = () =>
  apiGetV1<CapitalMetaAdsStatus>("/v1/capital/meta-ads/status");
export const connectCapitalMetaAds = () =>
  apiPost<CapitalMetaAdsConnectResponse>("/v1/capital/meta-ads/connect", {});
export const callbackCapitalMetaAds = (code: string, state: string) =>
  apiPost<CapitalMetaAdsCallbackResponse>("/v1/capital/meta-ads/callback", { code, state });
export const syncCapitalMetaAds = () =>
  apiPost<CapitalMetaAdsSyncResponse>("/v1/capital/meta-ads/sync", {});

// ── Capital-Layer: Ticketing-Connector (HubSpot Service Hub / Zendesk / Freshdesk) → risk_*/cust_csat + ops ──
export interface CapitalTicketingStatus {
  ok: boolean;
  connected: boolean;
  status: string;
  provider?: string | null;
  subdomain?: string | null;
  hubspot_available?: boolean;
  providers?: string[];
  consent_at?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
}
export interface CapitalTicketingSyncResponse {
  ok: boolean;
  provider?: string;
  period?: string | null;
  tickets?: number;
  category_coverage?: number;
  csat_ratings?: number;
  open_backlog?: number;
  metrics?: { metric_key: string; value: number; coverage: number }[];
  emitted_keys?: string[];
  skipped_keys?: string[];
  posted?: boolean;
  ingest_status?: number;
  error?: string;
}
export interface CapitalTicketingConnectResponse {
  ok: boolean;
  status?: string;
  provider?: string;
  sync?: CapitalTicketingSyncResponse | null;
  error?: string;
  hint?: string;
}
export interface CapitalTicketingConnectInput {
  provider: "hubspot" | "zendesk" | "freshdesk";
  subdomain?: string; email?: string; api_token?: string; // zendesk
  domain?: string; api_key?: string;                        // freshdesk
}
export const getCapitalTicketingStatus = () =>
  apiGetV1<CapitalTicketingStatus>("/v1/capital/ticketing/status");
export const connectCapitalTicketing = (input: CapitalTicketingConnectInput) =>
  apiPost<CapitalTicketingConnectResponse>("/v1/capital/ticketing/connect", input as unknown as Record<string, unknown>);
export const syncCapitalTicketing = () =>
  apiPost<CapitalTicketingSyncResponse>("/v1/capital/ticketing/sync", {});

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

// ── SharePoint Site-Browser Fetchers (v4.42.0) ──
// 3-stufig: Site suchen → Dokumentbibliothek → Datei. Verbinden danach über connectOneDrive
// (provider-agnostisch, sheet_ref = driveId:itemId — für SharePoint-Bibliotheken kanonisch).
export const listSharePointSites = (q?: string) =>
  apiGetV1<SpreadsheetSharePointSitesResponse>(
    `/v1/spreadsheet/sharepoint/sites${q ? `?q=${encodeURIComponent(q)}` : ""}`
  );

export const listSharePointDrives = (siteId: string) =>
  apiGetV1<SpreadsheetSharePointDrivesResponse>(
    `/v1/spreadsheet/sharepoint/drives?site_id=${encodeURIComponent(siteId)}`
  );

export const listSharePointFiles = (driveId: string, q?: string) =>
  apiGetV1<SpreadsheetSharePointFilesResponse>(
    `/v1/spreadsheet/sharepoint/files?drive_id=${encodeURIComponent(driveId)}${q ? `&q=${encodeURIComponent(q)}` : ""}`
  );

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

// v4.111.0 - ZUGFeRD-PDF (PDF/A-3b + eingebettetes EN-16931-CII-XML) einer FINALISIERTEN
// Rechnung als binaeren Download. Spiegelt downloadSpreadsheet; prueft zusaetzlich den
// Content-Type (der Endpoint liefert bei feature/tenant-disabled ODER nicht-final ein JSON mit 200).
export async function downloadZugferdInvoice(documentId: number, docNumber?: string | null): Promise<void> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");
  const url = `https://api.useeasy.ai/v1/dashboard/documents/invoice/zugferd?document_id=${encodeURIComponent(String(documentId))}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    await supabase.auth.signOut();
    throw new ApiError(401, "Sitzung abgelaufen");
  }
  const ct = res.headers.get("Content-Type") || "";
  if (!res.ok || !ct.includes("application/pdf")) {
    let msg = `ZUGFeRD-Download fehlgeschlagen (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error === "invoice_not_finalized") msg = "Nur finalisierte Rechnungen koennen als ZUGFeRD exportiert werden.";
      else if (data?.error === "billing_profile_missing") msg = "Bitte zuerst die Verkaeufer-Stammdaten hinterlegen.";
      else if (data?.error) msg = String(data.error);
      else if (data?.skipped) msg = "ZUGFeRD-Export ist fuer dieses Konto nicht aktiviert.";
    } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }
  const cd = res.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename="?([^";]+)"?/i);
  const filename = match ? match[1] : `${docNumber || "rechnung-" + documentId}.pdf`;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
  inbound_forward_number: string | null;
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
  inbound_forward_number?: string | null;
  caller_id_status?: CallerIdStatus;
  active?: boolean;
}) => apiSend<VoiceRepMutationResponse>("PATCH", `/voice/reps/${encodeURIComponent(repId)}`, payload);

export const deleteVoiceRep = (repId: string) =>
  apiDelete<VoiceRepMutationResponse>(`/voice/reps/${encodeURIComponent(repId)}`);

// ── Fetchers: Self-Serve (v4.138.0) — Vertriebler einladen + Twilio-Nummernkauf ──

export interface InviteVoiceRepResponse {
  ok: boolean;
  rep_id?: string;
  already_existed?: boolean;
  deployed_url?: string | null;
  vertriebler?: { client_id: string; display_name: string; status: string } | null;
  sales_user?: { rep_id: string; twilio_number: string | null; active: boolean } | null;
  error?: string;
  hint?: string;
}

// Legt einen Vertriebler self-serve an (Co-Pilot-Deploy via leads-sync). Idempotent.
export const inviteVoiceRep = (payload: {
  rep_id: string;
  display_name: string;
  email?: string;
  variant?: "jana" | "cold-only";
}) => apiPost<InviteVoiceRepResponse>("/voice/reps/invite", payload);

export interface TwilioAvailableNumber {
  phone_number: string;
  friendly_name: string;
  locality: string | null;
  region: string | null;
  iso_country: string;
  capabilities: Record<string, boolean> | null;
}

export interface NumberSearchResponse {
  ok: boolean;
  country: string;
  type: string;
  monthly_price: string | null;
  price_unit: string | null;
  numbers: TwilioAvailableNumber[];
  total: number;
  error?: string;
  message?: string;
}

export const searchNumbers = (params: {
  country?: string;
  type?: string;
  areaCode?: string;
  contains?: string;
  limit?: number;
}) => {
  const qs = new URLSearchParams();
  if (params.country) qs.set("country", params.country);
  if (params.type) qs.set("type", params.type);
  if (params.areaCode) qs.set("areaCode", params.areaCode);
  if (params.contains) qs.set("contains", params.contains);
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<NumberSearchResponse>(`/voice/numbers/search${suffix}`);
};

export interface NumberBuyResponse {
  ok: boolean;
  rep_id?: string;
  phone_number?: string;
  twilio_sid?: string | null;
  caller_id_status?: string;
  caller_id_set?: boolean;
  inbound_forward_set?: boolean;
  voice_url_configured?: boolean;
  error?: string;
  twilio_code?: number | null;
  twilio_message?: string | null;
  hint?: string;
}

export const buyNumber = (payload: { rep_id: string; phone_number: string; country?: string; inbound_forward_number?: string }) =>
  apiPost<NumberBuyResponse>("/voice/numbers/buy", payload);

// ════════════════════════════════════════════════════════════════════════════
// Lead-Upload (Phase 3) — Backend: /v1/dashboard/leads/* (delegiert an leads-sync)
// ════════════════════════════════════════════════════════════════════════════

export interface LeadListSummary {
  list_id: string;
  list_name: string;
  uploaded_at: string | null;
  uploaded_by: string | null;
  source: string | null;
  lead_count: number;
}

export interface LeadListsResponse {
  ok: boolean;
  status?: number;
  schema_version?: number;
  tenant_id?: string;
  updated_at?: string | null;
  lists: LeadListSummary[];
  error?: string;
}

export interface LeadUploadResponse {
  ok: boolean;
  status?: number;
  list_id?: string;
  list_name?: string;
  uploaded_at?: string;
  uploaded_by?: string;
  lead_count?: number;
  error?: string;
  max?: number;
}

export const fetchLeadLists = () => apiFetch<LeadListsResponse>("/leads/lists");

export const uploadLeads = (payload: { list_name: string; leads: Record<string, unknown>[] }) =>
  apiPost<LeadUploadResponse>("/leads/lists", payload);

export const deleteLeadList = (listId: string) =>
  apiDelete<{ ok: boolean; status?: number; list_id?: string; remaining_lists?: number; error?: string }>(
    `/leads/lists/${encodeURIComponent(listId)}`,
  );

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

// v4.129.0: Echtes Rueckgaengig einer Label-Korrektur (Verlauf). Re-applied das
// VORHERIGE Label ueber die bestehenden Mailbox-Pfade und markiert die Korrektur
// als reverted (fliesst nicht mehr in Regel-Vorschlaege/Few-Shot ein).
// Fehler-Kontrakt: 404 == Route existiert im deployten Backend noch nicht
// (das Frontend faellt dann auf correctLabel mit dem alten Key zurueck).
export interface UndoLabelCorrectResponse {
  ok: boolean;
  provider?: string | null;
  restored_core_key?: string | null;
  applied?: string | null;
  removed?: string[];
  learning_marked?: boolean;
  reverted_count?: number;
  migration_missing?: boolean;
}
export const undoLabelCorrect = (eventId: string) =>
  apiPost<UndoLabelCorrectResponse>("/label/correct/undo", { event_id: eventId });

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

// ═══════════════════════════════════════════════════════════════════════════
// v4.54.0 — Multi-Agent Voice-Profile + Rufnummern (Super-Admin, Migration v1.36)
// "Agents sind Daten": governance.voice_agent_profiles + governance.voice_lines.
// Endpunkte unter /v1/admin/ops/voice-profiles* (Super-Admin via Supabase-JWT).
// ═══════════════════════════════════════════════════════════════════════════

export interface VoiceAgentProfile {
  id: number;
  tenant_id: string;
  profile_key: string;
  display_name: string;
  description: string | null;
  system_prompt: string;
  first_message: string;
  language: string | null;
  voice: { provider?: string; voiceId?: string; model?: string } | null;
  model: { provider?: string; model?: string; temperature?: number } | null;
  tools: string[] | null;
  transfer_number: string | null;
  is_active: boolean;
  sort_order: number;
  updated_at: string | null;
  updated_by: string | null;
}

export interface VoiceLine {
  id: number;
  tenant_id: string;
  phone_number: string;
  vapi_phone_number_id: string | null;
  label: string | null;
  routing_mode: "single" | "triage_squad" | "forward_human";
  default_profile_key: string | null;
  triage_profile_key: string | null;
  member_profile_keys: string[] | null;
  business_hours: { days: number[]; from: string; to: string; tz?: string } | null;
  after_hours: "assistant" | "forward" | "reject_message";
  after_hours_number: string | null;
  forward_number: string | null;
  is_active: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export interface VoiceProfileTemplate {
  template_key: string;
  profile_key: string;
  display_name: string;
  badge: string | null;
  description: string;
  first_message: string;
  system_prompt: string;
  tools: string[];
  sort_order: number;
}

export interface VoiceProfilesResponse {
  ok: boolean;
  tenant_id: string;
  profiles: VoiceAgentProfile[];
  lines: VoiceLine[];
  catalogs: {
    templates: VoiceProfileTemplate[];
    tool_options: { key: string; label: string; required?: boolean }[];
    routing_modes: { value: string; label: string }[];
    after_hours_modes: { value: string; label: string }[];
    recording_consent_enabled: boolean;
    guardrails_info: string;
  };
}

export interface VoiceProfileWriteBody {
  tenant_id?: string;
  template_key?: string;
  profile_key?: string;
  display_name?: string;
  description?: string | null;
  system_prompt?: string;
  first_message?: string;
  language?: string;
  voice?: { provider?: string; voiceId?: string; model?: string } | null;
  model?: { provider?: string; model?: string; temperature?: number } | null;
  tools?: string[];
  transfer_number?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface VoiceLineWriteBody {
  tenant_id?: string;
  phone_number?: string;
  vapi_phone_number_id?: string | null;
  label?: string | null;
  routing_mode?: string;
  default_profile_key?: string | null;
  triage_profile_key?: string | null;
  member_profile_keys?: string[];
  business_hours?: { days: number[]; from: string; to: string; tz?: string } | null;
  after_hours?: string;
  after_hours_number?: string | null;
  forward_number?: string | null;
  is_active?: boolean;
}

export const fetchVoiceProfiles = (tenantId: string) =>
  _adminTsFetch<VoiceProfilesResponse>("GET", `/v1/admin/ops/voice-profiles?tenant_id=${encodeURIComponent(tenantId)}`);
export const createVoiceProfile = (body: VoiceProfileWriteBody) =>
  _adminTsFetch<{ ok: boolean; profile: VoiceAgentProfile }>("POST", "/v1/admin/ops/voice-profiles", body);
export const updateVoiceProfile = (id: number, body: VoiceProfileWriteBody) =>
  _adminTsFetch<{ ok: boolean; profile: VoiceAgentProfile }>("PUT", `/v1/admin/ops/voice-profiles/${id}`, body);
export const deleteVoiceProfile = (id: number) =>
  _adminTsFetch<{ ok: boolean; deleted: { id: number; profile_key: string } }>("DELETE", `/v1/admin/ops/voice-profiles/${id}`);
export const voiceProfileTestCall = (body: { tenant_id: string; profile_id: number; to_number: string }) =>
  _adminTsFetch<{ ok: boolean; call_id: string; profile_key: string }>("POST", "/v1/admin/ops/voice-profiles/test-call", body);
export const createVoiceLine = (body: VoiceLineWriteBody) =>
  _adminTsFetch<{ ok: boolean; line: VoiceLine }>("POST", "/v1/admin/ops/voice-profiles/lines", body);
export const updateVoiceLine = (id: number, body: VoiceLineWriteBody) =>
  _adminTsFetch<{ ok: boolean; line: VoiceLine }>("PUT", `/v1/admin/ops/voice-profiles/lines/${id}`, body);
export const deleteVoiceLine = (id: number) =>
  _adminTsFetch<{ ok: boolean; deleted: { id: number; phone_number: string } }>("DELETE", `/v1/admin/ops/voice-profiles/lines/${id}`);

// ─────────────────────────────────────────────────────────────────────────────
// Co-Pilot Vertriebler-Verwaltung (leads-sync Admin-API, Auth = Konsolen-JWT)
// Backend: useeasy-leads-sync v1.10.0 — adminSessionAuth akzeptiert den
// Supabase-Bearer der Konsole (Mapping Login-E-Mail → copilot_tenants.admin_email).
// WICHTIG: bei 401 hier KEIN signOut — 401 kann "kein Co-Pilot-Workspace
// verknüpft" bedeuten (no_copilot_tenant_for_email) und wird als Zustand gerendert.
// ─────────────────────────────────────────────────────────────────────────────

const COPILOT_ADMIN_BASE = "https://api.useeasy.ai/v1/admin";

export interface CopilotVertriebler {
  vertriebler_id: string;
  client_id: string;
  display_name: string;
  email: string | null;
  status: string; // 'active' | 'inactive'
  deployed_url: string | null;
  created_at?: string;
  stats?: { termine?: number; total_actions?: number } | null;
}

export interface CopilotVertrieblerListResponse {
  ok?: boolean;
  vertriebler: CopilotVertriebler[];
}

export interface CopilotAutoDeployResult {
  ok: boolean;
  url?: string;
  bytes?: number;
  invalidationId?: string | null;
  error?: string;
}

export interface CopilotRedeployResponse {
  ok: boolean;
  redeployed?: boolean;
  client_id?: string;
  auto_deploy?: CopilotAutoDeployResult;
}

export interface CopilotCreateResponse {
  ok: boolean;
  vertriebler: CopilotVertriebler;
  worker_secret?: string | null;
  auto_deploy?: CopilotAutoDeployResult;
}

async function copilotFetch<T>(
  path: string,
  opts: { method?: string; body?: Record<string, unknown> } = {},
): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");

  const res = await fetch(`${COPILOT_ADMIN_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  let data: { error?: string } | null = null;
  try { data = await res.json(); } catch { /* leere Antwort */ }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `API Fehler ${res.status}`);
  }
  return data as T;
}

export const fetchCopilotVertriebler = () =>
  copilotFetch<CopilotVertrieblerListResponse>("/me/vertriebler");

export const createCopilotVertriebler = (body: { client_id: string; display_name: string; email?: string | null }) =>
  copilotFetch<CopilotCreateResponse>("/me/vertriebler", {
    method: "POST",
    body: { ...body, variant: "jana" },
  });

export const updateCopilotVertriebler = (vId: string, body: { display_name?: string; email?: string | null; status?: string }) =>
  copilotFetch<{ ok: boolean }>(`/me/vertriebler/${encodeURIComponent(vId)}`, { method: "PATCH", body });

export const redeployCopilotVertriebler = (vId: string) =>
  copilotFetch<CopilotRedeployResponse>(`/me/vertriebler/${encodeURIComponent(vId)}`, {
    method: "PATCH",
    body: { redeploy: true },
  });

export const deleteCopilotVertriebler = (vId: string) =>
  copilotFetch<{ ok: boolean }>(`/me/vertriebler/${encodeURIComponent(vId)}`, { method: "DELETE" });

// ── v4.61.0 Billing (In-Console-Kauf) — /v1/billing/* liegt außerhalb /dashboard ──
export interface BillingEntitlements {
  base_plan: string | null;
  base_mailboxes: number; mail_quota: number; extra_mailboxes: number; copilot_seats: number;
  volume_packs: number; autopilot_mailboxes: number; erp_data_sources: number; branch_packs: number;
  phone_local: number; phone_mobile: number; voice_enabled: boolean;
  billing_status?: string | null; current_period_end?: string | null;
}
export interface BillingSummaryResponse { ok: boolean; entitlements: BillingEntitlements; derived: { total_mailboxes: number; mail_quota_total: number }; }
export interface BillingCheckoutResponse { ok: boolean; mode?: "checkout" | "subscription_updated" | "plan_changed"; url?: string; subscription?: string; error?: string; reason?: string; }

const BILLING_BASE = API_BASE.replace("/dashboard", ""); // https://api.useeasy.ai/v1

export async function fetchBillingSummary(): Promise<BillingSummaryResponse> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");
  const res = await fetch(`${BILLING_BASE}/billing/summary`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data.error || `API Fehler ${res.status}`);
  return data;
}

export async function startBillingCheckout(lookup_key: string, quantity?: number): Promise<BillingCheckoutResponse> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");
  const res = await fetch(`${BILLING_BASE}/billing/checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ lookup_key, quantity }),
  });
  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data.reason || data.error || `API Fehler ${res.status}`);
  return data;
}

export async function openBillingPortal(): Promise<{ ok: boolean; url?: string; error?: string }> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Nicht authentifiziert");
  const res = await fetch(`${BILLING_BASE}/billing/portal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data.error || `API Fehler ${res.status}`);
  return data;
}


// -- v4.98.0 (A1) KI-Transparenz: Zero-Export Token-Audit-Log --------------
export interface AiTransparencyCall {
  id: number;
  ts: string;
  purpose: string;
  model_id: string | null;
  region: string | null;
  input_hash_sha256: string | null;
  input_hash_short: string | null;
  pii_entities_removed_count: number;
  retention_note: string | null;
}
export interface AiTransparencyCallsResponse {
  ok: boolean;
  calls: AiTransparencyCall[];
  limit: number;
  offset: number;
}
export interface AiTransparencyByPurpose { purpose: string; n: number; }
export interface AiTransparencyByRegion { region: string; n: number; }
export interface AiTransparencySummary {
  calls_total: number;
  calls_7d: number;
  calls_30d: number;
  pii_entities_removed_total: number;
  redacted_pct: number;
  zero_export: boolean;
  retention_note: string;
  by_purpose: AiTransparencyByPurpose[];
  by_region: AiTransparencyByRegion[];
}
export interface AiTransparencySummaryResponse { ok: boolean; summary: AiTransparencySummary; }

export const fetchAiTransparencySummary = () =>
  apiFetch<AiTransparencySummaryResponse>("/ai-transparency/summary");

export const fetchAiTransparencyCalls = (params?: { limit?: number; purpose?: string; since_days?: number }) => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.purpose) qs.set("purpose", params.purpose);
  if (params?.since_days) qs.set("since_days", String(params.since_days));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<AiTransparencyCallsResponse>(`/ai-transparency/calls${suffix}`);
};

// ---- v4.108.0 Dokumente / Zahlungserinnerungen (AR) ----
export interface TenantDocument {
  id: number;
  doc_type: "ar_invoice" | "dunning";
  status: string;
  counterpart_name: string | null;
  counterpart_email: string | null;
  invoice_ref: string | null;
  amount_gross: number | null;
  currency: string | null;
  issue_date: string | null;
  due_date: string | null;
  detected_from: string | null;
  confidence: number | null;
  needs_confirmation: boolean | null;
  mahnstufe: number | null;
  parent_document_id: number | null;
  reminder_count: number | null;
  last_reminded_at: string | null;
  paid_at: string | null;
  subject: string | null;
  cover_text: string | null;
  source_subject: string | null;
  created_at: string | null;
  // vom Backend berechnet:
  days_overdue: number | null;
  overdue: boolean;
  suggested_mahnstufe: number | null;
  amount_display: string | null;
}
export interface DocumentsListResponse { ok: boolean; items: TenantDocument[]; }
export interface DunningDraft {
  ok: boolean; dunning_document_id: number; ar_invoice_id: number; mahnstufe: number;
  subject: string; body: string; to_email: string | null; to_name: string | null;
  amount: string; days_overdue: number; used_llm: boolean;
}
export interface ScanResult {
  ok: boolean; tenant_id?: string; scanned?: number; structured?: number;
  text_fallback?: number; upserted?: number; skipped?: number | string;
}
export interface ImportResult { ok: boolean; imported?: number; updated?: number; marked_paid?: number; skipped?: number; }

export async function listDocuments(docType: "ar_invoice" | "dunning" = "ar_invoice", status?: string): Promise<DocumentsListResponse> {
  const qs = new URLSearchParams({ doc_type: docType });
  if (status) qs.set("status", status);
  return apiFetch<DocumentsListResponse>(`/documents?${qs.toString()}`);
}
export async function scanSentForAr(sinceHours?: number): Promise<ScanResult> {
  return apiPost<ScanResult>("/documents/scan", sinceHours ? { since_hours: sinceHours } : {});
}
export async function generateDunning(arInvoiceId: number, opts?: { mahnstufe?: number; use_llm?: boolean }): Promise<DunningDraft> {
  return apiPost<DunningDraft>("/documents/dunning/generate", { ar_invoice_id: arInvoiceId, ...(opts || {}) });
}
export async function submitDocumentVerdict(documentId: number, action: "approve" | "reject", edited?: { subject?: string; body?: string }): Promise<{ ok: boolean; document_id: number; status: string }> {
  return apiPost<{ ok: boolean; document_id: number; status: string }>("/documents/verdict", { document_id: documentId, action, edited_subject: edited?.subject, edited_body: edited?.body });
}
export async function markArPaid(arInvoiceId: number, undo = false): Promise<{ ok: boolean; ar_invoice_id: number; status: string }> {
  return apiPost<{ ok: boolean; ar_invoice_id: number; status: string }>("/documents/mark-paid", { ar_invoice_id: arInvoiceId, undo });
}
export async function addManualAr(rec: { invoice_ref?: string; counterpart_name?: string; counterpart_email?: string; amount_gross: string | number; currency?: string; issue_date?: string; due_date?: string }): Promise<{ ok: boolean; ar_invoice_id: number }> {
  return apiPost<{ ok: boolean; ar_invoice_id: number }>("/documents/ar", rec as Record<string, unknown>);
}
export async function importArXlsx(fileBase64: string): Promise<ImportResult> {
  return apiPost<ImportResult>("/documents/import", { file_base64: fileBase64 });
}
// Binary .xlsx-Download (nutzt getToken + API_BASE aus diesem Modul)
export async function exportArXlsx(): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/documents/export`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("export_failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "forderungen.xlsx"; a.click();
  URL.revokeObjectURL(url);
}

// ---- v4.134.0 Mahn-Zyklus (on-demand Scanner-Lauf + Per-Tenant-Settings) + Steuerberater-CSV ----
// Alles ueber die BESTEHENDE /documents/ar-Route gemultiplext (action-Feld) bzw. die
// bestehende /documents/export-Route (format-Param) — bewusst NULL neue API-GW-Routen.
export interface DunningSettings {
  ok?: boolean;
  enabled: boolean;
  documents_enabled: boolean;
  feature_on: boolean;
  grace_days: number;
  cooldown_days: number;
  use_llm_tone: boolean;
  migration_missing?: boolean;
}
export const fetchDunningSettings = () =>
  apiPost<DunningSettings>("/documents/ar", { action: "dunning_settings_get" });
export const setDunningSettings = (
  patch: { enabled?: boolean; grace_days?: number; cooldown_days?: number; use_llm_tone?: boolean },
) => apiPost<{ ok: boolean; error?: string } & Partial<DunningSettings>>(
  "/documents/ar", { action: "dunning_settings_set", ...patch },
);

// Bestaetigen-Geste fuer needs_confirmation-Zeilen (Text-Fallback). Erst danach darf
// der Zyklus die Zeile automatisch bemahnen (needs_confirmation -> false).
export const confirmArInvoice = (arInvoiceId: number) =>
  apiPost<{ ok: boolean; ar_invoice_id: number; needs_confirmation?: boolean; error?: string }>(
    "/documents/ar", { action: "confirm", ar_invoice_id: arInvoiceId },
  );

export interface DunningRunItem {
  ar_invoice_id: number;
  invoice_ref: string | null;
  counterpart_name: string | null;
  amount_gross: number | null;
  currency: string | null;
  due_date: string | null;
  days_overdue: number | null;
  reminder_count: number | null;
  suggested_mahnstufe: number | null;
}
export interface DunningRunTenantResult {
  tenant_id?: string;
  items?: DunningRunItem[];
  would_generate?: number;
  generated?: number;
  [k: string]: unknown;
}
export interface DunningRunResult {
  ok: boolean;
  dry_run?: boolean;
  results?: DunningRunTenantResult[];
  would_generate?: number;
  generated?: number;
  error?: string;
  migration_missing?: boolean;
}
// dry_run=true -> Vorschau (keine Entwuerfe). dry_run=false -> erzeugt Konsole-Entwuerfe
// (force intern; der Button ist die explizite Owner-Geste, kein Automatik-Opt-in noetig).
export const runDunning = (dryRun: boolean) =>
  apiPost<DunningRunResult>("/documents/ar", { action: "dunning_run", dry_run: dryRun });

// Steuerberater-OPOS als DATEV-kompatible CSV (UTF-8-BOM, Semikolon). Bestehende
// /documents/export-Route mit ?format=datev (+ optional von/bis auf issue_date).
export async function exportArCsvDatev(range?: { from?: string; to?: string }): Promise<void> {
  const token = await getToken();
  const qs = new URLSearchParams({ format: "datev" });
  if (range?.from) qs.set("from", range.from);
  if (range?.to) qs.set("to", range.to);
  const res = await fetch(`${API_BASE}/documents/export?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("export_failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "forderungen-steuerberater.csv"; a.click();
  URL.revokeObjectURL(url);
}

import type { OfferPosition, OfferTotals } from "@/lib/offer-calc";

export interface TenantOffer {
  id: number;
  doc_type: string;
  status: string; // draft | approved | sent | void
  counterpart_name: string | null;
  counterpart_email: string | null;
  subject: string | null;
  cover_text: string | null;
  positions: OfferPosition[] | null;
  totals: OfferTotals | null;
  valid_until: string | null;
  doc_number: string | null;
  source_provider: string | null;
  source_message_id: string | null;
  source_subject: string | null;
  thread_key: string | null;
  amount_gross: number | null;
  currency: string | null;
  created_at: string | null;
  updated_at: string | null;
  approved_at: string | null;
  detected_from?: string | null; // v4.130.0 — 'auto_scan' = automatisch aus E-Mail erstellt
}
export interface RequestItem {
  thread_key: string | null;
  source_message_id: string | null;
  provider: string | null;
  subject: string;
  sender: string;
  summary: string | null;
  event_at: string | null;
  has_offer: boolean;
  offer_id: number | null;
  offer_status: string | null;
  offer_auto?: boolean; // v4.130.0 — Angebot wurde automatisch aus der E-Mail erstellt
}
export interface GenerateOfferBody {
  source_message_id?: string; source_provider?: string; thread_key?: string; thread_text?: string;
  counterpart_name?: string; counterpart_email?: string; source_subject?: string;
  reverse_charge?: boolean; kleinunternehmer?: boolean; valid_days?: number; valid_until?: string;
}
export interface OfferGenerateResult {
  ok: boolean; document_id: number; positions: OfferPosition[]; totals: OfferTotals;
  cover_text: string; subject: string; valid_until: string | null;
  llm_used: boolean; incomplete: boolean; has_price_list: boolean;
  price_list_source: { id: number; name: string; provider?: string } | null; kleinunternehmer_default: boolean;
  skipped?: string;
}
export interface UpdateOfferBody {
  document_id: number; positions: OfferPosition[]; subject?: string; cover_text?: string;
  valid_until?: string; doc_number?: string; counterpart_name?: string; counterpart_email?: string;
  reverse_charge?: boolean; kleinunternehmer?: boolean;
  rabatt_gesamt_prozent?: number | string | null; rabatt_gesamt_betrag?: number | string | null;
  skonto_prozent?: number | string | null; skonto_tage?: number | string | null;
}
export interface OfferUpdateResult { ok: boolean; document_id: number; positions: OfferPosition[]; totals: OfferTotals; incomplete: boolean; error?: string; details?: string[]; }

export async function listRequests(limit = 40): Promise<{ ok: boolean; items: RequestItem[] }> {
  return apiFetch<{ ok: boolean; items: RequestItem[] }>(`/documents/requests?limit=${limit}`);
}

// ── v4.130.0: Auto-Angebot aus E-Mail — Einstellungen ──
export interface AutoOfferSettings {
  ok: boolean;
  enabled: boolean;
  documents_enabled: boolean;
  feature_on: boolean;
  migration_missing?: boolean;
}
export const fetchAutoOfferSettings = () =>
  apiFetch<AutoOfferSettings>("/documents/auto-offer-settings");
export const setAutoOfferEnabled = (enabled: boolean) =>
  apiPost<{ ok: boolean; enabled: boolean; error?: string }>("/documents/auto-offer-settings", { enabled });
export async function getOffer(id: number): Promise<{ ok: boolean; offer: TenantOffer }> {
  return apiFetch<{ ok: boolean; offer: TenantOffer }>(`/documents/offer?id=${id}`);
}
export async function generateOffer(body: GenerateOfferBody): Promise<OfferGenerateResult> {
  return apiPost<OfferGenerateResult>("/documents/offer/generate", body as Record<string, unknown>);
}
export async function updateOffer(body: UpdateOfferBody): Promise<OfferUpdateResult> {
  return apiPost<OfferUpdateResult>("/documents/offer/update", body as unknown as Record<string, unknown>);
}
export async function submitOfferVerdict(
  documentId: number, action: "approve" | "reject", opts?: { send_cover_letter?: boolean },
): Promise<{ ok: boolean; document_id: number; status: string; mailbox?: { provider: string | null; draft: boolean } | null; error?: string;
  auto_invoice?: { ok: boolean; invoice_id?: number; hint?: string } | null; // v4.130.0
}> {
  return apiPost("/documents/offer/verdict", { document_id: documentId, action, ...(opts || {}) });
}

// ============================================================================
// >>> In src/lib/api-client.ts ANHAENGEN (am Ende) <<<
// Phase 2a - Rechnung. Nutzt apiFetch / apiPost. OfferPosition/OfferTotals sind
// aus der Phase-1b-Ergaenzung bereits importiert (reuse der Rechen-Engine-Typen).
// ============================================================================

export interface BuyerAddress {
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country_code?: string | null;
}
export interface TenantInvoice {
  id: number;
  doc_type: string;
  status: string; // draft | final | void
  counterpart_name: string | null;
  counterpart_email: string | null;
  counterpart_address: BuyerAddress | null;
  buyer_vat_id: string | null;
  subject: string | null;
  cover_text: string | null;
  positions: OfferPosition[] | null;
  totals: OfferTotals | null;
  doc_number: string | null;
  issue_date: string | null;
  service_date: string | null;
  due_date: string | null;
  amount_gross: number | null;
  currency: string | null;
  parent_document_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  approved_at: string | null;
}
export interface InvoiceListItem {
  id: number;
  status: string;
  doc_number: string | null;
  counterpart_name: string | null;
  counterpart_email: string | null;
  subject: string | null;
  amount_gross: number | null;
  currency: string | null;
  issue_date: string | null;
  service_date: string | null;
  due_date: string | null;
  parent_document_id: number | null;
  created_at: string | null;
}
export interface ApprovedOfferItem {
  id: number;
  status: string;
  doc_number: string | null;
  counterpart_name: string | null;
  counterpart_email: string | null;
  subject: string | null;
  amount_gross: number | null;
  currency: string | null;
  valid_until: string | null;
  created_at: string | null;
  approved_at: string | null;
  has_invoice: boolean;
  invoice_id: number | null;
}
export interface BillingProfile {
  tenant_id?: string;
  company_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country_code: string | null;
  vat_id: string | null;
  tax_number: string | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_web: string | null;
  logo_url: string | null;
  invoice_prefix: string | null;
  default_payment_terms_days: number | null;
  kleinunternehmer: boolean;
}
export interface UpdateInvoiceBody {
  document_id: number;
  positions: OfferPosition[];
  subject?: string;
  cover_text?: string;
  counterpart_name?: string;
  counterpart_email?: string;
  counterpart_address?: BuyerAddress | null;
  buyer_vat_id?: string;
  service_date?: string;
  issue_date?: string;
  reverse_charge?: boolean;
  kleinunternehmer?: boolean;
  rabatt_gesamt_prozent?: number | string | null;
  rabatt_gesamt_betrag?: number | string | null;
  skonto_prozent?: number | string | null;
  skonto_tage?: number | string | null;
}
export interface InvoiceUpdateResult {
  ok: boolean;
  document_id: number;
  positions: OfferPosition[];
  totals: OfferTotals;
  incomplete: boolean;
  error?: string;
  details?: string[];
}
export interface GenerateInvoiceResult {
  ok: boolean;
  document_id: number;
  from_offer?: number;
  positions?: OfferPosition[];
  totals?: OfferTotals;
  incomplete?: boolean;
  error?: string;
  status?: string;
  skipped?: string;
}
export interface FinalizeInvoiceResult {
  ok: boolean;
  document_id?: number;
  status?: string;
  doc_number?: string;
  issue_date?: string;
  due_date?: string;
  totals?: OfferTotals;
  error?: string;
  missing?: string[];
  skipped?: string;
}

export async function listInvoices(limit = 50): Promise<{ ok: boolean; items: InvoiceListItem[] }> {
  return apiFetch<{ ok: boolean; items: InvoiceListItem[] }>(`/documents/invoices?limit=${limit}`);
}
export async function listApprovedOffers(limit = 40): Promise<{ ok: boolean; items: ApprovedOfferItem[] }> {
  return apiFetch<{ ok: boolean; items: ApprovedOfferItem[] }>(`/documents/offers/approved?limit=${limit}`);
}
export async function getInvoice(id: number): Promise<{ ok: boolean; invoice: TenantInvoice }> {
  return apiFetch<{ ok: boolean; invoice: TenantInvoice }>(`/documents/invoice?id=${id}`);
}
export async function generateInvoice(
  body: { offer_id?: number; counterpart_name?: string; subject?: string; reverse_charge?: boolean; kleinunternehmer?: boolean },
): Promise<GenerateInvoiceResult> {
  return apiPost<GenerateInvoiceResult>("/documents/invoice/generate", body as Record<string, unknown>);
}
export async function updateInvoice(body: UpdateInvoiceBody): Promise<InvoiceUpdateResult> {
  return apiPost<InvoiceUpdateResult>("/documents/invoice/update", body as unknown as Record<string, unknown>);
}
export async function finalizeInvoice(documentId: number): Promise<FinalizeInvoiceResult> {
  return apiPost<FinalizeInvoiceResult>("/documents/invoice/finalize", { document_id: documentId });
}
export async function voidInvoice(documentId: number): Promise<{ ok: boolean; document_id?: number; status?: string; error?: string }> {
  return apiPost("/documents/invoice/void", { document_id: documentId });
}
export async function getBillingProfile(): Promise<{ ok: boolean; profile: BillingProfile | null; complete: boolean }> {
  return apiFetch<{ ok: boolean; profile: BillingProfile | null; complete: boolean }>(`/documents/billing-profile`);
}
export async function updateBillingProfile(body: Partial<BillingProfile>): Promise<{ ok: boolean; profile: BillingProfile | null }> {
  return apiPost<{ ok: boolean; profile: BillingProfile | null }>("/documents/billing-profile", body as Record<string, unknown>);
}

// ============================================================================
// v4.132.0 — Zeiterfassung (BRIEFING-ZEITERFASSUNG-MITARBEITER-2026-07-21)
// Mitarbeiter erfassen Zeiten (mobil-first), Owner uebernimmt sie als
// Positionen in Angebot/Rechnung. Employee-Routen laufen ueber den eigenen
// Backend-Resolver (resolveTimeActor) — hier nur duenne Client-Wrapper.
// ============================================================================

export interface TimeEntry {
  id: number;
  member_email: string;
  customer_name: string | null;
  description: string | null;
  started_at: string;
  ended_at: string;
  duration_min: number;
  billable: boolean;
  hourly_rate_cents: number | null;
  cost_rate_cents: number | null; // v4.133.0 — Lohn-/Kostensatz-Snapshot (was der Betrieb dem Mitarbeiter zahlt)
  status: "open" | "billed";
  invoice_document_id: number | null;
  source: string;
  project_id?: number | null;   // v4.137.0 — Projekt-Referenz (One-Click statt Freitext)
  project_name?: string | null; // v4.137.0 — Namens-Snapshot bei Anlage (stabil bei Umbenennen/Archivieren)
}
export interface TimeTotals { scope_min: number; open_billable_min: number; week_min: number; month_min: number }
export interface TimeEntriesResponse { ok: boolean; role: "owner" | "employee"; items: TimeEntry[]; totals: TimeTotals; customers: string[] }
export interface TimeEntryInput {
  customer_name?: string;
  description?: string;
  billable?: boolean;
  started_at?: string;
  ended_at?: string;
  date?: string;
  duration_min?: number;
  member_email?: string; // nur Owner (Nacherfassung); Backend erzwingt Token-Mail fuer Employees
  project_id?: number | null; // v4.137.0 — Projektwahl; Server-Snapshot ueberschreibt customer_name, null loest die Bindung
}
export interface TeamMember { id: number; email: string; display_name: string | null; role: "owner" | "employee"; hourly_rate_cents: number | null; cost_rate_cents?: number | null; active: boolean; created_at?: string }
export interface TimeSummaryItem { customer_name: string | null; member_email: string; display_name: string; entries: number; minutes: number; hours: number | null; open_billable_minutes: number; amount_cents: number; entries_without_rate: number }

export function listTimeEntries(params: { from?: string; to?: string; customer?: string; member?: string; status?: "open" | "billed" } = {}): Promise<TimeEntriesResponse> {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.customer) q.set("customer", params.customer);
  if (params.member) q.set("member", params.member);
  if (params.status) q.set("status", params.status);
  const qs = q.toString();
  return apiFetch<TimeEntriesResponse>(`/time/entries${qs ? "?" + qs : ""}`);
}
export function createTimeEntry(body: TimeEntryInput): Promise<{ ok: boolean; entry: TimeEntry; rate_missing?: boolean; error?: string }> {
  return apiPost("/time/entries", body as Record<string, unknown>);
}
export function updateTimeEntry(body: Partial<TimeEntryInput> & { id: number; hourly_rate_cents?: number | null }): Promise<{ ok: boolean; entry: TimeEntry; error?: string }> {
  return apiPost("/time/entries/update", body as Record<string, unknown>);
}
export function deleteTimeEntry(id: number): Promise<{ ok: boolean; deleted?: number; error?: string }> {
  return apiPost("/time/entries/delete", { id });
}
export function unbillTimeEntry(id: number): Promise<{ ok: boolean; entry?: TimeEntry; hint?: string; error?: string }> {
  return apiPost("/time/entries/unbill", { id });
}
export function fetchTimeSummary(params: { customer?: string; from?: string; to?: string; status?: "open" | "billed" } = {}): Promise<{ ok: boolean; items: TimeSummaryItem[] }> {
  const q = new URLSearchParams();
  if (params.customer) q.set("customer", params.customer);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.status) q.set("status", params.status);
  const qs = q.toString();
  return apiFetch(`/time/summary${qs ? "?" + qs : ""}`);
}
export interface ApplyTimeResult { ok: boolean; document_id?: number; doc_type?: string; added_positions?: number; applied_entry_ids?: number[]; skipped_entry_ids?: number[]; entries_without_rate?: number; totals?: OfferTotals; incomplete?: boolean; error?: string }
export function applyTimeToDocument(body: { document_id: number; entry_ids: number[]; gruppierung?: "je_eintrag" | "je_mitarbeiter" | "gesamt" }): Promise<ApplyTimeResult> {
  return apiPost("/time/apply-to-document", body as unknown as Record<string, unknown>);
}
export function listTeamMembers(): Promise<{ ok: boolean; members: TeamMember[]; settings: { default_hourly_rate_cents: number | null; default_cost_rate_cents?: number | null } }> {
  return apiFetch("/team/members");
}
export function upsertTeamMember(body: { email: string; display_name?: string; hourly_rate_cents?: number | null; cost_rate_cents?: number | null; role?: "owner" | "employee"; active?: boolean }): Promise<{ ok: boolean; member?: TeamMember; error?: string }> {
  return apiPost("/team/members", body as Record<string, unknown>);
}
export function deleteTeamMember(body: { email?: string; id?: number; hard?: boolean }): Promise<{ ok: boolean; deactivated?: string; deleted?: string; error?: string; entries?: number }> {
  return apiPost("/team/members/delete", body as Record<string, unknown>);
}
export function updateTimeSettings(body: { default_hourly_rate_cents?: number | null; default_cost_rate_cents?: number | null }): Promise<{ ok: boolean; settings?: { default_hourly_rate_cents: number | null; default_cost_rate_cents?: number | null }; error?: string }> {
  return apiPost("/time/settings", body as Record<string, unknown>);
}

// ── v4.137.0 — Projekte (One-Click-Auswahl statt Freitext-Kunde) ─────────────
// Der Chef legt Projekte an ("Familie Mueller", "Baustelle Hauptstrasse"), der
// Mitarbeiter waehlt per Dropdown. Owner-CRUD; Employee liest nur aktive.
// Laeuft unter der bestehenden time-Greedy-Route (0 neue API-GW-Routen).
export interface TimeProject {
  id: number;
  name: string;
  address?: string | null;
  note?: string | null;
  active: boolean;
  sort_order: number;
  archived?: boolean;
}
export function listTimeProjects(params: { active?: boolean } = {}): Promise<{ ok: boolean; role?: "owner" | "employee"; items: TimeProject[]; projects_unavailable?: boolean }> {
  const qs = params.active ? "?active=1" : "";
  return apiFetch(`/time/projects${qs}`);
}
export function createTimeProject(body: { name: string; address?: string; note?: string; sort_order?: number }): Promise<{ ok: boolean; project?: TimeProject; error?: string; detail?: string }> {
  return apiPost("/time/projects", body as Record<string, unknown>);
}
export function updateTimeProject(body: { id: number; name?: string; address?: string | null; note?: string | null; active?: boolean; sort_order?: number }): Promise<{ ok: boolean; project?: TimeProject; error?: string }> {
  return apiPost("/time/projects/update", body as Record<string, unknown>);
}
export function deleteTimeProject(body: { id: number; hard?: boolean }): Promise<{ ok: boolean; archived?: number; deleted?: number; already_archived?: boolean; error?: string; entries?: number }> {
  return apiPost("/time/projects/delete", body as Record<string, unknown>);
}

// ── v4.140.0 — Urlaub + Krankmeldung (Abwesenheit) ───────────────────────────
// Ein Abwesenheits-Modell fuer Urlaub UND Krank (Typ-Diskriminator absence_type).
// Laeuft unter der bestehenden time-Greedy-Route (0 neue API-GW-Routen). Urlaub:
// pending -> approved/rejected (bucht Resttage vom Urlaubskonto). Krank: reported
// -> acknowledged (KEINE Genehmigung, KEINE Kontingent-Abbuchung). Mitarbeiter-
// Identitaet kommt serverseitig aus dem Token; Owner darf ein Mitglied nennen.
export type AbsenceType = "vacation" | "sick";
export type AbsenceStatus = "pending" | "approved" | "rejected" | "cancelled" | "reported" | "acknowledged";
export interface Absence {
  id: number;
  member_email: string;
  absence_type: AbsenceType;
  start_date: string;
  end_date: string;
  half_day_start: boolean;
  half_day_end: boolean;
  days_count: number | null;
  note: string | null;
  status: AbsenceStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  attest_file_id: number | null; // AU-Beleg (Lane-2-Fast-Follow); v1 immer null
  created_at?: string;
  updated_at?: string;
}
export interface VacationAccount {
  year: number;
  member_email: string;
  annual_days: number;
  carried_over: number;
  used_days: number;
  remaining_days: number;
  source: "account" | "tenant_default" | "default";
}
export interface AbsenceListResponse { ok: boolean; role?: "owner" | "employee"; items: Absence[]; absence_unavailable?: boolean }
export interface AbsenceMutationResponse { ok: boolean; absence?: Absence; vacation?: VacationAccount; overdraft?: boolean; cancelled?: number; conflict_id?: number; error?: string; detail?: string }

export function listAbsences(params: { type?: AbsenceType; year?: number; status?: AbsenceStatus; member?: string } = {}): Promise<AbsenceListResponse> {
  const q = new URLSearchParams();
  if (params.type) q.set("type", params.type);
  if (params.year) q.set("year", String(params.year));
  if (params.status) q.set("status", params.status);
  if (params.member) q.set("member", params.member);
  const qs = q.toString();
  return apiFetch<AbsenceListResponse>(`/time/absence${qs ? "?" + qs : ""}`);
}
export function createAbsence(body: { type: AbsenceType; start_date: string; end_date?: string; half_day_start?: boolean; half_day_end?: boolean; note?: string; member_email?: string }): Promise<AbsenceMutationResponse> {
  return apiPost("/time/absence", body as Record<string, unknown>);
}
export function decideAbsence(body: { id: number; action: "approve" | "reject"; note?: string }): Promise<AbsenceMutationResponse> {
  return apiPost("/time/absence/decide", body as Record<string, unknown>);
}
export function acknowledgeAbsence(id: number): Promise<AbsenceMutationResponse> {
  return apiPost("/time/absence/acknowledge", { id });
}
export function cancelAbsence(id: number): Promise<AbsenceMutationResponse> {
  return apiPost("/time/absence/cancel", { id });
}
export function fetchVacationAccount(params: { year?: number; member?: string } = {}): Promise<{ ok: boolean; role?: "owner" | "employee"; account: VacationAccount }> {
  const q = new URLSearchParams();
  if (params.year) q.set("year", String(params.year));
  if (params.member) q.set("member", params.member);
  const qs = q.toString();
  return apiFetch(`/time/vacation/account${qs ? "?" + qs : ""}`);
}
export function setVacationAccount(body: { member_email: string; year: number; annual_days: number; carried_over?: number }): Promise<{ ok: boolean; saved?: unknown; account?: VacationAccount; error?: string }> {
  return apiPost("/time/vacation/account", body as Record<string, unknown>);
}

// ============================================================================
// v4.142.0 — Verbindlichkeiten (AP) + PDF-Ablage + Cash-Index (Lane 2).
// Eine Route POST /documents/ap (action-Multiplex); Export ueber /documents/export
// (?scope=ap). PDF: presigned S3 (Upload Browser->S3, Ansicht per presigned GET).
// ============================================================================
export interface ApInvoice {
  id: number;
  status: "open" | "paid" | "void" | "disputed" | string;
  counterpart_name: string | null;
  counterpart_email: string | null;
  counterpart_entity_key: string | null;
  invoice_ref: string | null;
  amount_gross: number | null;
  amount_display: string | null;
  currency: string | null;
  issue_date: string | null;
  due_date: string | null;
  days_overdue: number | null;
  overdue: boolean;
  needs_confirmation: boolean;
  detected_from: string | null;
  has_pdf: boolean;
  paid_at: string | null;
  created_at: string | null;
  pdf_url?: string | null;
  pdf_filename?: string | null;
}
export interface ApListResponse { ok: boolean; items: ApInvoice[]; skipped?: string; }
export interface ApGetResponse { ok: boolean; item: ApInvoice; }
export interface CashSide { total: number; due_horizon: number; overdue: number; }
export interface CashIndex {
  ok: boolean;
  horizon_days: number;
  receivables: CashSide;
  payables: CashSide;
  cash_index: number;
  coverage_ratio: number | null;
  ampel: "gruen" | "gelb" | "rot" | string;
  currency: string;
  as_of: string;
}
export interface ApSettings {
  accounting_ap_enabled: boolean;
  cash_horizon_days: number;
  auto_ingest: boolean;
  migration_missing?: boolean;
}

export const listAp = (status?: string, counterpart?: string) =>
  apiPost<ApListResponse>("/documents/ap", { action: "list", status, counterpart });
export const getAp = (apId: number) =>
  apiPost<ApGetResponse>("/documents/ap", { action: "get", ap_id: apId });
export const createAp = (rec: { counterpart_name: string; counterpart_email?: string; invoice_ref?: string; amount_gross: string | number; currency?: string; issue_date?: string; due_date?: string }) =>
  apiPost<{ ok: boolean; ap_id: number; created: boolean; updated: boolean }>("/documents/ap", { action: "create", ...rec });
export const confirmAp = (apId: number) =>
  apiPost<{ ok: boolean; ap_id: number; needs_confirmation: boolean }>("/documents/ap", { action: "confirm", ap_id: apId });
export const markApPaid = (apId: number, paid = true) =>
  apiPost<{ ok: boolean; ap_id: number; status: string }>("/documents/ap", { action: paid ? "mark_paid" : "unmark_paid", ap_id: apId });
export const setApStatus = (apId: number, status: string) =>
  apiPost<{ ok: boolean; ap_id: number; status: string }>("/documents/ap", { action: "set_status", ap_id: apId, status });
export const fetchCashIndex = (horizon?: number) =>
  apiPost<CashIndex>("/documents/ap", { action: "cashindex", horizon });
export const fetchApSettings = () =>
  apiPost<{ ok: boolean; feature_on: boolean; settings: ApSettings }>("/documents/ap", { action: "settings_get" });
export const setApSettings = (patch: { accounting_ap_enabled?: boolean; cash_horizon_days?: number; auto_ingest?: boolean }) =>
  apiPost<{ ok: boolean; settings: ApSettings; error?: string }>("/documents/ap", { action: "settings_set", ...patch });

async function _sha256Hex(buf: ArrayBuffer): Promise<string> {
  const dig = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
// PDF hinterlegen: presigned PUT direkt Browser->S3, danach an die AP-Zeile haengen.
export async function uploadApPdf(apId: number, file: File): Promise<{ ok: boolean; file_id?: number; error?: string }> {
  const buf = await file.arrayBuffer();
  const sha = await _sha256Hex(buf);
  const mime = file.type || "application/pdf";
  const u = await apiPost<{ ok: boolean; put_url: string; s3_key: string; error?: string }>(
    "/documents/ap", { action: "upload_url", filename: file.name, mime, sha256: sha });
  if (!u.ok || !u.put_url) throw new Error(u.error || "upload_url_failed");
  const put = await fetch(u.put_url, { method: "PUT", body: file, headers: { "Content-Type": mime } });
  if (!put.ok) throw new Error("s3_put_failed");
  return apiPost<{ ok: boolean; file_id?: number; error?: string }>(
    "/documents/ap", { action: "attach", ap_id: apId, s3_key: u.s3_key, filename: file.name, mime, byte_size: file.size, sha256: sha });
}

export async function exportApXlsx(): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/documents/export?scope=ap`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("export_failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "verbindlichkeiten.xlsx"; a.click();
  URL.revokeObjectURL(url);
}
export async function exportApCsvDatev(range?: { from?: string; to?: string }): Promise<void> {
  const token = await getToken();
  const qs = new URLSearchParams({ scope: "ap", format: "datev" });
  if (range?.from) qs.set("from", range.from);
  if (range?.to) qs.set("to", range.to);
  const res = await fetch(`${API_BASE}/documents/export?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("export_failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "verbindlichkeiten-steuerberater.csv"; a.click();
  URL.revokeObjectURL(url);
}
