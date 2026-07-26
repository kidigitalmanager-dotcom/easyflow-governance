/**
 * LeadUploadTab — Lead-Listen hochladen und Vertrieblern zuweisen (v4.147.0).
 *
 * Zwei Sorten Liste, ein Feld:
 *   - ZENTRAL  (keine Zuweisung) — jeder Vertriebler sieht sie im Co-Pilot
 *   - ZUGEWIESEN (1..n Vertriebler) — nur die sehen sie
 * Bestandslisten ohne Zuweisung gelten als zentral; es gibt keinen Backfill.
 *
 * Laedt ein Vertriebler selbst im Co-Pilot hoch, gehoert die Liste ihm und
 * erscheint hier mit Herkunft — der Betrieb kann sie umverteilen oder loeschen.
 */
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useLeadLists, useLeadUpload, useLeadListDelete, useAssignLeadList, useVoiceReps } from "@/hooks/use-api";
import type { LeadListSummary } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, Loader2, Trash2, ListChecks, Info, X, Users, User, UserCog } from "lucide-react";
import { toast } from "sonner";

const MAX_LEADS = 10000;
type LeadRow = Record<string, unknown>;
const errText = (e: unknown) => (e instanceof Error ? e.message : "Unbekannter Fehler");

/** Mehrfachauswahl Vertriebler + Zentral-Schalter — im Upload und im Zuweisen-Dialog. */
function RepPicker({
  reps, value, onChange, disabled,
}: {
  reps: { rep_id: string; name: string; active: boolean }[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const central = value.length === 0;
  const toggle = (repId: string) =>
    onChange(value.includes(repId) ? value.filter((r) => r !== repId) : [...value, repId]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([])}
        className={`w-full flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
          central ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
        }`}
      >
        <Users className={`w-4 h-4 mt-0.5 shrink-0 ${central ? "text-primary" : "text-muted-foreground"}`} />
        <span className="min-w-0">
          <span className="block text-sm font-medium">Zentrale Liste</span>
          <span className="block text-xs text-muted-foreground">Alle Vertriebler sehen sie in ihrem Co-Pilot.</span>
        </span>
      </button>

      <div className={`rounded-md border px-3 py-2.5 ${!central ? "border-primary bg-primary/5" : "border-border"}`}>
        <div className="flex items-start gap-3">
          <User className={`w-4 h-4 mt-0.5 shrink-0 ${!central ? "text-primary" : "text-muted-foreground"}`} />
          <div className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Nur bestimmte Vertriebler</span>
            <span className="block text-xs text-muted-foreground mb-2">
              Mehrfachauswahl möglich. Keine Auswahl = zentrale Liste.
            </span>
            {reps.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Noch keine Vertriebler angelegt — im Tab „Vertriebler" einladen.
              </p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {reps.map((r) => (
                  <label
                    key={r.rep_id}
                    className={`flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-muted/40 ${
                      disabled ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    <Checkbox checked={value.includes(r.rep_id)} onCheckedChange={() => toggle(r.rep_id)} />
                    <span className="truncate">{r.name || r.rep_id}</span>
                    {!r.active && <Badge variant="outline" className="text-[10px] px-1 py-0">inaktiv</Badge>}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LeadUploadTab() {
  const { data, isLoading, error } = useLeadLists();
  const repsQ = useVoiceReps();
  const uploadMut = useLeadUpload();
  const deleteMut = useLeadListDelete();
  const assignMut = useAssignLeadList();

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState(false);
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [listName, setListName] = useState("");
  const [fileName, setFileName] = useState("");
  const [assignTo, setAssignTo] = useState<string[]>([]);

  const [editList, setEditList] = useState<LeadListSummary | null>(null);
  const [editSel, setEditSel] = useState<string[]>([]);

  const lists = data?.lists ?? [];
  const reps = useMemo(
    () => (repsQ.data?.reps ?? []).map((r) => ({ rep_id: r.rep_id, name: r.name || r.rep_id, active: r.active })),
    [repsQ.data],
  );
  const repName = (id: string) => reps.find((r) => r.rep_id === id)?.name ?? id;

  const central = lists.filter((l) => (l.assigned_rep_ids ?? []).length === 0);
  const assigned = lists.filter((l) => (l.assigned_rep_ids ?? []).length > 0);

  const reset = () => {
    setLeads(null); setColumns([]); setListName(""); setFileName(""); setAssignTo([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File) => {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) { toast.error("Datei enthält keine Tabelle"); return; }
      const rows = XLSX.utils.sheet_to_json<LeadRow>(ws, { defval: "" });
      const cleaned = rows.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== ""));
      if (cleaned.length === 0) { toast.error("Keine Zeilen mit Inhalt gefunden"); return; }
      if (cleaned.length > MAX_LEADS) {
        toast.error(`Zu viele Zeilen (${cleaned.length}). Maximal ${MAX_LEADS.toLocaleString("de-DE")} pro Liste.`);
        return;
      }
      setLeads(cleaned);
      setColumns(Object.keys(cleaned[0] ?? {}));
      setFileName(file.name);
      setListName((prev) => prev || file.name.replace(/\.(xlsx|xls|csv)$/i, ""));
      toast.success(`${cleaned.length} Zeilen erkannt`);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setParsing(false);
    }
  };

  const submit = async () => {
    if (!leads || leads.length === 0) return;
    const name = listName.trim();
    if (!name) { toast.error("Bitte einen Listennamen angeben"); return; }
    try {
      const res = await uploadMut.mutateAsync({ list_name: name, leads, assigned_rep_ids: assignTo });
      if (!res.ok) { toast.error(res.error || "Upload fehlgeschlagen"); return; }
      toast.success(
        assignTo.length === 0
          ? `„${name}" hochgeladen (${res.lead_count ?? leads.length} Leads) — zentral für alle Vertriebler`
          : `„${name}" hochgeladen (${res.lead_count ?? leads.length} Leads) — für ${assignTo.map(repName).join(", ")}`,
      );
      reset();
    } catch (e) {
      toast.error(errText(e));
    }
  };

  const removeList = async (listId: string, name: string) => {
    try { await deleteMut.mutateAsync(listId); toast.success(`„${name}" gelöscht`); }
    catch (e) { toast.error(errText(e)); }
  };

  const openEdit = (l: LeadListSummary) => { setEditList(l); setEditSel(l.assigned_rep_ids ?? []); };

  const saveAssignment = async () => {
    if (!editList) return;
    try {
      const r = await assignMut.mutateAsync({ listId: editList.list_id, repIds: editSel });
      if (!r.ok) { toast.error(r.error || "Zuweisung fehlgeschlagen"); return; }
      toast.success(
        editSel.length === 0
          ? `„${editList.list_name}" ist jetzt zentral.`
          : `„${editList.list_name}" → ${editSel.map(repName).join(", ")}`,
      );
      setEditList(null);
    } catch (e) { toast.error(errText(e)); }
  };

  const ListRow = ({ l }: { l: LeadListSummary }) => {
    const ids = l.assigned_rep_ids ?? [];
    return (
      <div className="flex items-center gap-3 py-2.5">
        <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{l.list_name}</p>
          <p className="text-xs text-muted-foreground">
            {l.lead_count.toLocaleString("de-DE")} Leads
            {l.uploaded_at && <span> · {new Date(l.uploaded_at).toLocaleDateString("de-DE")}</span>}
            {l.uploaded_by_rep_id
              ? <span className="text-amber-400/90"> · hochgeladen von {repName(l.uploaded_by_rep_id)}</span>
              : l.uploaded_by && <span className="text-muted-foreground/60"> · {l.uploaded_by}</span>}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {ids.length === 0
              ? <Badge variant="secondary" className="gap-1 text-[11px]"><Users className="w-3 h-3" />zentral</Badge>
              : ids.map((id) => <Badge key={id} variant="outline" className="gap-1 text-[11px]"><User className="w-3 h-3" />{repName(id)}</Badge>)}
          </div>
        </div>
        <Button variant="ghost" size="sm" title="Zuweisung ändern" onClick={() => openEdit(l)}>
          <UserCog className="w-3.5 h-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" title="Löschen"><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>„{l.list_name}" löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Die Liste mit {l.lead_count.toLocaleString("de-DE")} Leads wird entfernt. Das kann nicht rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={() => removeList(l.list_id, l.list_name)}>Löschen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Upload */}
      <div className="glass-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Lead-Liste hochladen</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Excel (.xlsx) oder CSV. Erste Zeile = Spaltennamen (z. B. Name, Firma, Telefon).
            Beim Hochladen legt ihr fest, wer die Liste sieht — alle oder ausgewählte Vertriebler.
          </p>
        </div>

        <input
          ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />

        {!leads ? (
          <button
            type="button" onClick={() => fileRef.current?.click()} disabled={parsing}
            className="w-full flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-border rounded-lg hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            {parsing ? <Loader2 className="w-7 h-7 text-muted-foreground animate-spin" /> : <Upload className="w-7 h-7 text-muted-foreground/60" />}
            <span className="text-sm text-muted-foreground">{parsing ? "Datei wird gelesen…" : "Datei auswählen (.xlsx / .csv)"}</span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-muted/30 border border-border rounded-md px-3 py-2">
              <FileSpreadsheet className="w-5 h-5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {leads.length.toLocaleString("de-DE")} Leads · {columns.length} Spalten
                  {columns.length > 0 && <span className="text-muted-foreground/60"> · {columns.slice(0, 4).join(", ")}{columns.length > 4 ? " …" : ""}</span>}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={reset} title="Verwerfen"><X className="w-3.5 h-3.5" /></Button>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Listenname</label>
              <input
                value={listName} onChange={(e) => setListName(e.target.value)} placeholder="z. B. Kaltakquise Juli"
                className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Wer soll diese Liste sehen?</label>
              <RepPicker reps={reps} value={assignTo} onChange={setAssignTo} disabled={uploadMut.isPending} />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={reset}>Abbrechen</Button>
              <Button onClick={submit} disabled={uploadMut.isPending || !listName.trim()} className="gap-1.5">
                {uploadMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Hochladen
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Listen */}
      <div className="glass-card p-6 space-y-5">
        <h3 className="text-sm font-semibold">Hochgeladene Listen</h3>
        {error && <p className="text-sm text-red-400">Listen konnten nicht geladen werden.</p>}
        {isLoading ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : lists.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <ListChecks className="w-7 h-7 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Noch keine Listen hochgeladen</p>
          </div>
        ) : (
          <>
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />Zentral — alle Vertriebler ({central.length})
              </p>
              {central.length === 0
                ? <p className="text-xs text-muted-foreground py-2">Keine zentrale Liste.</p>
                : <div className="divide-y divide-border">{central.map((l) => <ListRow key={l.list_id} l={l} />)}</div>}
            </section>

            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />Einzelnen Vertrieblern zugewiesen ({assigned.length})
              </p>
              {assigned.length === 0
                ? <p className="text-xs text-muted-foreground py-2">Keine zugewiesene Liste.</p>
                : <div className="divide-y divide-border">{assigned.map((l) => <ListRow key={l.list_id} l={l} />)}</div>}
            </section>
          </>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 border border-border rounded-md px-3 py-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Die Datei wird im Browser gelesen — es gehen nur die Zeilen an den Server. Maximal{" "}
          {MAX_LEADS.toLocaleString("de-DE")} Leads pro Liste. Ihr könnt beliebig viele Listen nebeneinander führen
          und die Zuweisung jederzeit ändern; der Co-Pilot zieht sie beim nächsten Sync.
        </span>
      </div>

      {/* Zuweisung ändern */}
      <Dialog open={!!editList} onOpenChange={(o) => !o && setEditList(null)}>
        <DialogContent className="max-w-lg">
          {editList && (
            <>
              <DialogHeader>
                <DialogTitle>Zuweisung — „{editList.list_name}"</DialogTitle>
                <DialogDescription>
                  {editList.lead_count.toLocaleString("de-DE")} Leads
                  {editList.uploaded_by_rep_id && <> · ursprünglich hochgeladen von {repName(editList.uploaded_by_rep_id)}</>}
                </DialogDescription>
              </DialogHeader>
              <RepPicker reps={reps} value={editSel} onChange={setEditSel} disabled={assignMut.isPending} />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setEditList(null)}>Abbrechen</Button>
                <Button onClick={saveAssignment} disabled={assignMut.isPending} className="gap-1.5">
                  {assignMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Speichern
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
