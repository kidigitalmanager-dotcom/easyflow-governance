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

// -- Knowledge Base Hooks ----------------------------------

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
