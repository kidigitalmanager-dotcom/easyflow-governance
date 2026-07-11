import { createContext, useCallback, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOnboardingProgress, useSetOnboardingProgress } from "@/hooks/use-onboarding";
import { addToSet } from "@/lib/onboarding";
import { getDemo } from "@/data/onboarding-content";
import { GuidedTour } from "./GuidedTour";

// Globaler Onboarding-Runner: EIN GuidedTour-Overlay, das über Routenwechsel hinweg
// lebt (in AppLayout gemountet). Jeder Konsument (Onboarding-Katalog, Signale-Header,
// Erst-Login-Coach) startet einen Durchlauf per startDemo(slug). Die V6-Signale-Tour
// ist einfach die Demo "signale-verstehen" -> Erst-Login-Verhalten bleibt identisch.

const SIGNALE_DEMO = "signale-verstehen";

type RunnerCtx = {
  activeSlug: string | null;
  startDemo: (slug: string) => void;
  stopDemo: () => void;
};

// No-op-Default: nie ein White-Screen, falls ein Konsument doch ohne Provider rendert.
const Ctx = createContext<RunnerCtx>({ activeSlug: null, startDemo: () => {}, stopDemo: () => {} });

export function useOnboardingRunner(): RunnerCtx {
  return useContext(Ctx);
}

export function OnboardingRunnerProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const prog = useOnboardingProgress();
  const setter = useSetOnboardingProgress();
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const startDemo = useCallback((slug: string) => {
    if (getDemo(slug)) setActiveSlug(slug);
  }, []);
  const stopDemo = useCallback(() => setActiveSlug(null), []);

  // Demo abgeschlossen/übersprungen -> Fortschritt persistieren.
  // "signale-verstehen" spiegelt zusätzlich die V6-Tour-Flags (tour_completed / tour_skipped),
  // damit der Meilenstein "Signal erklärt" + die Willkommens-Logik unverändert funktionieren.
  const handleFinish = useCallback((slug: string, mode: "completed" | "skipped") => {
    const patch: Record<string, unknown> = {};
    if (mode === "completed") {
      patch.demos_done = addToSet(prog.data?.demos_done, slug);
      const demo = getDemo(slug);
      if (slug === SIGNALE_DEMO) { patch.tour_completed = true; patch.tour_step = demo?.steps.length ?? 0; }
    } else if (slug === SIGNALE_DEMO) {
      patch.tour_skipped = true;
    }
    if (Object.keys(patch).length) setter.mutate(patch);
  }, [prog.data?.demos_done, setter]);

  // "Frag Jana dazu": öffnet den echten jana-chat auf /signale mit vorbefülltem Prompt.
  const handleAskJana = useCallback((_slug: string, starter?: string) => {
    setter.mutate({ asked_jana: true });
    const ask = starter ? `&ask=${encodeURIComponent(starter)}` : "";
    navigate(`/signale?sec=jana${ask}`);
  }, [navigate, setter]);

  const demo = activeSlug ? getDemo(activeSlug) ?? null : null;

  return (
    <Ctx.Provider value={{ activeSlug, startDemo, stopDemo }}>
      {children}
      <GuidedTour demo={demo} onClose={stopDemo} onFinish={handleFinish} onAskJana={handleAskJana} />
    </Ctx.Provider>
  );
}
