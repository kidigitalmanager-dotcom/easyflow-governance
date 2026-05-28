import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchMe,
  fetchStats,
  fetchRecentEmails,
  fetchAuditLog,
  fetchPlaybooks,
  fetchAssistantConfig,
  saveAssistantConfig,
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
  downloadSpreadsheet,
  listOneDriveFiles,
  connectOneDrive,
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
  dismissReview,
  undoAuditAction,
  removeLabel,
  correctLabel,
  requestAutopilotPromotion,
  fetchAutopilotFewShot,
  fetchAutopilotLog,
  fetchAutopilotAuditSamples,
  fetchAutopilotPolicy,
  saveAutopilotPolicy,
  fetchAutopilotPromotionPendingAdmin,
  promoteAutopilot,
  fetchRuleSuggestions,
  decideRuleSuggestion,
  fetchApprovedRuleSuggestions,
  applyRuleSuggestion,
  activateRuleSuggestion,
  fetchImproveSuggestion,
  consentImproveSuggestion,
} from "@/lib/api-client";
import type { AutopilotChannel, AutonomyPolicyPayload, AutonomyTestCallPayload, PlaybookActivePayload, AutopilotFeedbackInput,
  ReviewVerdictInput, AutopilotPromoteRequestInput, AutopilotPolicyPutInput, AutopilotCoreKey, AutopilotPromoteInput, DecideRuleSuggestionInput, ApplyRuleInput } from "@/lib/api-client";
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

/**
 * v4.36.0 — Download S3-Version der Spreadsheet als .xlsx-Datei.
 * Triggert den Browser-Download direkt (anchor.click in api-client).
 */
export function useSpreadsheetDownload() {
  return useMutation({
    mutationFn: (spreadsheetId: number) => downloadSpreadsheet(spreadsheetId),
  });
}

// ── OneDrive Live-Sync Hooks (v4.39.0) ─────────
// useOneDriveFiles: lazy — lädt erst, wenn der Picker-Dialog geöffnet ist (enabled).
// retry:false, damit ein reconnect_required-403 sofort als Fehler angezeigt wird.
export function useOneDriveFiles(enabled: boolean, q?: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["onedrive-files", q ?? ""],
    queryFn: () => listOneDriveFiles(q),
    enabled: !!session && enabled,
    staleTime: 15_000,
    retry: false,
  });
}

export function useConnectOneDrive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: connectOneDrive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spreadsheets"] });
      qc.invalidateQueries({ queryKey: ["me"] }); // spreadsheet_enabled kann sich ändern
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

export function useDismissReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: import("@/lib/api-client").DismissReviewInput) => dismissReview(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recent-emails"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useUndoAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: import("@/lib/api-client").UndoInput) => undoAuditAction(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-log"] });
      qc.invalidateQueries({ queryKey: ["recent-emails"] });
    },
  });
}

// v4.18.9: Label-Undo im Postfach (Gmail removeLabelIds / Outlook category-remove, UE-only).
export function useRemoveLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { event_id: string }) => removeLabel(input.event_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-log"] });
      qc.invalidateQueries({ queryKey: ["recent-emails"] });
    },
  });
}

// v4.19.0: "Richtiges Label setzen" — ersetzt das UE-Label durch die korrekte
// Kategorie im Postfach + protokolliert die Korrektur (Lern-Korpus fuer Stufe 2/3).
export function useCorrectLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { event_id: string; to_core_key: string }) => correctLabel(input.event_id, input.to_core_key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-log"] });
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


// v4.24.0 (Stufe 3B): Regel-Vorschläge (Super-Admin)
export function useRuleSuggestions() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["rule-suggestions"],
    queryFn: fetchRuleSuggestions,
    enabled: !!session,
    staleTime: 60_000,
  });
}
export function useDecideRuleSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DecideRuleSuggestionInput) => decideRuleSuggestion(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rule-suggestions"] }); },
  });
}


// v4.25.0 (Stufe 3C): freigegebene Vorschläge anwenden/aktivieren
export function useApprovedRuleSuggestions() {
  const { session } = useAuth();
  return useQuery({ queryKey: ["rule-suggestions-approved"], queryFn: fetchApprovedRuleSuggestions, enabled: !!session, staleTime: 30_000 });
}
export function useApplyRuleSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplyRuleInput) => applyRuleSuggestion(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rule-suggestions-approved"] }); },
  });
}
export function useActivateRuleSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patternKey: string) => activateRuleSuggestion(patternKey),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rule-suggestions-approved"] }); },
  });
}


// v4.26.0 (Stufe 3A): Kunden-"System verbessern?"-Karte
export function useImproveSuggestion() {
  const { session } = useAuth();
  return useQuery({ queryKey: ["improve-suggestion"], queryFn: fetchImproveSuggestion, enabled: !!session, staleTime: 5 * 60 * 1000 });
}
export function useConsentImprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { patternKey: string; toCoreKey: string; senderDomain: string }) => consentImproveSuggestion(v.patternKey, v.toCoreKey, v.senderDomain),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["improve-suggestion"] }); },
  });
}


// v4.29.0 (1c): Operations-Assistenz — Timeout-Einstellung.
export function useAssistantConfig() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["assistant-config"],
    queryFn: fetchAssistantConfig,
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveAssistantConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveAssistantConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assistant-config"] });
    },
  });
}

// ── v4.32.0 Tenant-Setup (Voice/Assistenz) ──────────────────────────────────
import {
  fetchAdminTenants,
  archiveAdminTenant,
  deleteAdminTenant,
  fetchAdminTenantSetup,
  saveAdminTenantSetup,
  createAdminTenant,
  fetchTenantSetupSelf,
  saveTenantSetupSelf,
} from "@/lib/api-client";
import type { TenantSetupWriteBody, CreateTenantBody } from "@/lib/api-client";

export function useAdminTenants(includeArchived = false) {
  return useQuery({
    queryKey: ["admin-tenants", includeArchived],
    queryFn: () => fetchAdminTenants(includeArchived),
    staleTime: 30_000,
  });
}
export function useArchiveTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, archived }: { tenantId: string; archived: boolean }) => archiveAdminTenant(tenantId, archived),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-tenants"] }),
  });
}
export function useDeleteTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) => deleteAdminTenant(tenantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-tenants"] }),
  });
}
export function useAdminTenantSetup(tenantId: string | null) {
  return useQuery({
    queryKey: ["admin-tenant-setup", tenantId],
    queryFn: () => fetchAdminTenantSetup(tenantId as string),
    enabled: !!tenantId,
  });
}
export function useSaveAdminTenantSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, body }: { tenantId: string; body: TenantSetupWriteBody }) =>
      saveAdminTenantSetup(tenantId, body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-tenant-setup", vars.tenantId] });
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
  });
}
export function useCreateAdminTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTenantBody) => createAdminTenant(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-tenants"] }),
  });
}
export function useTenantSetupSelf() {
  return useQuery({ queryKey: ["tenant-setup-self"], queryFn: fetchTenantSetupSelf });
}
export function useSaveTenantSetupSelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TenantSetupWriteBody) => saveTenantSetupSelf(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-setup-self"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
