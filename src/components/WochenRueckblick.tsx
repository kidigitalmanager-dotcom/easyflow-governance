import { History } from "lucide-react";
import { useMemoryEpisode } from "@/hooks/use-memory";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";

// ─────────────────────────────────────────────────────────────────────────────
// Wochen-Rueckblick (Redesign Follow-up): juengste Wochen-Episode aus der
// memory-engine (B2 memory_episodes) — deterministische Stats + Narrativ.
// Fehler und Leerstand werden ausgewiesen, die Karte verschwindet nie lautlos.
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

  // 2026-07-27: Fehler und "noch nichts da" sind zwei verschiedene Dinge und
  // beide duerfen die Karte nicht verschwinden lassen (Leons Durchlauf: man
  // sieht sonst nicht, DASS es den Rueckblick gibt).
  if (q.isError || (!q.isLoading && !q.data)) {
    return (
      <div className="glass-card p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold">Dein Wochen-Rückblick</h2>
          <History className="h-4 w-4 text-muted-foreground" />
        </div>
        {q.isError ? (
          <div className="mt-3">
            <QueryErrorNotice
              label="Der Wochen-Rückblick konnte nicht geladen werden."
              onRetry={() => q.refetch()}
              retrying={q.isFetching}
            />
          </div>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Noch kein Rückblick vorhanden. Er wird nächtlich aus deiner Kommunikation
            der letzten Woche erstellt und erscheint hier ab dem ersten vollen Lauf.
          </p>
        )}
      </div>
    );
  }

  if (q.isLoading || !q.data) return null;
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
