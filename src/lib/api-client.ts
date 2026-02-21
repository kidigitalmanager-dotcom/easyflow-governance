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

export interface UserInfo {
  email: string;
  tenant_id: string;
  tenant_name: string;
  plan: string;
  role: string;
  [key: string]: unknown;
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
