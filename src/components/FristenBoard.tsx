import { CalendarClock, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useMemoryEntities } from "@/hooks/use-memory";
import { num, type MemoryEntity } from "@/lib/memory-api";

// ─────────────────────────────────────────────────────────────────────────────
// Fristen & Zusagen (Redesign Follow-up): erkannte Fristen (case_state via
// memory-engine entity_profiles.next_deadline_at) pro Gegenstelle. Ueberfaellig
// rot, naechste 7 Tage amber. Nightly-Datenstand — ehrlich ausgewiesen.
// Rendert NICHTS bei leer/Fehler (Heute bleibt ruhig).
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export function deadlineTone(iso: string, now = Date.now()): "overdue" | "soon" | "later" {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "later";
  if (t < now - DAY_MS / 2) return "overdue";
  if (t <= now + 7 * DAY_MS) return "soon";
  return "later";
}

export function FristenBoard() {
  const q = useMemoryEntities(200);
  if (q.isLoading || q.isError) return null;

  const rows = (q.data ?? [])
    .filter((e): e is MemoryEntity & { next_deadline_at: string } => !!e.next_deadline_at)
    .sort((a, b) => Date.parse(a.next_deadline_at) - Date.parse(b.next_deadline_at))
    .slice(0, 6);
  if (rows.length === 0) return null;

  const overdue = rows.filter((r) => deadlineTone(r.next_deadline_at) === "overdue").length;

  return (
    <div className="glass-card">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
        <CalendarClock className="w-4 h-4 text-p1" />
        <h2 className="text-sm font-semibold">Fristen & Zusagen</h2>
        <span className="text-[10.5px] text-muted-foreground ml-1">
          {overdue > 0 ? `${overdue} überfällig · ` : ""}aus deiner Kommunikation erkannt
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">nächtliche Auswertung</span>
      </div>
      {rows.map((r) => {
        const tone = deadlineTone(r.next_deadline_at);
        const who = r.display_name || r.entity_email || "Unbekannt";
        const commitments = num(r.open_commitments) ?? 0;
        return (
          <div key={r.entity_hash} className="flex items-center gap-3 px-5 py-2.5 border-b border-border last:border-b-0">
            <span className={
              "text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap " +
              (tone === "overdue" ? "bg-p0/15 text-p0" : tone === "soon" ? "bg-p1/15 text-p1" : "bg-muted text-muted-foreground")
            }>
              {tone === "overdue" ? "überfällig" : tone === "soon" ? "bald" : "geplant"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold truncate">{who}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                Frist {new Date(r.next_deadline_at).toLocaleDateString("de-DE")}
                {commitments > 0 ? ` · ${commitments} offene Zusage${commitments > 1 ? "n" : ""}` : ""}
              </p>
            </div>
            {r.entity_email && (
              <Link
                to={`/audit?q=${encodeURIComponent(r.entity_email)}`}
                className="text-xs text-primary hover:underline flex items-center gap-0.5 whitespace-nowrap"
              >
                Verlauf <ChevronRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
