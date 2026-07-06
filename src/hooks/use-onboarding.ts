import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as authClient } from "@/integrations/supabase/client";
import { useMe, useDashboardStats } from "@/hooks/use-api";
import { useMySignals, useWeeklyPriorities } from "@/hooks/use-capital";
import {
  computeMilestones, onboardingCounts, showCoach, firstValueReady, nextMilestone,
  type OnboardingProgress, type OnboardingFacts, type Milestone, type OnboardingCounts, type FirstValue,
} from "@/lib/onboarding";

// Progress store: mirrors useMySignals/callConsent auth. Console session (auth project)
// via x-console-token; the onboarding-progress edge function keys the row by email and
// reads/writes via service_role. The capital table is deny-by-default for anon.
const CAPITAL_ANON = "sb_publishable_FXGJwwQt69sfmWS3cuF37g_hYALbbe2";
const ONBOARDING_URL = "https://vunhcexnwbvxrwecymiy.functions.supabase.co/onboarding-progress";

async function callOnboarding(body: Record<string, unknown>): Promise<{ ok: boolean; progress: OnboardingProgress }> {
  const empty = { ok: true, progress: {} as OnboardingProgress };
  const { data: { session } } = await authClient.auth.getSession();
  const token = session?.access_token ?? "";
  if (!token) return empty;
  const res = await fetch(ONBOARDING_URL, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: CAPITAL_ANON, "x-console-token": token },
    body: JSON.stringify(body),
  });
  if (res.status === 401) return empty; // no resolvable session -> treat as empty (coach still derives milestones)
  const j = await res.json().catch(() => ({} as any));
  if (!res.ok || j.ok === false) throw new Error(j.error || ("onboarding_failed_" + res.status));
  return { ok: true, progress: (j.progress ?? {}) as OnboardingProgress };
}

const PROGRESS_KEY = ["onboarding", "progress"] as const;

export function useOnboardingProgress() {
  return useQuery<OnboardingProgress>({
    queryKey: PROGRESS_KEY,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => (await callOnboarding({ action: "get" })).progress,
  });
}

// Persist a partial patch (whitelisted server-side). Optimistic so the UI feels instant.
export function useSetOnboardingProgress() {
  const qc = useQueryClient();
  return useMutation<OnboardingProgress, Error, Partial<OnboardingProgress>, { prev?: OnboardingProgress }>({
    mutationFn: async (patch) => (await callOnboarding({ action: "set", patch })).progress,
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: PROGRESS_KEY });
      const prev = qc.getQueryData<OnboardingProgress>(PROGRESS_KEY);
      qc.setQueryData<OnboardingProgress>(PROGRESS_KEY, { ...(prev ?? {}), ...patch });
      return { prev };
    },
    onSuccess: (server) => { qc.setQueryData<OnboardingProgress>(PROGRESS_KEY, server); },
    onError: (_e, _patch, ctx) => { if (ctx?.prev) qc.setQueryData(PROGRESS_KEY, ctx.prev); },
  });
}

export type OnboardingState = {
  loading: boolean;
  progress: OnboardingProgress;
  facts: OnboardingFacts;
  milestones: Milestone[];
  counts: OnboardingCounts;
  next: Milestone | null;
  showCoach: boolean;
  firstValue: FirstValue;
  hasOwnAccount: boolean;
  setFlag: (patch: Partial<OnboardingProgress>) => void;
};

// The brain: reduce live server state + persisted UI flags into the coach's view model.
// Every derived milestone reads from real data (no fabrication); missing data -> not done.
export function useOnboardingState(): OnboardingState {
  const me = useMe();
  const stats = useDashboardStats();
  const mine = useMySignals();
  const weekly = useWeeklyPriorities();
  const prog = useOnboardingProgress();
  const setter = useSetOnboardingProgress();

  const progress: OnboardingProgress = prog.data ?? {};

  const facts: OnboardingFacts = useMemo(() => {
    const setup = me.data?.setup;
    const tenant = me.data?.tenant;
    const mailboxConnected =
      setup?.checks?.mailbox_connected === true || !!tenant?.gmail_enabled || !!tenant?.outlook_enabled;

    const s = stats.data;
    const hasOwn = !!mine.data?.has_own_account;
    const dash = mine.data?.dash;
    const healthPoints = dash?.health?.length ?? 0;
    const firstClassification =
      (Number(s?.emails_week ?? 0) > 0) || (Number(s?.emails_today ?? 0) > 0) || (hasOwn && healthPoints > 0);
    const draftApproved = Number(s?.resolved_week ?? 0) > 0;

    const consentSet = hasOwn && !!mine.data?.account?.consent_data_sharing;

    const weeklyItems = weekly.data?.priorities?.length ?? 0;
    const dashAlerts = dash?.alerts?.length ?? 0;
    const hasFirstValueSignal = weeklyItems > 0 || dashAlerts > 0;

    const hasBeenExplained =
      !!progress.tour_completed || (progress.explained_kpis?.length ?? 0) > 0 || !!progress.asked_jana;

    return {
      mailboxConnected,
      firstClassification,
      hasBeenExplained,
      draftApproved,
      consentSet,
      weeklySeen: !!progress.seen_weekly,
      hasFirstValueSignal,
    };
  }, [me.data, stats.data, mine.data, weekly.data, progress]);

  const milestones = useMemo(() => computeMilestones(facts), [facts]);
  const counts = useMemo(() => onboardingCounts(milestones), [milestones]);
  const next = useMemo(() => nextMilestone(milestones), [milestones]);
  const firstValue = useMemo(() => firstValueReady(facts, progress), [facts, progress]);

  // We only gate on the fast/critical queries; stats/weekly may still be loading and
  // simply resolve milestones to "not done yet" (honest) until they arrive.
  const loading = me.isLoading || mine.isLoading || prog.isLoading;

  return {
    loading,
    progress,
    facts,
    milestones,
    counts,
    next,
    showCoach: showCoach(progress, counts),
    firstValue,
    hasOwnAccount: !!mine.data?.has_own_account,
    setFlag: (patch) => setter.mutate(patch),
  };
}
