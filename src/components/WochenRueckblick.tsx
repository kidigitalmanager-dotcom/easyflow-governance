import { History } from "lucide-react";
import { useMemoryEpisode } from "@/hooks/use-memory";

// ─────────────────────────────────────────────────────────────────────────────
// Wochen-Rueckblick (Redesign Follow-up): juengste Wochen-Episode aus der
// memory-engine (B2 memory_episodes) — deterministische Stats + Narrativ.
// Rendert NICHTS bei leer/Fehler.
// ─────────────────────────────────────────────────────────────────────────────

const STAT_LABELS: Record<string, string> = {
  emails: "E-Mails", mails: "E-Mails", msgs: "Nachrichten", messages: "Nachrichten",
  drafts: "Entwürfe", drafts_created: "Entwürfe", escalations: "Eskalationen",
  resolved: "Gelöst", threads_resolved: "Gelöst", threads_open: "Offen",
  calls: "Anrufe", deadlines: "Fristen", high_prio: "Hohe Priorität",
};

export function statChips(stats: unknown, max = 4): { label: string; value: string }[] {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return [];
  return Object.entries(stats as Record<string, unknown>)
    .filter(([, v]) => typeof v === "number" || (typeof v === "string" && v !== "" && !Number.isNaN(Number(v))))
    .slice(0, max)
    .map(([k, v]) => ({
      label: STAT_LABELS[k] ?? k.replace(/_/g, " "),
      value: String(v),
    }));
}

export function WochenRueckblick() {
  const q = useMemoryEpisode("week");
  if (q.isLoading || q.isError || !q.data) return null;
  const ep = q.data;
  const chips = statChips(ep.stats);
  const range = `${new Date(ep.period_start).toLocaleDateString("de-DE", { day: "numeric", month: "short" })} bis ${new Date(ep.period_end).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}`;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold">Dein Wochen-Rückblick</h2>
        <History className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-xs text-muted-foreground mb-3">{range} · nächtlich erstellt</p>
      {ep.headline && <p className="text-sm font-semibold mb-1.5">{ep.headline}</p>}
      {ep.narrative && (
        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line line-clamp-[8]">{ep.narrative}</p>
      )}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {chips.map((c) => (
            <span key={c.label} className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted/40 tabular-nums">
              {c.label}: {c.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
