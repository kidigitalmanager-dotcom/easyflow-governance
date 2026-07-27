import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Compass } from "lucide-react";

/**
 * 404 — Redesign 27.07.2026.
 *
 * Die Seite kann sowohl innerhalb der Console als auch nackt aufgerufen werden,
 * deshalb bringt sie ihren eigenen zentrierten Rahmen mit (Sprache des neuen
 * Login: dunkler Grund, .glass-card, Emerald-CTA) — und deutschen Text, weil die
 * gesamte Oberfläche deutsch ist.
 *
 * Das console.error bleibt: es ist die einzige Spur, über die kaputte interne
 * Links überhaupt auffallen.
 */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-background px-4">
      <div className="glass-card w-full max-w-md p-8 text-center animate-fade-up">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted text-tx-weak">
          <Compass className="h-5 w-5" />
        </div>
        <p className="ue-kicker">Fehler 404</p>
        <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          Diese Seite gibt es nicht.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Der Pfad <span className="font-mono text-tx-secondary">{location.pathname}</span> führt ins Leere —
          vermutlich ein alter Link oder ein Tippfehler.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex w-full items-center justify-center rounded-[10px] bg-primary px-4 py-[11px] text-[14px] font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-px hover:shadow-[0_14px_30px_-14px_hsl(var(--emerald)/0.8)]"
        >
          Zurück zur Übersicht
        </a>
      </div>
    </main>
  );
};

export default NotFound;
