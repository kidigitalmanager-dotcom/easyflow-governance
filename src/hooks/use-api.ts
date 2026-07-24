import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBillingSummary, startBillingCheckout, openBillingPortal } from "@/lib/api-client";
import { listDocuments, scanSentForAr, generateDunning, submitDocumentVerdict, markArPaid, addManualAr, importArXlsx } from "@/lib/api-client";
import { fetchAiTransparencySummary, fetchAiTransparencyCalls } from "@/lib/api-client";
import { listAbsences, createAbsence, decideAbsence, acknowledgeAbsence, cancelAbsence, fetchVacationAccount, setVacationAccount } from "@/lib/api-client";
import type { AbsenceType, AbsenceStatus } from "@/lib/api-client";
import {
  fetchMe,
  fetchStats,
  fetchRoi,
  fetchReturnsInsights,
  fetchRecentEmails,
  fetchAuditLog,
  fetchPlaybooks,
  fetchAssistantConfig,
  saveAssistantConfig,
  fetchKnowledge,
  uploadKnowledgeText,
  crawlKnowledgeUrl,
  deleteKnowledgeUpload,
  searchKnowledgeBase,
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
  listSharePointSites,
  listSharePointDrives,
  listSharePointFiles,
  fetchVoiceReps,
  fetchCopilotVertriebler,
  createCopilotVertriebler,
  updateCopilotVertriebler,
  redeployCopilotVertriebler,
  deleteCopilotVertriebler,
  createVoiceRep,
  updateVoiceRep,
  deleteVoiceRep,
  inviteVoiceRep,
  searchNumbers,
  buyNumber,
  fetchLeadLists,
  uploadLeads,
  deleteLeadList,
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
  undoLabelCorrect,
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
  disconnectMailbox,
  fetchJanaKnowledge,
  createJanaKnowledge,
  createJanaBriefing,
  patchJanaKnowledge,
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

// v4.103.0 — Mailbox-Governance: Postfach trennen (Einstellungen-Karte).
// Nach Erfolg /me invalidieren, damit Zähler, Health-Liste und Swap-Status
// überall (Topbar + Einstellungen) sofort die neue Wahrheit zeigen.
export function useDisconnectMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: disconnectMailbox,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useDashboardRoi() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["dashboard-roi"],
    queryFn: fetchRoi,
    enabled: !!session,
    refetchInterval: 60_000,
    retry: false, // /roi ist optional (Fallback auf /stats) → keine Retry-Spam vor Deploy
  });
}

export function useReturnsInsights() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["dashboard-returns-insights"],
    queryFn: fetchReturnsInsights,
    enabled: !!session,
    refetchInterval: 300_000,
    retry: false, // Endpoint optional bis Deploy -> keine Retry-Spam; Karte blendet sich sonst aus
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

// useKnowledgeSearch: lazy — feuert erst nach abgeschickter Suche (enabled).
// retry:false, damit ehrliche Fehler sofort sichtbar sind (Muster useOneDriveFiles).
export function useKnowledgeSearch(enabled: boolean, q: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["knowledge-search", q],
    queryFn: () => searchKnowledgeBase(q),
    enabled: !!session && enabled && q.trim().length > 1,
    staleTime: 30_000,
    retry: false,
  });
}

// ── Jana-Wissen Hooks (UseEasy Brain B3, memory-engine v1.5.0) ─────────

export function useJanaKnowledge() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["jana-knowledge"],
    queryFn: () => fetchJanaKnowledge(),
    enabled: !!session,
    staleTime: 30_000,
    retry: false,
  });
}

export function useCreateJanaKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createJanaKnowledge,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jana-knowledge"] });
    },
  });
}

// B3.1: gefuehrter Briefing-Wizard -> Server-Destillation der Antworten.
export function useCreateJanaBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createJanaBriefing,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jana-knowledge"] });
    },
  });
}

export function usePatchJanaKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchJanaKnowledge,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jana-knowledge"] });
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

// ── SharePoint Site-Browser Hooks (v4.42.0) ──
// Alle lazy + retry:false (reconnect_required-403 sofort sichtbar). Verbinden läuft
// über useConnectOneDrive (provider-agnostisch — SharePoint-Datei wird zur Live-Sync-Quelle).
export function useSharePointSites(enabled: boolean, q?: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["sharepoint-sites", q ?? ""],
    queryFn: () => listSharePointSites(q),
    enabled: !!session && enabled,
    staleTime: 15_000,
    retry: false,
  });
}

