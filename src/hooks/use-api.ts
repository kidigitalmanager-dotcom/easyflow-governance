import { useQuery } from "@tanstack/react-query";
import { fetchMe, fetchStats, fetchRecentEmails, fetchAuditLog } from "@/lib/api-client";
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
