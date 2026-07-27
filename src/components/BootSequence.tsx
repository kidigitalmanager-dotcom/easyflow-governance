import { useEffect, useState } from "react";
import { useMe, useDashboardStats } from "@/hooks/use-api";
import { useMemoryEntities } from "@/hooks/use-memory";
import { deadlineTone } from "@/components/FristenBoard";
import { usePrefersReducedMotion } from "@/components/ue/motion";
import { consumeBootSequence } from "@/lib/boot-flag";
import logo from "@/assets/useeasy-logo.jpg";

/**
 * Ladesequenz nach dem Anmelden ("Boot") — Briefing §7.2.
 *
 * Verhaltensregeln (verbindlich):
 *  - Laeuft NUR bei frischem Login. Das Flag setzt der AuthProvider beim
 *    SIGNED_IN-Event; hier wird es beim Mount sofort verbraucht, damit ein
 *    Reload oder Routenwechsel die Sequenz nicht wiederholt.
 *  - Die drei Status-Zeilen zeigen ECHTE Zahlen, sobald die Queries da sind;
 *    vorher neutraler Text. Zeile 4 ist immer statisch (Kernversprechen).
 *  - Dauer: Ziel 2600 ms, hart bei 3000 ms Schluss — auch wenn Queries noch
 *    laufen. Die Zielseite hat eigene Skeletons.
 *  - Der Boot-Screen zeigt NIE einen Fehler. Faellt eine Query um, bleibt die
 *    Zeile beim neutralen Text; den Fehler zeigt die Zielseite (QueryErrorNotice).
 *  - prefers-reduced-motion: Sequenz wird uebersprungen.
 */

const TARGET_MS = 2600;
const HARD_STOP_MS = 3000;
const DAY_MS = 86_400_000;