export function useSharePointDrives(siteId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["sharepoint-drives", siteId ?? ""],
    queryFn: () => listSharePointDrives(siteId as string),
    enabled: !!session && !!siteId,
    staleTime: 15_000,
    retry: false,
  });
}

export function useSharePointFiles(driveId: string | null, q?: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["sharepoint-files", driveId ?? "", q ?? ""],
    queryFn: () => listSharePointFiles(driveId as string, q),
    enabled: !!session && !!driveId,
    staleTime: 15_000,
    retry: false,
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

// ── Self-Serve (v4.138.0): Invite + Twilio-Nummernkauf ──

export function useVoiceRepInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: inviteVoiceRep,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voice-reps"] }),
  });
}

export function useNumberSearch() {
  // manuelle Suche (kein Auto-Query) — via mutateAsync ausgeloest, Kostenkontrolle
  return useMutation({ mutationFn: searchNumbers });
}

export function useNumberBuy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: buyNumber,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voice-reps"] }),
  });
}

// ── Lead-Upload (Phase 3) ──

export function useLeadLists() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["lead-lists"],
    queryFn: fetchLeadLists,
    enabled: !!session,
    staleTime: 30_000,
  });
}

export function useLeadUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadLeads,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-lists"] }),
  });
}

export function useLeadListDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteLeadList,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-lists"] }),
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

// v4.129.0: Echtes Rueckgaengig einer Label-Korrektur — re-applied das vorherige
// Label ueber den bestehenden Mailbox-Pfad und markiert die Korrektur als
// reverted (fliesst nicht mehr in Regel-Vorschlaege/Few-Shot ein).
export function useUndoLabelCorrect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { event_id: string }) => undoLabelCorrect(input.event_id),
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

import {
  fetchVoiceProfiles, createVoiceProfile, updateVoiceProfile, deleteVoiceProfile,
  voiceProfileTestCall, createVoiceLine, updateVoiceLine, deleteVoiceLine,
} from "@/lib/api-client";
import type { VoiceProfileWriteBody, VoiceLineWriteBody } from "@/lib/api-client";

// ── v4.54.0: Multi-Agent Voice-Profile + Rufnummern (Super-Admin) ──
export function useVoiceProfiles(tenantId: string | null) {
  return useQuery({
    queryKey: ["voice-profiles", tenantId],
    queryFn: () => fetchVoiceProfiles(tenantId as string),
    enabled: !!tenantId,
  });
}
export function useCreateVoiceProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VoiceProfileWriteBody) => createVoiceProfile(body),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["voice-profiles", vars.tenant_id] }),
  });
}
export function useUpdateVoiceProfile(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: VoiceProfileWriteBody }) => updateVoiceProfile(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voice-profiles", tenantId] }),
  });
}
export function useDeleteVoiceProfile(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteVoiceProfile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voice-profiles", tenantId] }),
  });
}
export function useVoiceProfileTestCall() {
  return useMutation({
    mutationFn: (body: { tenant_id: string; profile_id: number; to_number: string }) => voiceProfileTestCall(body),
  });
}
export function useCreateVoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VoiceLineWriteBody) => createVoiceLine(body),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["voice-profiles", vars.tenant_id] }),
  });
}
export function useUpdateVoiceLine(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: VoiceLineWriteBody }) => updateVoiceLine(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voice-profiles", tenantId] }),
  });
}
export function useDeleteVoiceLine(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteVoiceLine(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voice-profiles", tenantId] }),
  });
}

// ── Co-Pilot Vertriebler-Verwaltung (leads-sync Admin-API) ──────────────────

export function useCopilotVertriebler() {
  return useQuery({
    queryKey: ["copilot-vertriebler"],
    queryFn: fetchCopilotVertriebler,
    retry: false,
  });
}

export function useCopilotVertrieblerCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCopilotVertriebler,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copilot-vertriebler"] }),
  });
}

export function useCopilotVertrieblerUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vId, body }: { vId: string; body: { display_name?: string; email?: string | null; status?: string } }) =>
      updateCopilotVertriebler(vId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copilot-vertriebler"] }),
  });
}

export function useCopilotVertrieblerRedeploy() {
  return useMutation({ mutationFn: redeployCopilotVertriebler });
}

export function useCopilotVertrieblerDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCopilotVertriebler,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copilot-vertriebler"] }),
  });
}

