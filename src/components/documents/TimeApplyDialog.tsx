// -----------------------------------------------------------------------------
// TimeApplyDialog (v4.132.0) — "Offene Zeiten übernehmen" im Rechnungs- UND
// Angebots-Editor (nur draft). Zeigt offene, abrechenbare Zeiteinträge
// (vorgefiltert auf den Dokument-Kunden), Checkboxen + Gruppierung; das Backend
// hängt die Positionen an und rechnet via computeOffer autoritativ neu.
// -----------------------------------------------------------------------------
import { useMemo, useState } from "react";
import { useTimeEntries, useApplyTimeToDocument } from "@/hooks/use-api";
import type { TimeEntry } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Clock, Loader2, AlertTriangle } from "lucide-react";

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  return `${h}:${String(min % 60).padStart(2, "0")} h`;
}
function fmtDay(ts: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ts || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ts;
}
function fmtCents(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

const GRUPPEN: { value: "je_eintrag" | "je_mitarbeiter" | "gesamt"; label: string; hint: string }[] = [
  { value: "je_eintrag", label: "Je Einsatz", hint: "eine Position pro Zeiteintrag (mit Datum + Notiz)" },
  { value: "je_mitarbeiter", label: "Je Mitarbeiter", hint: "Stunden pro Mitarbeiter zusammengefasst" },
  { value: "gesamt", label: "Gesamt", hint: "alle Stunden in einer Position (je Stundensatz)" },
];

export function TimeApplyButton({ documentId, docType, customer, disabled, onApplied }: {
  documentId: number;
  docType: "invoice" | "offer";
  customer?: string | null;
  disabled?: boolean;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState(customer || "");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [gruppierung, setGruppierung] = useState<"je_eintrag" | "je_mitarbeiter" | "gesamt">("je_eintrag");

  const entries = useTimeEntries({ status: "open", customer: filter.trim() || undefined }, open);
  const apply = useApplyTimeToDocument();

  const items = useMemo(() => (entries.data?.items || []).filter((e) => e.billable), [entries.data]);
  const selectedIds = items.filter((e) => selected[e.id]).map((e) => e.id);
  const selSum = items.filter((e) => selected[e.id]).reduce((s, e) => s + e.duration_min, 0);
  const selValue = items.filter((e) => selected[e.id]).reduce((s, e) => s + (e.hourly_rate_cents != null ? Math.round(e.duration_min * e.hourly_rate_cents / 60) : 0), 0);
  const selNoRate = items.filter((e) => selected[e.id] && e.hourly_rate_cents == null).length;
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) { setFilter(customer || ""); setSelected({}); setGruppierung("je_eintrag"); }
  }
  function toggleAll() {
    if (allSelected) setSelected({});
    else setSelected(Object.fromEntries(items.map((e) => [e.id, true])));
  }
  async function doApply() {
    if (!selectedIds.length) { toast.error("Bitte mindestens einen Eintrag auswählen."); return; }
    try {
      const res = await apply.mutateAsync({ document_id: documentId, entry_ids: selectedIds, gruppierung });
      if (!res.ok) {
        toast.error(res.error === "not_in_draft" ? "Das Dokument ist kein Entwurf mehr." : "Übernahme fehlgeschlagen: " + (res.error || ""));
        return;
      }
      toast.success(`${res.added_positions} Position(en) übernommen — Summen wurden serverseitig neu berechnet.`);
      if ((res.entries_without_rate || 0) > 0) {
        toast.message("Einträge ohne Stundensatz übernommen.", { description: "Diese Positionen haben einen offenen Preis — bitte im Positions-Tisch eintragen." });
      }
      setOpen(false);
      onApplied();
    } catch { toast.error("Übernahme fehlgeschlagen."); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} title="Offene Zeiteinträge als Positionen übernehmen">
          <Clock className="mr-1 h-4 w-4" /> Offene Zeiten übernehmen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Offene Zeiten übernehmen</DialogTitle>
          <DialogDescription>
            Ausgewählte Einträge werden als Positionen (Stunden × Stundensatz) an {docType === "invoice" ? "die Rechnung" : "das Angebot"} angehängt und dort abgerechnet markiert.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Kunde filtern</Label>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Kundenname…" className="h-8" />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-lg border p-2">
            {entries.isLoading && <><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></>}
            {!entries.isLoading && items.length === 0 && (
              <p className="text-sm text-muted-foreground p-3">Keine offenen, abrechenbaren Zeiteinträge {filter.trim() ? "für diesen Filter" : ""}.</p>
            )}
            {items.length > 0 && (
              <label className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground cursor-pointer">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} /> Alle auswählen ({items.length})
              </label>
            )}
            {items.map((e: TimeEntry) => (
              <label key={e.id} className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                <Checkbox className="mt-0.5" checked={!!selected[e.id]} onCheckedChange={(v) => setSelected({ ...selected, [e.id]: v === true })} />
                <span className="min-w-0 text-sm">
                  <span className="font-medium">{e.customer_name || "(ohne Kunde)"}</span>
                  <span className="text-muted-foreground"> · {fmtDay(e.started_at)} · {fmtMin(e.duration_min)}</span>
                  {e.hourly_rate_cents == null && <Badge variant="outline" className="ml-1.5 text-[10px]">Satz offen</Badge>}
                  {e.description && <span className="block text-xs text-muted-foreground truncate">{e.description}</span>}
                </span>
              </label>
            ))}
          </div>

          <div>
            <Label className="text-xs">Gruppierung</Label>
            <div className="mt-1 space-y-1">
              {GRUPPEN.map((g) => (
                <label key={g.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="ue-time-gruppierung" checked={gruppierung === g.value} onChange={() => setGruppierung(g.value)} />
                  <span>{g.label} <span className="text-xs text-muted-foreground">— {g.hint}</span></span>
                </label>
              ))}
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              {selectedIds.length} Eintrag/Einträge · {fmtMin(selSum)}{selValue > 0 ? " · " + fmtCents(selValue) + " netto (bekannte Sätze)" : ""}
              {selNoRate > 0 && (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {selNoRate} Eintrag/Einträge ohne Stundensatz — der Preis bleibt im Dokument offen, bis er eingetragen ist.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button onClick={doApply} disabled={apply.isPending || selectedIds.length === 0}>
            {apply.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Clock className="mr-1 h-4 w-4" />}
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
