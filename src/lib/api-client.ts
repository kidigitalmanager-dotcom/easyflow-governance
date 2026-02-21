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

// ── Types ──────────────────────────────────────────────

export interface TenantInfo {
  tenant_id: string;
  tenant_name?: string;
  status: string;
  mailbox_profile?: string;
  gmail_enabled?: boolean;
  outlook_enabled?: boolean;
  [key: string]: unknown;
}

export interface PlanInfo {
  name: string;
  mailbox_limit: number;
  active_mailboxes: number;
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

export interface DashboardStats {
  emails_today: number;
  emails_week: number;
  priority_breakdown: Record<string, number>;
  drafts_created_week: number;
  resolved_week: number;
  [key: string]: unknown;
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

// ── Fetchers ───────────────────────────────────────────

export const fetchMe = () => apiFetch<UserInfo>("/me");
export const fetchStats = () => apiFetch<DashboardStats>("/stats");
export const fetchRecentEmails = () => apiFetch<RecentEmail[]>("/emails/recent");
export const fetchAuditLog = () => apiFetch<AuditLogEntry[]>("/audit");
export const fetchPlaybooks = () => apiFetch<PlaybooksResponse>("/playbooks");
