// Pure logic for the V6 Jana-Onboarding-Coach. No React, no network, no lucide -
// so it stays unit-testable (mirrors the alert-quality.ts / report-model.ts pattern).
//
// The coach mixes two kinds of milestones:
//   - DERIVED from live server state (mailbox connected, first classification, draft
//     approved, consent set) -> read from /me + my-signals + stats, never faked.
//   - UI FLAGS persisted per user (tour seen, weekly seen, first-value celebrated)
//     -> live in jana_onboarding_progress via the onboarding-progress edge function.

export type OnboardingProgress = {
  tour_completed?: boolean;
  tour_skipped?: boolean;
  tour_step?: number;
  welcome_dismissed?: boolean;
  checklist_dismissed?: boolean;
  first_value_seen?: boolean;
  first_value_kind?: string;
  asked_jana?: boolean;
  seen_weekly?: boolean;
  badges_intro_dismissed?: boolean;
  explained_kpis?: string[];
  seen_overlays?: string[];
  nudges_dismissed?: string[];
  // Onboarding-Bereich: welche kuratierten Demo-Durchläufe der Nutzer schon abgeschlossen
  // hat (Slugs). EIN Array-Flag deckt alle Demos ab (statt einem Bool pro Demo) und passt
  // in die ARR-Whitelist der onboarding-progress Edge-Fn.
  demos_done?: string[];
};

export type MilestoneId =
  | "mailbox"
  | "first_classification"
  | "signal_explained"
  | "draft_approved"
  | "consent"
  | "weekly";

// The raw facts the coach needs, already reduced to booleans by the hook.
export type OnboardingFacts = {
  mailboxConnected: boolean;    // /me setup.checks.mailbox_connected || gmail/outlook enabled
  firstClassification: boolean; // stats show processed mail OR own account already has health points
  hasBeenExplained: boolean;    // tour completed OR a KPI was explained OR Jana was asked
  draftApproved: boolean;       // a draft has been resolved/approved this week
  consentSet: boolean;          // account.consent_data_sharing
  weeklySeen: boolean;          // the tenant has looked at the weekly priorities
  hasFirstValueSignal: boolean; // there is at least one belegtes Frueh-Signal / weekly priority
};

export type Milestone = {
  id: MilestoneId;
  done: boolean;
  order: number;
};

// Ordered milestone list with done-state. Order = the natural activation path.
export function computeMilestones(f: OnboardingFacts): Milestone[] {
  const rows: Array<{ id: MilestoneId; done: boolean }> = [
    { id: "mailbox", done: !!f.mailboxConnected },
    { id: "first_classification", done: !!f.firstClassification },
    { id: "signal_explained", done: !!f.hasBeenExplained },
    { id: "draft_approved", done: !!f.draftApproved },
    { id: "consent", done: !!f.consentSet },
    { id: "weekly", done: !!f.weeklySeen },
  ];
  return rows.map((r, i) => ({ ...r, order: i }));
}

export type OnboardingCounts = { done: number; total: number; complete: boolean; pct: number };

export function onboardingCounts(ms: Milestone[]): OnboardingCounts {
  const total = ms.length;
  const done = ms.filter((m) => m.done).length;
  return { done, total, complete: total > 0 && done === total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// First not-yet-done milestone = "dein naechster Schritt" (or null when complete).
export function nextMilestone(ms: Milestone[]): Milestone | null {
  return ms.find((m) => !m.done) ?? null;
}

// Should the welcome + checklist coach surface be shown at all?
// Show while onboarding is incomplete and the user has not dismissed it.
export function showCoach(progress: OnboardingProgress, counts: OnboardingCounts): boolean {
  if (progress.checklist_dismissed) return false;
  return !counts.complete;
}

// First-Value moment: celebrate the first REAL proof of value, once.
// Priority: an approved draft ("UseEasy hat dir Arbeit abgenommen") beats a first
// explained early-warning signal. Only fires when not already seen.
export type FirstValue = { ready: boolean; kind: "draft" | "signal" | null };
export function firstValueReady(f: OnboardingFacts, progress: OnboardingProgress): FirstValue {
  if (progress.first_value_seen) return { ready: false, kind: null };
  if (f.draftApproved) return { ready: true, kind: "draft" };
  if (f.hasFirstValueSignal) return { ready: true, kind: "signal" };
  return { ready: false, kind: null };
}

// Has this one-time overlay/hint already been shown?
export function overlaySeen(progress: OnboardingProgress, key: string): boolean {
  return (progress.seen_overlays ?? []).includes(key);
}
export function kpiExplained(progress: OnboardingProgress, key: string): boolean {
  return (progress.explained_kpis ?? []).includes(key);
}

// Merge helper for array flags (client-side union before persisting the full array).
export function addToSet(existing: string[] | undefined, value: string): string[] {
  const set = new Set(existing ?? []);
  set.add(value);
  return Array.from(set);
}

// ── Onboarding-Demo-Katalog: Fortschritt (wiederholbare Durchläufe) ──────────────
// "done" ist rein informativ (Haken auf der Karte) - ein Durchlauf lässt sich immer
// erneut starten, "done" wird nie zurückgesetzt.
export function demoDone(progress: OnboardingProgress, slug: string): boolean {
  return (progress.demos_done ?? []).includes(slug);
}

// Wie viele der übergebenen Demo-Slugs sind abgeschlossen? (Katalog-Fortschrittsbalken)
export function demosDoneCount(progress: OnboardingProgress, slugs: string[]): number {
  const done = new Set(progress.demos_done ?? []);
  return slugs.reduce((n, s) => (done.has(s) ? n + 1 : n), 0);
}
