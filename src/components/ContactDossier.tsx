import { useState } from "react";
import { BookUser, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useEntityByEmail } from "@/hooks/use-memory";
import { extractEmailAddress, num, type MemoryEntity } from "@/lib/memory-api";
import { humanizeCategory } from "@/data/humanize";

// ─────────────────────────────────────────────────────────────────────────────
// Kontakt-Dossier (Redesign Follow-up): pro Absender das naechtlich berechnete
// Profil aus der memory-engine (B1 entity_profiles) — Vorgaenge, Eskalationen,
// offene Zusagen, Loesungszeit, Label-Mix. Read-only, degradiert still.
// Fetch erst beim Oeffnen (enabled=open) — kein Traffic in Listen.
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE");
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className={"text-base font-semibold tabular-nums " + (warn ? "text-p1" : "")}>{value}</p>
      <p className="text-[10.5px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function labelMixTop(mix: unknown, max = 3): { label: string; count: number }[] {
  if (!mix || typeof mix !== "object" || Array.isArray(mix)) return [];
  return Object.entries(mix as Record<string, unknown>)
    .map(([k, v]) => ({ label: humanizeCategory(k), count: Number(v) || 0 }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

function DossierBody({ entity }: { entity: MemoryEntity }) {
  const open = num(entity.threads_open) ?? 0;
  const resolved = num(entity.threads_resolved) ?? 0;
  const esc = num(entity.escalations_90d) ?? 0;
  const commitments = num(entity.open_commitments) ?? 0;
  const avgH = num(entity.avg_resolution_hours);
  const calls = num(entity.calls_total) ?? 0;
  const mix = labelMixTop(entity.label_mix);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat label="Nachrichten (90 Tage)" value={String(num(entity.msgs_90d) ?? 0)} />
        <Stat label="Vorgänge offen / gelöst" value={`${open} / ${resolved}`} warn={open > 0} />
        <Stat label="Eskalationen (90 Tage)" value={String(esc)} warn={esc > 0} />
        <Stat label="Offene Zusagen" value={String(commitments)} warn={commitments > 0} />
        <Stat label="Ø Lösungszeit" value={avgH != null ? `${Math.round(avgH)} h` : "—"} />
        <Stat label="Anrufe (Jana)" value={String(calls)} />
      </div>

      {entity.next_deadline_at && (
        <p className="text-xs rounded-lg border border-p1/30 bg-p1/10 text-p1 px-3 py-2">
          Nächste erkannte Frist: <span className="font-semibold">{fmtDate(entity.next_deadline_at)}</span>
        </p>
      )}

      {mix.length > 0 && (
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Häufigste Kategorien</p>
          <div className="flex flex-wrap gap-1.5">
            {mix.map((m) => (
              <span key={m.label} className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted/40">
                {m.label} · {m.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {entity.summary_note && (
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Kurzprofil</p>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{entity.summary_note}</p>
        </div>
      )}

      <p className="text-[10.5px] text-muted-foreground border-t border-border pt-2.5">
        Seit {fmtDate(entity.first_seen_at)} · zuletzt {fmtDate(entity.last_seen_at)} · Stand {fmtDate(entity.computed_at)} (nächtliche Auswertung).
        Es werden nur Kennzahlen gespeichert, keine Mail-Inhalte.
      </p>
    </div>
  );
}

export function ContactDossier({ sender }: { sender?: string | null }) {
  const email = extractEmailAddress(sender);
  const [open, setOpen] = useState(false);
  const q = useEntityByEmail(open ? email : undefined);

  if (!email) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
          title="Kontakt-Dossier öffnen (Verlauf, Zusagen, Lösungszeit)"
        >
          <BookUser className="w-3 h-3" /> Dossier
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {q.data?.display_name || email}
            {q.data?.display_name && <span className="block text-xs font-normal text-muted-foreground mt-0.5">{email}</span>}
          </DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Lade Dossier …
          </div>
        ) : q.isError ? (
          <p className="text-sm text-muted-foreground py-4">Dossier-Dienst gerade nicht erreichbar.</p>
        ) : q.data ? (
          <DossierBody entity={q.data} />
        ) : (
          <p className="text-sm text-muted-foreground py-4">
            Noch kein Dossier zu diesem Kontakt. Profile entstehen nächtlich aus dem Postfach-Verlauf
            (ab der ersten verarbeiteten E-Mail dieser Gegenstelle).
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
