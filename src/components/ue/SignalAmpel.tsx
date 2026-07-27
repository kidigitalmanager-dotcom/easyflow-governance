import { useMemo } from "react";
import { ShieldAlert, Eye, CircleCheck } from "lucide-react";
import { SectionCard } from "@/components/ue/primitives";
import { IllustrativeBadge } from "@/components/capital/CapitalBits";
import { buildSignalOverview, type AmpelState } from "@/lib/signal-table";
import type { CapAlert } from "@/lib/capital";
import { cn } from "@/lib/utils";

/**
 * EINE Ampel plus Signal-Tabelle (Leons Entwurf, Briefing 27.07.2026 Punkt 5.3).
 *
 * Der Entwurf will an dieser Stelle genau zwei Dinge, die es bisher nicht gab:
 * eine gemeinsame Ampel Bestätigt · Beobachtung · Stabil und darunter eine
 * Tabelle Signal / Auslöser / Erkannt / Vorschlag. Die zweistufige Einordnung
 * dahinter ist die bestehende, aus zwei historischen Backtests kalibrierte
 * Regel (src/lib/alert-quality.ts) und wird hier nur anders dargestellt.
 *
 * Die Ableitung steckt in src/lib/signal-table.ts und ist dort getestet.
 */

const LAMPS: { key: AmpelState; label: string; icon: typeof ShieldAlert; on: string; off: string }[] = [
  {
    key: "confirmed",
    label: "Bestätigt",
    icon: ShieldAlert,
    on: "border-danger/45 bg-danger/10 text-danger",
    off: "border-line-soft bg-muted text-tx-weak",
  },
  {
    key: "watch",
    label: "Beobachtung",
    icon: Eye,
    on: "border-amber/45 bg-amber-surface/45 text-amber",
    off: "border-line-soft bg-muted text-tx-weak",
  },
  {
    key: "stable",
    label: "Stabil",
    icon: CircleCheck,
    on: "border-emerald-surface bg-emerald-deep text-emerald-light",
    off: "border-line-soft bg-muted text-tx-weak",
  },
];

export function SignalAmpel({
  alerts,
  loading,
  className,
}: {
  alerts: CapAlert[] | undefined;
  loading?: boolean;
  className?: string;
}) {
  const o = useMemo(() => buildSignalOverview(alerts), [alerts]);

  const satz =
    o.state === "confirmed"
      ? "Mindestens ein Alarm hält sich über mehrere Monatsläufe. Das ist die Klasse, auf die du reagieren solltest."
      : o.state === "watch"
        ? "Es gibt Signale, aber noch keines, das sich über mehrere Monatsläufe gehalten hat."
        : "Kein offenes Signal. Sobald sich etwas verschlechtert, steht es hier.";

  return (
    <SectionCard
      title="Lage"
      subtitle="eine Ampel für alles, was warnt"
      className={className}
      bodyClassName="p-0"
    >
      <div className="px-4 pb-3 pt-4">
        <div className="grid grid-cols-3 gap-2">
          {LAMPS.map((l) => {
            const active = o.state === l.key;
            const count = l.key === "confirmed" ? o.confirmed : l.key === "watch" ? o.watch : null;
            return (
              <div
                key={l.key}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-[10px] border px-3 py-2.5 transition-colors",
                  active ? l.on : l.off,
                )}
              >
                <l.icon className="h-4 w-4 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold">{l.label}</span>
                  {count !== null && (
                    <span className="block text-[11px] tabular opacity-80">
                      {loading ? "–" : count}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">{satz}</p>
      </div>

      {o.rows.length > 0 && (
        <div className="border-t border-line-soft">
          {/* Kopfzeile nur ab mittlerer Breite: auf schmalen Fenstern wird jede
              Zeile zu einem Block, das liest sich besser als eine Quetsch-Tabelle. */}
          <div className="hidden gap-3 border-b border-line-soft px-4 py-2 md:grid md:grid-cols-[1.4fr_1.6fr_auto_1.8fr]">
            {["Signal", "Auslöser", "Erkannt", "Vorschlag"].map((h) => (
              <span key={h} className="ue-kicker">{h}</span>
            ))}
          </div>
          <ul className="divide-y divide-line-soft">
            {o.rows.map((r) => (
              <li
                key={r.id}
                className="grid gap-1.5 px-4 py-3 md:grid-cols-[1.4fr_1.6fr_auto_1.8fr] md:gap-3"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 flex-shrink-0 rounded-full",
                        r.tier === "confirmed" ? "bg-danger" : "bg-amber",
                      )}
                      aria-hidden
                    />
                    <span className="text-[13px] font-medium">{r.signal}</span>
                    {r.isIllustrative && <IllustrativeBadge />}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-tx-weak">
                    {r.tier === "confirmed" ? `bestätigt · ${r.heldLabelDe}` : `Beobachtung · ${r.heldLabelDe}`}
                  </span>
                </span>
                <span className="text-[12.5px] text-muted-foreground">
                  <span className="ue-kicker mr-1.5 md:hidden">Auslöser</span>
                  {r.ausloeser}
                </span>
                <span className="whitespace-nowrap text-[12.5px] tabular text-muted-foreground">
                  <span className="ue-kicker mr-1.5 md:hidden">Erkannt</span>
                  {r.erkannt}
                </span>
                <span className="text-[12.5px] text-muted-foreground">
                  <span className="ue-kicker mr-1.5 md:hidden">Vorschlag</span>
                  {r.vorschlag}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
