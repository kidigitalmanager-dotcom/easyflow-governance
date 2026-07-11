import { describe, it, expect } from "vitest";
import {
  computeMilestones, onboardingCounts, nextMilestone, showCoach, firstValueReady,
  overlaySeen, kpiExplained, addToSet, demoDone, demosDoneCount,
  type OnboardingFacts, type OnboardingProgress,
} from "./onboarding";

const FACTS_NONE: OnboardingFacts = {
  mailboxConnected: false, firstClassification: false, hasBeenExplained: false,
  draftApproved: false, consentSet: false, weeklySeen: false, hasFirstValueSignal: false,
};
const FACTS_ALL: OnboardingFacts = {
  mailboxConnected: true, firstClassification: true, hasBeenExplained: true,
  draftApproved: true, consentSet: true, weeklySeen: true, hasFirstValueSignal: true,
};

describe("computeMilestones", () => {
  it("keeps the fixed order and maps booleans", () => {
    const ms = computeMilestones(FACTS_NONE);
    expect(ms.map((m) => m.id)).toEqual([
      "mailbox", "first_classification", "signal_explained", "draft_approved", "consent", "weekly",
    ]);
    expect(ms.every((m) => !m.done)).toBe(true);
    expect(ms.map((m) => m.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("marks all done when facts are all true", () => {
    expect(computeMilestones(FACTS_ALL).every((m) => m.done)).toBe(true);
  });
});

describe("onboardingCounts", () => {
  it("counts done/total and completeness + pct", () => {
    expect(onboardingCounts(computeMilestones(FACTS_NONE))).toEqual({ done: 0, total: 6, complete: false, pct: 0 });
    expect(onboardingCounts(computeMilestones(FACTS_ALL))).toEqual({ done: 6, total: 6, complete: true, pct: 100 });
    const half = computeMilestones({ ...FACTS_NONE, mailboxConnected: true, firstClassification: true, hasBeenExplained: true });
    expect(onboardingCounts(half)).toEqual({ done: 3, total: 6, complete: false, pct: 50 });
  });
});

describe("nextMilestone", () => {
  it("returns the first not-done milestone, or null when complete", () => {
    expect(nextMilestone(computeMilestones(FACTS_NONE))?.id).toBe("mailbox");
    expect(nextMilestone(computeMilestones({ ...FACTS_NONE, mailboxConnected: true }))?.id).toBe("first_classification");
    expect(nextMilestone(computeMilestones(FACTS_ALL))).toBeNull();
  });
});

describe("showCoach", () => {
  const incomplete = onboardingCounts(computeMilestones(FACTS_NONE));
  const complete = onboardingCounts(computeMilestones(FACTS_ALL));
  it("hides when dismissed", () => { expect(showCoach({ checklist_dismissed: true }, incomplete)).toBe(false); });
  it("hides when complete", () => { expect(showCoach({}, complete)).toBe(false); });
  it("shows while incomplete and not dismissed", () => { expect(showCoach({}, incomplete)).toBe(true); });
});

describe("firstValueReady", () => {
  it("does not fire once already seen", () => {
    expect(firstValueReady(FACTS_ALL, { first_value_seen: true })).toEqual({ ready: false, kind: null });
  });
  it("prefers an approved draft over a signal", () => {
    expect(firstValueReady({ ...FACTS_NONE, draftApproved: true, hasFirstValueSignal: true }, {})).toEqual({ ready: true, kind: "draft" });
  });
  it("falls back to a first explained signal", () => {
    expect(firstValueReady({ ...FACTS_NONE, hasFirstValueSignal: true }, {})).toEqual({ ready: true, kind: "signal" });
  });
  it("is not ready with nothing to show", () => {
    expect(firstValueReady(FACTS_NONE, {})).toEqual({ ready: false, kind: null });
  });
});

describe("set helpers", () => {
  const p: OnboardingProgress = { seen_overlays: ["a"], explained_kpis: ["health"] };
  it("reads overlay/kpi flags", () => {
    expect(overlaySeen(p, "a")).toBe(true);
    expect(overlaySeen(p, "b")).toBe(false);
    expect(kpiExplained(p, "health")).toBe(true);
    expect(kpiExplained({}, "health")).toBe(false);
  });
  it("addToSet unions without duplicates", () => {
    expect(addToSet(["a"], "b").sort()).toEqual(["a", "b"]);
    expect(addToSet(["a"], "a")).toEqual(["a"]);
    expect(addToSet(undefined, "x")).toEqual(["x"]);
  });
});

describe("demo catalog progress", () => {
  it("demoDone reads the demos_done flag", () => {
    const p: OnboardingProgress = { demos_done: ["signale-verstehen", "review-freigeben"] };
    expect(demoDone(p, "signale-verstehen")).toBe(true);
    expect(demoDone(p, "excel-livesync")).toBe(false);
    expect(demoDone({}, "signale-verstehen")).toBe(false);
  });
  it("demosDoneCount counts only listed slugs that are done", () => {
    const p: OnboardingProgress = { demos_done: ["a", "b", "x"] };
    expect(demosDoneCount(p, ["a", "b", "c"])).toBe(2);
    expect(demosDoneCount({}, ["a", "b"])).toBe(0);
    expect(demosDoneCount(p, [])).toBe(0);
  });
});