// ── v4.61.0 Billing (In-Console-Kauf) ──
export function useBillingSummary() {
  return useQuery({ queryKey: ["billing-summary"], queryFn: fetchBillingSummary });
}
export function useBillingCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lookup_key, quantity }: { lookup_key: string; quantity?: number }) => startBillingCheckout(lookup_key, quantity),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["billing-summary"] }); qc.invalidateQueries({ queryKey: ["me"] }); },
  });
}
export function useBillingPortal() {
  return useMutation({ mutationFn: openBillingPortal });
}

export function useAiTransparencySummary() {
  return useQuery({ queryKey: ["ai-transparency-summary"], queryFn: fetchAiTransparencySummary });
}
export function useAiTransparencyCalls(params?: { limit?: number; purpose?: string; since_days?: number }) {
  return useQuery({
    queryKey: ["ai-transparency-calls", params ?? {}],
    queryFn: () => fetchAiTransparencyCalls(params),
  });
}

export function useDocuments(docType: "ar_invoice" | "dunning" = "ar_invoice", status?: string) {
  return useQuery({
    queryKey: ["documents", docType, status ?? ""],
    queryFn: () => listDocuments(docType, status),
  });
}

export function useScanSentForAr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sinceHours?: number) => scanSentForAr(sinceHours),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useGenerateDunning() {
  return useMutation({
    mutationFn: (v: { arInvoiceId: number; mahnstufe?: number; use_llm?: boolean }) =>
      generateDunning(v.arInvoiceId, { mahnstufe: v.mahnstufe, use_llm: v.use_llm }),
  });
}

export function useDocumentVerdict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { documentId: number; action: "approve" | "reject"; subject?: string; body?: string }) =>
      submitDocumentVerdict(v.documentId, v.action, { subject: v.subject, body: v.body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useMarkArPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { arInvoiceId: number; undo?: boolean }) => markArPaid(v.arInvoiceId, v.undo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useAddManualAr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addManualAr,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useImportArXlsx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: importArXlsx,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

import {
  listRequests, getOffer, generateOffer, updateOffer, submitOfferVerdict,
  fetchAutoOfferSettings, setAutoOfferEnabled,
  type GenerateOfferBody, type UpdateOfferBody,
} from "@/lib/api-client";

export function useRequests(limit = 40) {
  return useQuery({
    queryKey: ["documents-requests", limit],
    queryFn: () => listRequests(limit),
  });
}
export function useOffer(id: number | null) {
  return useQuery({
    queryKey: ["documents-offer", id],
    queryFn: () => getOffer(id as number),
    enabled: id != null,
  });
}
export function useGenerateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GenerateOfferBody) => generateOffer(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents-requests"] }); },
  });
}
export function useUpdateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateOfferBody) => updateOffer(body),
    onSuccess: (_res, vars) => { qc.invalidateQueries({ queryKey: ["documents-offer", vars.document_id] }); },
  });
}
export function useOfferVerdict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { documentId: number; action: "approve" | "reject"; send_cover_letter?: boolean }) =>
      submitOfferVerdict(v.documentId, v.action, { send_cover_letter: v.send_cover_letter }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents-requests"] });
      qc.invalidateQueries({ queryKey: ["documents-offer"] });
      qc.invalidateQueries({ queryKey: ["documents-invoices"] }); // v4.130.0 — Auto-Invoice nach Approve sofort sichtbar
    },
  });
}

// ── v4.130.0: Auto-Angebot aus E-Mail — Einstellungen ──
export function useAutoOfferSettings() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["auto-offer-settings"],
    queryFn: fetchAutoOfferSettings,
    enabled: !!session,
    staleTime: 30_000,
  });
}
export function useSetAutoOfferEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setAutoOfferEnabled(enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auto-offer-settings"] });
    },
  });
}

// ============================================================================
// >>> In src/hooks/use-api.ts ANHAENGEN (am Ende) <<<
// Phase 2a - Rechnungs-Hooks (react-query, Muster wie useOffer/useUpdateOffer).
// ============================================================================
import {
  listInvoices, listApprovedOffers, getInvoice, generateInvoice, updateInvoice, finalizeInvoice, voidInvoice,
  getBillingProfile, updateBillingProfile,
  type UpdateInvoiceBody, type BillingProfile,
} from "@/lib/api-client";

