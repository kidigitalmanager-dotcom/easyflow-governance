import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchMe,
  fetchStats,
  fetchRecentEmails,
  fetchAuditLog,
  fetchPlaybooks,
  fetchKnowledge,
  uploadKnowledgeText,
  crawlKnowledgeUrl,
  deleteKnowledgeUpload,
  fetchSpreadsheets,
  fetchSpreadsheetMappings,
  fetchSpreadsheetAudit,
  uploadSpreadsheetFile,
  revertSpreadsheetAction,
  deleteSpreadsheet,
  toggleSpreadsheet,
  fetchVoiceReps,
  createVoiceRep,
  updateVoiceRep,
  deleteVoiceRep,
  fetchSalesCalls,
  fetchRecordingConsent,
  updateRecordingConsent,
} from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";

export function useMe() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDashboardStats() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchStats,
    enabled: !!session,
    refetchInterval: 60_000,
  });
}

export function useRecentEmails() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["recent-emails"],
    queryFn: fetchRecentEmails,
    enabled: !!session,
    refetchInterval: 30_000,
  });
}

export function useAuditLog() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["audit-log"],
    queryFn: fetchAuditLog,
    enabled: !!session,
  });
}

export function usePlaybooks() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["playbooks"],
    queryFn: fetchPlaybooks,
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Knowledge Base Hooks ──────────────────────────────────

export function useKnowledge() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["knowledge"],
    queryFn: fetchKnowledge,
    enabled: !!session,
    staleTime: 30_000,
  });
}

export function useKnowledgeUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadKnowledgeText,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
}

export function useKnowledgeCrawl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: crawlKnowledgeUrl,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
}

export function useKnowledgeDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteKnowledgeUpload,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
}

// ── Spreadsheet / Excel Live-Sync Hooks (v4.4.1) ─────────

export function useSpreadsheets() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["spreadsheets"],
    queryFn: fetchSpreadsheets,
    enabled: !!session,
    staleTime: 30_000,
  });
}

export function useSpreadsheetMappings(spreadsheetId: number | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["spreadsheet-mappings", spreadsheetId],
    queryFn: () => fetchSpreadsheetMappings(spreadsheetId!),
    enabled: !!session && spreadsheetId !== null,
  });
}

export function useSpreadsheetAudit(params?: {
  spreadsheet_id?: number;
  page?: number;
  per_page?: number;
}) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["spreadsheet-audit", params],
    queryFn: () => fetchSpreadsheetAudit(params),
    enabled: !!session,
    refetchInterval: 30_000,
  });
}

export function useSpreadsheetUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadSpreadsheetFile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spreadsheets"] });
      qc.invalidateQueries({ queryKey: ["me"] }); // spreadsheet_enabled may change
    },
  });
}

export function useSpreadsheetRevert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: revertSpreadsheetAction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spreadsheet-audit"] });
    },
  });
}

export function useSpreadsheetDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSpreadsheet,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spreadsheets"] });
    },
  });
}

export function useSpreadsheetToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ spreadsheetId, isActive }: { spreadsheetId: number; isActive: boolean }) =>
      toggleSpreadsheet(spreadsheetId, isActive),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spreadsheets"] });
    },
  });
}

// ── Voice / Sales-Calls / Consent Hooks (v4.9.0 — Blöcke 2/3/4/6) ─────────

export function useVoiceReps() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["voice-reps"],
    queryFn: fetchVoiceReps,
    enabled: !!session,
    staleTime: 30_000,
  });
}

export function useVoiceRepCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createVoiceRep,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voice-reps"] }),
  });
}

export function useVoiceRepUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repId, payload }: {
      repId: string;
      payload: Parameters<typeof updateVoiceRep>[1];
    }) => updateVoiceRep(repId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voice-reps"] }),
  });
}

export function useVoiceRepDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteVoiceRep,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voice-reps"] }),
  });
}

export function useSalesCalls(params?: {
  rep_id?: string;
  outcome?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["sales-calls", params],
    queryFn: () => fetchSalesCalls(params),
    enabled: !!session,
    refetchInterval: 60_000,
  });
}

export function useRecordingConsent() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["recording-consent"],
    queryFn: fetchRecordingConsent,
    enabled: !!session,
    staleTime: 30_000,
  });
}

export function useRecordingConsentUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateRecordingConsent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recording-consent"] }),
  });
}