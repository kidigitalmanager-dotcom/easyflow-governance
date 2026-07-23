import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useLeadLists, useLeadUpload, useLeadListDelete } from "@/hooks/use-api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Upload, FileSpreadsheet, Loader2, Trash2, ListChecks, Info, X } from "lucide-react";
import { toast } from "sonner";

const MAX_LEADS = 10000;

type LeadRow = Record<string, unknown>;

export default function LeadUploadTab() {
  const { data, isLoading, error } = useLeadLists();
  const uploadMut = useLeadUpload();
  const deleteMut = useLeadListDelete();

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState(false);
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [listName, setListName] = useState("");
  const [fileName, setFileName] = useState("");

  const lists = data?.lists ?? [];

  const reset = () => {
    setLeads(null); setColumns([]); setListName(""); setFileName("");
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
      const cols = Object.keys(cleaned[0] ?? {});
      setLeads(cleaned);
      setColumns(cols);
      setFileName(file.name);
      setListName((prev) => prev || file.name.replace(/\.(xlsx|xls|csv)$/i, ""));
      toast.success(`${cleaned.length} Zeilen erkannt`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Datei konnte nicht gelesen werden");
    } finally {
      setParsing(false);
    }
  };

  const submit = async () => {
    if (!leads || leads.length === 0) return;
    const name = listName.trim();
    if (!name) { toast.error("Bitte einen Listennamen angeben"); return; }
    try {
      const res = await uploadMut.mutateAsync({ list_name: name, leads });
      if (!res.ok) { toast.error(res.error || "Upload fehlgeschlagen"); return; }
      toast.success(`„${name}“ hochgeladen (${res.lead_count ?? leads.length} Leads)`);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen");
    }
  };

  const removeList = async (listId: string, name: string) => {
    try {
      await deleteMut.mutateAsync(listId);
      toast.success(`„${name}“ gelöscht`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload */}
      <div className="glass-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Lead-Liste hochladen</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Excel (.xlsx) oder CSV mit deinen Leads. Die erste Zeile sollte die Spaltennamen enthalten
            (z. B. Name, Firma, Telefon). Die Liste steht danach im Co-Pilot der Vertriebler bereit.
          </p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />

        {!leads ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className="w-full flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-border rounded-lg hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            {parsing ? <Loader2 className="w-7 h-7 text-muted-foreground animate-spin" /> : <Upload className="w-7 h-7 text-muted-foreground/60" />}
            <span className="text-sm text-muted-foreground">{parsing ? "Datei wird gelesen…" : "Datei auswählen (.xlsx / .csv)"}</span>
          </button>
        ) : (
          <div className="space-y-3">
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
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="z. B. Kaltakquise Juli"
                className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
              />
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

      {/* Existing lists */}
      <div className="glass-card p-6 space-y-4">
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
          <div className="divide-y divide-border">
            {lists.map((l) => (
              <div key={l.list_id} className="flex items-center gap-3 py-2.5">
                <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{l.list_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.lead_count.toLocaleString("de-DE")} Leads
                    {l.uploaded_at && <span> · {new Date(l.uploaded_at).toLocaleDateString("de-DE")}</span>}
                    {l.uploaded_by && <span className="text-muted-foreground/60"> · {l.uploaded_by}</span>}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" title="Löschen"><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>„{l.list_name}“ löschen?</AlertDialogTitle>
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
            ))}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 border border-border rounded-md px-3 py-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>Die Datei wird im Browser gelesen — es werden nur die Zeilen an den Server übertragen. Maximal {MAX_LEADS.toLocaleString("de-DE")} Leads pro Liste.</span>
      </div>
    </div>
  );
}
