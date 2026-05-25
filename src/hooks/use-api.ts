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
  fetchAutonomyPolicy,
  saveAutonomyPolicy,
  testAutonomyPolicy,
  fetchPlaybookCatalog,
  savePlaybookActive,
  // Autopilot Email (Chat B + C)
  submitAutopilotFeedback,
  // Console Review-Queue (v4.18.0)
  submitReviewVerdict,
  generateDraft,
  requestAutopilotPromotion,
  fetchAutopilotFewShot,
  fetchAutopilotLog,
  fetchAutopilotAuditSamples,
  fetchAutopilotPolicy,
  saveAutopilotPolicy,
  fetchAutopilotPromotionPendingAdmin,
  promoteAutopilot,
} from "@/lib/api-client";
import type { AutopilotChannel, AutonomyPolicyPayload, AutonomyTestCallPayload, PlaybookActivePayload, AutopilotFeedbackInput,
  ReviewVerdictInput, AutopilotPromoteRequestInput, AutopilotPolicyPutInput, AutopilotCoreKey, AutopilotPromoteInput } from "@/lib/api-client";
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
// ── Hooks: Jana-Autopilot (Phase 3C) ─────────────────────────────────

export function useAutonomyPolicy(channel: AutopilotChannel = "voice") {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["autonomy-policy", channel],
    queryFn: () => fetchAutonomyPolicy(channel),
    enabled: !!session,
    staleTime: 30_000,
    // 404 (policy_not_found) ist ein erwarteter Zustand — fangen wir im Tab ab,
    // nicht hier. apiFetch wirft bei !ok eine ApiError; wir lassen die durch.
    retry: false,
  });
}

export function useSaveAutonomyPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AutonomyPolicyPayload) => saveAutonomyPolicy(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomy-policy"] }),
  });
}

export function useTestAutonomyPolicy() {
  return useMutation({
    mutationFn: (payload: AutonomyTestCallPayload) => testAutonomyPolicy(payload),
  });
}

// ── Hooks: Playbook-Picker (Phase 3D) ────────────────────────────────

export function usePlaybookCatalog() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["playbook-catalog"],
    queryFn: fetchPlaybookCatalog,
    enabled: !!session,
    staleTime: 30_000,
  });
}

export function useSavePlaybookActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PlaybookActivePayload) => savePlaybookActive(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playbook-catalog"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Autopilot Email (Chat B + C, v4.16.0 + v4.17.x)
// ════════════════════════════════════════════════════════════════════════════

// Approve/Edit/Reject — Feedback-Capture
export function useSubmitAutopilotFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AutopilotFeedbackInput) => submitAutopilotFeedback(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recent-emails"] });
      qc.invalidateQueries({ queryKey: ["audit-log"] });
      qc.invalidateQueries({ queryKey: ["autopilot-log"] });
    },
  });
}

// ── v4.18.0: Console Review-Queue (operatives Verdict + On-demand Draft) ──────
export function useSubmitReviewVerdict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewVerdictInput) => submitReviewVerdict(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recent-emails"] });
      qc.invalidateQueries({ queryKey: ["audit-log"] });
      qc.invalidateQueries({ queryKey: ["autopilot-log"] });
    },
  });
}

export function useGenerateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => generateDraft(eventId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recent-emails"] });
    },
  });
}

// Tenant-Admin Promotion-Anfrage
export function useRequestAutopilotPromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AutopilotPromoteRequestInput) => requestAutopilotPromotion(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["autopilot-policy"] });
    },
  });
}

// Few-Shot anzeige pro Core-Key
export function useAutopilotFewShot(coreKey: AutopilotCoreKey | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["autopilot-few-shot", coreKey],
    queryFn: () => fetchAutopilotFewShot(coreKey as AutopilotCoreKey),
    enabled: !!session && !!coreKey,
    staleTime: 60_000,
  });
}

// Audit-Log
export function useAutopilotLog(params: { decision?: string; action_type?: string; limit?: number; offset?: number } = {}) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["autopilot-log", params],
    queryFn: () => fetchAutopilotLog(params),
    enabled: !!session,
    staleTime: 30_000,
  });
}

// Stichproben-Audit-Samples
export function useAutopilotAuditSamples(params: { limit?: number; offset?: number } = {}) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["autopilot-audit-samples", params],
    queryFn: () => fetchAutopilotAuditSamples(params),
    enabled: !!session,
    staleTime: 30_000,
  });
}

// Policy GET (404 wenn noch nicht init)
export function useAutopilotPolicy() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["autopilot-policy"],
    queryFn: () => fetchAutopilotPolicy().catch((err) => {
      if (err && err.status === 404) return null;
      throw err;
    }),
    enabled: !!session,
    staleTime: 30_000,
  });
}

// Policy PUT
export function useSaveAutopilotPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AutopilotPolicyPutInput) => saveAutopilotPolicy(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["autopilot-policy"] });
    },
  });
}

// Super-Admin: Promotion-Pending-Liste
export function useAutopilotPromotionPending() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["autopilot-promotion-pending"],
    queryFn: () => fetchAutopilotPromotionPendingAdmin(),
    enabled: !!session,
    staleTime: 30_000,
    retry: false, // 403 sofort surface
  });
}

// Super-Admin: 1-Klick Promote
export function usePromoteAutopilot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AutopilotPromoteInput) => promoteAutopilot(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["autopilot-promotion-pending"] });
      qc.invalidateQueries({ queryKey: ["autopilot-policy"] });
    },
  });
}