export function useInvoices(limit = 50) {
  return useQuery({
    queryKey: ["documents-invoices", limit],
    queryFn: () => listInvoices(limit),
  });
}
export function useApprovedOffers(limit = 40) {
  return useQuery({
    queryKey: ["documents-approved-offers", limit],
    queryFn: () => listApprovedOffers(limit),
  });
}
export function useInvoice(id: number | null) {
  return useQuery({
    queryKey: ["documents-invoice", id],
    queryFn: () => getInvoice(id as number),
    enabled: id != null,
  });
}
export function useGenerateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { offer_id?: number; counterpart_name?: string; subject?: string; reverse_charge?: boolean; kleinunternehmer?: boolean }) => generateInvoice(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents-invoices"] });
      qc.invalidateQueries({ queryKey: ["documents-approved-offers"] });
    },
  });
}
export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateInvoiceBody) => updateInvoice(body),
    onSuccess: (_res, vars) => { qc.invalidateQueries({ queryKey: ["documents-invoice", vars.document_id] }); },
  });
}
export function useFinalizeInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: number) => finalizeInvoice(documentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents-invoices"] });
      qc.invalidateQueries({ queryKey: ["documents-invoice"] });
      qc.invalidateQueries({ queryKey: ["documents-approved-offers"] });
    },
  });
}
export function useVoidInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: number) => voidInvoice(documentId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents-invoices"] }); },
  });
}
export function useBillingProfile() {
  return useQuery({
    queryKey: ["documents-billing-profile"],
    queryFn: () => getBillingProfile(),
  });
}
export function useUpdateBillingProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<BillingProfile>) => updateBillingProfile(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents-billing-profile"] }); },
  });
}

// ============================================================================
// v4.132.0 — Zeiterfassung
// ============================================================================
import {
  listTimeEntries, createTimeEntry, updateTimeEntry, deleteTimeEntry, unbillTimeEntry,
  fetchTimeSummary, applyTimeToDocument, listTeamMembers, upsertTeamMember, deleteTeamMember,
  updateTimeSettings, listTimeProjects, createTimeProject, updateTimeProject, deleteTimeProject,
} from "@/lib/api-client";
import type { TimeEntryInput } from "@/lib/api-client";

export function useTimeEntries(params: { from?: string; to?: string; customer?: string; member?: string; status?: "open" | "billed" } = {}, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["time-entries", params],
    queryFn: () => listTimeEntries(params),
    enabled: !!session && enabled,
  });
}
export function useCreateTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TimeEntryInput) => createTimeEntry(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["time-entries"] }); qc.invalidateQueries({ queryKey: ["time-summary"] }); },
  });
}
export function useUpdateTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<TimeEntryInput> & { id: number; hourly_rate_cents?: number | null }) => updateTimeEntry(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["time-entries"] }); qc.invalidateQueries({ queryKey: ["time-summary"] }); },
  });
}
export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTimeEntry(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["time-entries"] }); qc.invalidateQueries({ queryKey: ["time-summary"] }); },
  });
}
export function useUnbillTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => unbillTimeEntry(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["time-entries"] }); qc.invalidateQueries({ queryKey: ["time-summary"] }); },
  });
}
export function useTimeSummary(params: { customer?: string; from?: string; to?: string; status?: "open" | "billed" } = {}, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["time-summary", params],
    queryFn: () => fetchTimeSummary(params),
    enabled: !!session && enabled,
  });
}
export function useApplyTimeToDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: applyTimeToDocument,
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["time-entries"] });
      qc.invalidateQueries({ queryKey: ["time-summary"] });
      qc.invalidateQueries({ queryKey: ["documents-invoice", vars.document_id] });
      qc.invalidateQueries({ queryKey: ["documents-offer", vars.document_id] });
      qc.invalidateQueries({ queryKey: ["documents-invoices"] });
    },
  });
}
export function useTeamMembers(enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["team-members"],
    queryFn: listTeamMembers,
    enabled: !!session && enabled,
    retry: false, // vor Backend-Deploy/Migration liefert die Route 403/404 → kein Retry-Spam
  });
}
export function useUpsertTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertTeamMember,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team-members"] }); },
  });
}
export function useDeleteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTeamMember,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team-members"] }); },
  });
}
export function useUpdateTimeSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateTimeSettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team-members"] }); },
  });
}

// ── v4.137.0 — Projekte (One-Click statt Freitext) ───────────────────────────
export function useTimeProjects(params: { active?: boolean } = {}, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["time-projects", params],
    queryFn: () => listTimeProjects(params),
    enabled: !!session && enabled,
    retry: false, // vor Migration liefert die Route eine leere Liste (degradiert) -> kein Retry-Spam
  });
}
export function useCreateTimeProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTimeProject,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["time-projects"] }); },
  });
}
export function useUpdateTimeProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateTimeProject,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["time-projects"] }); qc.invalidateQueries({ queryKey: ["time-entries"] }); },
  });
}
export function useDeleteTimeProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTimeProject,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["time-projects"] }); },
  });
}

