import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles, ArrowLeft, ArrowRight, X, MessageCircle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Demo } from "@/data/onboarding-content";

type Box = { top: number; left: number; width: number; height: number };

// Szenario-Runner: spielt einen kuratierten Demo-Durchlauf ab. Jeder Step kann eine
// Zielroute ansteuern (useNavigate) und einen data-tour-Anker spotlighten; fehlt der
// Anker, wird der Step sauber übersprungen statt zu hängen. Statische Jana-Copy pro
// Step; "Frag Jana dazu" öffnet den echten jana-chat mit vorbefülltem Prompt.
// Global gemountet (überlebt Routenwechsel), Persistenz läuft über die Callbacks.
const LOCATE_ATTEMPTS = 14;   // Wiederholversuche, den Anker zu finden ...
const LOCATE_INTERVAL = 180;  // ... alle 180ms (~2,5s Fenster für Routenwechsel + Mount)

export function GuidedTour({
  demo, onClose, onFinish, onAskJana,
}: {
  demo: Demo | null;
  onClose: () => void;
  onFinish?: (slug: string, mode: "completed" | "skipped") => void;
  onAskJana?: (slug: string, starter?: string) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const closedRef = useRef(false);

  const open = !!demo;
  const steps = demo?.steps ?? [];
  const total = steps.length;
  const current = total > 0 ? steps[Math.min(step, total - 1)] : null;

  // Frischer Start bei jedem Öffnen (neuer Demo-Slug -> von vorn).
  useEffect(() => {
    if (open) { setStep(0); setBox(null); closedRef.current = false; }
  }, [open, demo?.slug]);

  // Spotlight-Box aus dem Ziel-Element berechnen.
  const locate = useCallback(() => {
    if (!current?.target) { setBox(null); return; }
    const el = document.querySelector(`[data-tour="${current.target}"]`) as HTMLElement | null;
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { setBox(null); return; }
    const pad = 8;
    setBox({
      top: Math.max(6, r.top - pad),
      left: Math.max(6, r.left - pad),
      width: Math.min(window.innerWidth - 12, r.width + pad * 2),
      height: r.height + pad * 2,
    });
  }, [current]);

  const next = useCallback(() => {
    setStep((s) => Math.min(total - 1, s + 1));
  }, [total]);

  // Route ansteuern, Ziel finden (mit Wiederholung), sonst Step überspringen.
  useEffect(() => {
    if (!open || !current) return;
    let cancelled = false;
    const timers: number[] = [];
    const clearAll = () => timers.forEach((t) => window.clearTimeout(t));

    // 1) Zielroute ansteuern (wenn abweichend). Spotlight vorher leeren -> kein Flash.
    if (current.route) {
      const here = location.pathname + location.search;
      if (here !== current.route) {
        setBox(null);
        navigate(current.route);
      }
    }

    // 2) Anker finden. Narrative Steps (kein target) = Vollflächen-Dimmung, kein Skip.
    if (!current.target) { setBox(null); return; }

    let attempts = 0;
    const tryLocate = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${current.target}"]`) as HTMLElement | null;
      const r = el?.getBoundingClientRect();
      if (el && r && (r.width > 0 || r.height > 0)) {
        try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* noop */ }
        timers.push(window.setTimeout(locate, 60));
        timers.push(window.setTimeout(locate, 340));
        timers.push(window.setTimeout(locate, 680));
        return;
      }
      attempts += 1;
      if (attempts < LOCATE_ATTEMPTS) {
        timers.push(window.setTimeout(tryLocate, LOCATE_INTERVAL));
      } else if (step < total - 1) {
        // Ziel taucht nicht auf (Seite/Tab liefert den Anker nicht) -> Step überspringen.
        setBox(null);
        next();
      } else {
        // Letzter Step ohne Anker: einfach ohne Spotlight zeigen (Karte bleibt bedienbar).
        setBox(null);
      }
    };
    timers.push(window.setTimeout(tryLocate, 90));
    return () => { cancelled = true; clearAll(); };
  }, [open, step, current, navigate, location.pathname, location.search, locate, next, total]);

  // Reposition bei Scroll (capture: Scroll passiert im <main>) + Resize.
  useEffect(() => {
    if (!open) return;
    const h = () => locate();
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); };
  }, [open, locate]);

  const finish = useCallback((mode: "completed" | "skipped") => {
    if (closedRef.current || !demo) return;
    closedRef.current = true;
    onFinish?.(demo.slug, mode);
    onClose();
  }, [demo, onFinish, onClose]);

  const goNext = () => { if (step >= total - 1) finish("completed"); else next(); };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const askJana = () => {
    if (closedRef.current || !demo) return;
    closedRef.current = true;
    onAskJana?.(demo.slug, current?.janaStarter);
    onClose();
  };

  // Esc = überspringen, Pfeiltasten = navigieren.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); finish("skipped"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, total]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !current) return null;

  // Karte gegenüber vom Spotlight platzieren, damit sie das Ziel nicht verdeckt.
  const cardAtTop = box ? box.top + box.height / 2 > window.innerHeight / 2 : false;

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={`Onboarding-Durchlauf: ${demo!.title}`}>
      {/* Klick-Fänger: blockt Interaktion mit der Seite während des Durchlaufs. */}
      <div className="absolute inset-0" onClick={() => { /* bewusst kein Auto-Skip */ }} />

      {/* Spotlight: Ausschnitt via großem box-shadow. Ohne Ziel: Vollflächen-Dimmung. */}
      {box ? (
        <div
          className="absolute rounded-xl ring-2 ring-primary transition-all duration-300 pointer-events-none"
          style={{
            top: box.top, left: box.left, width: box.width, height: box.height,
            boxShadow: "0 0 0 9999px hsl(var(--background) / 0.80)",
          }}
        />
      ) : (
        <div className="absolute inset-0 pointer-events-none" style={{ background: "hsl(var(--background) / 0.80)" }} />
      )}

      {/* Coach-Karte */}
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2 w-[min(92vw,30rem)] pointer-events-auto",
          cardAtTop ? "top-6" : "bottom-6",
        )}
      >
        <div className="rounded-2xl border border-primary/25 bg-card shadow-2xl p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-[18px] h-[18px] text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">
                  Jana erklärt · Schritt {step + 1} von {total}
                </p>
                <h3 className="text-sm font-semibold text-foreground leading-tight mt-1 truncate">{current.title}</h3>
              </div>
            </div>
            <button onClick={() => finish("skipped")} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Durchlauf beenden">
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm text-foreground leading-relaxed">{current.body}</p>
          {current.source && (
            <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" /> {current.source}
            </p>
          )}

          {/* Fortschrittspunkte */}
          <div className="flex items-center gap-1.5 mt-3.5">
            {steps.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-primary" : "w-1.5 bg-muted")} />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 mt-4">
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button onClick={prev} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md">
                  <ArrowLeft className="w-4 h-4" /> Zurück
                </button>
              )}
              {current.janaStarter && (
                <button onClick={askJana} className="inline-flex items-center gap-1 text-sm text-primary hover:underline px-1 py-1.5">
                  <MessageCircle className="w-4 h-4" /> Frag Jana dazu
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step < total - 1 && (
                <button onClick={() => finish("skipped")} className="text-sm text-muted-foreground hover:text-foreground px-2 py-1.5">
                  Überspringen
                </button>
              )}
              <button onClick={goNext} className="inline-flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg px-3.5 py-2 hover:bg-primary/90">
                {step >= total - 1 ? "Fertig" : "Weiter"} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