export function BootSequence() {
  const reduced = usePrefersReducedMotion();
  // Flag genau einmal beim ersten Render verbrauchen.
  const [armed] = useState(() => consumeBootSequence());
  const [done, setDone] = useState(false);
  const [reachedTarget, setReachedTarget] = useState(false);

  const active = armed && !reduced && !done;

  const me = useMe();
  const stats = useDashboardStats();
  const entities = useMemoryEntities(200);

  useEffect(() => {
    if (!armed || reduced) return;
    const t1 = window.setTimeout(() => setReachedTarget(true), TARGET_MS);
    const t2 = window.setTimeout(() => setDone(true), HARD_STOP_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [armed, reduced]);

  // Ab dem Ziel-Zeitpunkt weiter, sobald die Queries durch sind (Fehler zaehlt
  // als "durch" — der Boot-Screen wartet nicht auf einen kaputten Endpoint).
  const settled =
    !me.isLoading && !stats.isLoading && !entities.isLoading;
  useEffect(() => {
    if (reachedTarget && settled) setDone(true);
  }, [reachedTarget, settled]);

  // Body-Scroll sperren, solange die Sequenz laeuft.
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  if (!active) return null;

  // ---- Zeile 1: Postfach ------------------------------------------------
  const meData = me.data;
  const mailboxCount =
    meData?.plan?.active_mailboxes ??
    (Array.isArray(meData?.mailbox_health) ? meData.mailbox_health.length : undefined);
  const line1 =
    me.isSuccess && typeof mailboxCount === "number"
      ? mailboxCount > 0
        ? `Postfach verbunden · ${mailboxCount} ${mailboxCount === 1 ? "Postfach" : "Postfächer"} aktiv`
        : "Noch kein Postfach verbunden"
      : "Postfach wird geprüft …";
  const line1Tone: Tone =
    me.isSuccess && typeof mailboxCount === "number" && mailboxCount === 0 ? "amber" : "emerald";

  // ---- Zeile 2: Vorgaenge / Entwuerfe -----------------------------------
  const s = stats.data;
  const line2 = s
    ? `${s.emails_today} ${s.emails_today === 1 ? "Vorgang" : "Vorgänge"} heute gelesen · ${s.drafts_created_week} ${
        s.drafts_created_week === 1 ? "Entwurf" : "Entwürfe"
      } diese Woche`
    : "Vorgänge werden gelesen …";

  // ---- Zeile 3: Fristen (naechste 7 Tage) -------------------------------
  const deadlineCount = entities.isSuccess
    ? (entities.data ?? []).filter((e) => {
        const iso = e.next_deadline_at;
        if (typeof iso !== "string") return false;
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return false;
        const tone = deadlineTone(iso);
        return (tone === "soon" || tone === "overdue") && t <= Date.now() + 7 * DAY_MS;
      }).length
    : null;
  const line3 =
    deadlineCount === null
      ? "Fristen werden ausgewertet …"
      : deadlineCount === 0
        ? "Keine Frist in den nächsten 7 Tagen"
        : `${deadlineCount} ${deadlineCount === 1 ? "Frist" : "Fristen"} in den nächsten 7 Tagen erkannt`;
  const line3Tone: Tone = deadlineCount && deadlineCount > 0 ? "amber" : "emerald";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Autopilot wird vorbereitet"
      className="fixed inset-0 z-[120] flex items-center justify-center px-6"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, hsl(var(--emerald-deep)) 0%, hsl(var(--background)) 62%)",
      }}
    >
      <div className="w-full max-w-[520px] flex flex-col items-center">
        {/* 1 — Logo-Puls: atmende Emerald-Scheibe hinter dem dunklen Kreis */}
        <div className="relative grid place-items-center w-[120px] h-[120px]">
          <span
            aria-hidden
            className="absolute w-[92px] h-[92px] rounded-full bg-primary/45 blur-[2px] animate-breathe"
          />
          <span className="relative grid place-items-center w-[76px] h-[76px] rounded-full bg-[hsl(var(--popover))] border border-border">
            <img src={logo} alt="" className="w-9 h-9 rounded-lg" />
          </span>
        </div>

        {/* 2 — Label */}
        <p className="mt-4 text-[13px] font-semibold uppercase tracking-[0.16em] text-tx-weak animate-fade-in">
          Autopilot wird vorbereitet
        </p>

        {/* 3 — Vier Status-Zeilen, gestaffelt 0.15 / 0.6 / 1.05 / 1.5 s */}
        <div className="mt-7 w-full space-y-2.5">
          <BootLine text={line1} tone={line1Tone} delay="0.15s" />
          <BootLine text={line2} tone="emerald" delay="0.6s" />
          <BootLine text={line3} tone={line3Tone} delay="1.05s" />
          <div
            className="flex items-center gap-3 rounded-xl border border-emerald-surface px-4 py-3 animate-fade-up"
            style={{
              animationDelay: "1.5s",
              background:
                "linear-gradient(100deg, hsl(var(--emerald-deep)) 0%, hsl(var(--emerald-deep) / 0.55) 100%)",
            }}
          >
            <span aria-hidden className="ue-dot bg-primary animate-dot-pulse" />
            <p className="text-[13px] font-medium text-accent-foreground">
              Nichts wurde versendet. Alles wartet auf dich.
            </p>
          </div>
        </div>

        {/* 4 — Fortschrittsbalken */}
        <div className="mt-7 h-[2px] w-full max-w-[420px] overflow-hidden rounded-full bg-line-soft">
          <div className="h-full animate-grow-w bg-gradient-to-r from-emerald-dark via-primary to-emerald-light" />
        </div>
      </div>
    </div>
  );
}

type Tone = "emerald" | "amber";

function BootLine({ text, tone, delay }: { text: string; tone: Tone; delay: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-line-soft bg-[hsl(var(--surface))] px-4 py-3 animate-fade-up"
      style={{ animationDelay: delay }}
    >
      <span aria-hidden className={`ue-dot ${tone === "amber" ? "bg-amber" : "bg-primary"}`} />
      <p className="text-[13px] text-tx-secondary">{text}</p>
    </div>
  );
}