// ── v4.140.0 — Urlaub + Krankmeldung (Abwesenheit) ───────────────────────────
export function useAbsences(params: { type?: AbsenceType; year?: number; status?: AbsenceStatus; member?: string } = {}, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["absences", params],
    queryFn: () => listAbsences(params),
    enabled: !!session && enabled,
    retry: false, // vor Migration liefert die Route eine leere Liste (degradiert) -> kein Retry-Spam
  });
}
export function useVacationAccount(params: { year?: number; member?: string } = {}, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["vacation-account", params],
    queryFn: () => fetchVacationAccount(params),
    enabled: !!session && enabled,
    retry: false,
  });
}
export function useCreateAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAbsence,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["absences"] }); qc.invalidateQueries({ queryKey: ["vacation-account"] }); },
  });
}
export function useDecideAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: decideAbsence,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["absences"] }); qc.invalidateQueries({ queryKey: ["vacation-account"] }); },
  });
}
export function useAcknowledgeAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => acknowledgeAbsence(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["absences"] }); },
  });
}
export function useCancelAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => cancelAbsence(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["absences"] }); qc.invalidateQueries({ queryKey: ["vacation-account"] }); },
  });
}
export function useSetVacationAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setVacationAccount,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vacation-account"] }); },
  });
}

// ============================================================================
// v4.134.0 — Mahn-Zyklus (on-demand Lauf + Per-Tenant-Settings + Bestaetigen-Geste)
// ============================================================================
import {
  fetchDunningSettings, setDunningSettings, confirmArInvoice, runDunning,
} from "@/lib/api-client";

export function useDunningSettings() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["dunning-settings"],
    queryFn: fetchDunningSettings,
    enabled: !!session,
    staleTime: 30_000,
    retry: false, // vor Migration liefert die Action migration_missing -> kein Retry-Spam
  });
}
export function useSetDunningSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { enabled?: boolean; grace_days?: number; cooldown_days?: number; use_llm_tone?: boolean }) => setDunningSettings(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dunning-settings"] }),
  });
}
export function useConfirmArInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (arInvoiceId: number) => confirmArInvoice(arInvoiceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}
export function useRunDunning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dryRun: boolean) => runDunning(dryRun),
    onSuccess: (_res, dryRun) => { if (!dryRun) qc.invalidateQueries({ queryKey: ["documents"] }); },
  });
}

// ---- v4.142.0 Verbindlichkeiten (AP) + Cash-Index (Lane 2) ----
import {
  listAp, getAp, createAp, confirmAp, markApPaid, setApStatus,
  fetchCashIndex, fetchApSettings, setApSettings, uploadApPdf,
} from "@/lib/api-client";

export function useApInvoices(status?: string) {
  return useQuery({ queryKey: ["ap", status ?? ""], queryFn: () => listAp(status) });
}
export function useApDetail(apId: number | null) {
  return useQuery({ queryKey: ["ap-detail", apId], queryFn: () => getAp(apId as number), enabled: apId != null });
}
export function useCreateAp() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createAp, onSuccess: () => qc.invalidateQueries({ queryKey: ["ap"] }) });
}
export function useConfirmAp() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (apId: number) => confirmAp(apId), onSuccess: () => qc.invalidateQueries({ queryKey: ["ap"] }) });
}
export function useMarkApPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { apId: number; paid?: boolean }) => markApPaid(v.apId, v.paid ?? true),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ap"] }); qc.invalidateQueries({ queryKey: ["cashindex"] }); },
  });
}
export function useSetApStatus() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { apId: number; status: string }) => setApStatus(v.apId, v.status), onSuccess: () => qc.invalidateQueries({ queryKey: ["ap"] }) });
}
export function useUploadApPdf() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { apId: number; file: File }) => uploadApPdf(v.apId, v.file), onSuccess: () => qc.invalidateQueries({ queryKey: ["ap"] }) });
}
export function useCashIndex(horizon?: number) {
  return useQuery({ queryKey: ["cashindex", horizon ?? 0], queryFn: () => fetchCashIndex(horizon) });
}
export function useApSettings() {
  return useQuery({ queryKey: ["ap-settings"], queryFn: () => fetchApSettings() });
}
export function useSetApSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setApSettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ap-settings"] }); qc.invalidateQueries({ queryKey: ["ap"] }); },
  });
}
