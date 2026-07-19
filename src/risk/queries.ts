import { useQuery } from "@tanstack/react-query";
import { fetchChanges, fetchEntities, fetchGovernance, fetchMatchResult, fetchScore } from "./api";

const STALE = 60_000;

export function useRiskScore(accountId: string | undefined) {
  return useQuery({
    queryKey: ["risk", "score", accountId],
    queryFn: () => fetchScore(accountId!),
    enabled: !!accountId,
    staleTime: STALE,
  });
}
export function useRiskEntities(opts: { limit?: number; offset?: number } = {}) {
  return useQuery({
    queryKey: ["risk", "entities", opts.limit ?? null, opts.offset ?? null],
    queryFn: () => fetchEntities(opts),
    staleTime: STALE,
  });
}
export function useRiskChanges() {
  return useQuery({ queryKey: ["risk", "changes"], queryFn: fetchChanges, staleTime: STALE });
}
export function useRiskGovernance() {
  return useQuery({ queryKey: ["risk", "governance"], queryFn: fetchGovernance, staleTime: STALE });
}
export function useRiskMatchResult() {
  return useQuery({ queryKey: ["risk", "match"], queryFn: fetchMatchResult, staleTime: STALE });
}
