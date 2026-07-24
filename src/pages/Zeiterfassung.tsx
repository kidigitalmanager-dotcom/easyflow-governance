// -----------------------------------------------------------------------------
// Zeiterfassung.tsx (v4.132.0) — BRIEFING-ZEITERFASSUNG-MITARBEITER-2026-07-21
// Mitarbeiter (mobil-first, Baustellen-Daumen): "+ Zeit erfassen" (Kunde,
// Datum, von/bis ODER Dauer, Notiz, abrechenbar), eigene Liste + Wochensumme.
// Owner: Team-Tabelle (Filter Mitarbeiter/Kunde/Zeitraum, Summen, CSV-Export),
// Nacherfassung, billed-Einträge zurücksetzen. Übernahme in Angebot/Rechnung
// läuft über den Dialog in Rechnungen.tsx/Angebote.tsx (TimeApplyDialog).
// -----------------------------------------------------------------------------
import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  useMe, useTimeEntries, useCreateTimeEntry, useUpdateTimeEntry, useDeleteTimeEntry,
  useUnbillTimeEntry, useTeamMembers, useGenerateInvoice, useApplyTimeToDocument, useBillingProfile,
  useTimeProjects, useCreateTimeProject, useUpdateTimeProject, useDeleteTimeProject, useAbsences,
} from "@/hooks/use-api";
import type { TimeEntry, TimeEntryInput, TimeProject } from "@/lib/api-client";
import { MitarbeiterAbrechnungPdf } from "@/components/documents/MitarbeiterAbrechnungPdf";
import { AbsencePanel } from "@/components/absence/AbsencePanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Clock, Plus, Trash2, Loader2, Pencil, RotateCcw, Download, Lock, Users, ReceiptText, FileText, Wallet, Check, AlertTriangle, FolderKanban, Archive, ArrowUp, ArrowDown, Sheet } from "lucide-react";

function todayIso(): string { return new Date().toISOString().slice(0, 10); }
function isoDaysAgo(days: number): string { return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10); }
function fmtMin(min: number | null | undefined): string {
  const m = Number(min) || 0;
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, "0")} h`;
}
function fmtDay(ts: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ts || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ts;
}
function fmtTime(ts: string): string {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
function fmtCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

const DUR_CHIPS = [30, 60, 90, 120, 240, 480];

type FormState = {
  projectId: string; // "" = Freitext/anderer Ort; sonst Projekt-ID als String
  customer: string; date: string; mode: "vonbis" | "dauer";
  from: string; to: string; durationMin: string;
  note: string; billable: boolean; memberEmail: string;
};
const EMPTY_FORM: FormState = { projectId: "", customer: "", date: todayIso(), mode: "vonbis", from: "", to: "", durationMin: "60", note: "", billable: true, memberEmail: "" };

// ── Erfassungs-Formular (Mitarbeiter + Owner-Nacherfassung) ──────────────────
function EntryForm({ customers, projects, isOwner, isEmployee, memberOptions, editEntry, onDone }: {
  customers: string[]; projects: TimeProject[]; isOwner: boolean; isEmployee: boolean;
  memberOptions: { email: string; name: string }[];
  editEntry: TimeEntry | null; onDone: () => void;
}) {
  const create = useCreateTimeEntry();
  const update = useUpdateTimeEntry();
  const [f, setF] = useState<FormState>(() => {
    if (!editEntry) return EMPTY_FORM;
    return {
      projectId: editEntry.project_id ? String(editEntry.project_id) : "",
      customer: editEntry.customer_name || "",
      date: (editEntry.started_at || "").slice(0, 10),
      mode: "vonbis",
      from: fmtTime(editEntry.started_at), to: fmtTime(editEntry.ended_at),
      durationMin: String(editEntry.duration_min),
      note: editEntry.description || "", billable: editEntry.billable, memberEmail: editEntry.member_email,
    };
  });
  const [savedId, setSavedId] = useState<number | null>(editEntry ? editEntry.id : null);
  const [saveState, setSaveState] = useState<{ status: "idle" | "saving" | "saved" | "error"; at?: string; msg?: string }>({ status: "idle" });
  const busy = create.isPending || update.isPending;
  // Auto-Save gilt fuer den Mitarbeiter (dessen "keine Fehler"-Flow) und beim
  // Bearbeiten. Owner-Nacherfassung bleibt bewusst Button-gesteuert (kein
  // versehentlicher Selbst-Eintrag). Der Speichern-Button bleibt immer als Backup.
  const autoSaveEnabled = isEmployee || !!editEntry;

  const fRef = useRef(f); fRef.current = f;
  const savedIdRef = useRef(savedId); savedIdRef.current = savedId;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSigRef = useRef<string>("");
  const flushingRef = useRef(false);
  const ratedHintRef = useRef(false);

  // Baut die Payload NUR, wenn der Eintrag sinnvoll persistierbar ist (Datum +
  // gueltige Zeiten). Projekt gewaehlt -> Server-Snapshot ueberschreibt Kunde;
  // sonst Freitext-Kunde (Fallback "anderer Ort"). Beim Bearbeiten loest ein
  // leeres Projekt die Bindung (project_id: null).
  function buildPayload(s: FormState): { ok: true; body: TimeEntryInput } | { ok: false; error?: string } {
    if (!s.date) return { ok: false, error: "Bitte ein Datum wählen." };
    const body: TimeEntryInput = { description: s.note.trim() || undefined, billable: s.billable };
    if (s.projectId) body.project_id = Number(s.projectId);
    else { body.customer_name = s.customer.trim() || undefined; if (editEntry) body.project_id = null; }
    if (isOwner && !editEntry && s.memberEmail) body.member_email = s.memberEmail;
    if (s.mode === "vonbis") {
      if (!s.from || !s.to) return { ok: false };
      const start = new Date(`${s.date}T${s.from}:00`);
      const end = new Date(`${s.date}T${s.to}:00`);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return { ok: false };
      body.started_at = start.toISOString(); body.ended_at = end.toISOString();
    } else {
      const dur = parseInt(s.durationMin, 10);
      if (!Number.isFinite(dur) || dur <= 0) return { ok: false };
      body.date = s.date; body.duration_min = dur;
    }
    return { ok: true, body };
  }

  const persist = buildPayload(f);
  const signature = persist.ok ? JSON.stringify(persist.body) : "";

  async function flush(): Promise<boolean> {
    const p = buildPayload(fRef.current);
    if (!p.ok) return false;
    const sig = JSON.stringify(p.body);
    if (sig === lastSigRef.current && savedIdRef.current != null && saveState.status !== "error") return true;
    if (flushingRef.current) return false;
    flushingRef.current = true;
    setSaveState({ status: "saving" });
    let ok2 = false;
    try {
      let res: { ok: boolean; entry?: TimeEntry; error?: string; rate_missing?: boolean };
      if (savedIdRef.current == null) {
        res = await create.mutateAsync(p.body);
        if (res.ok && res.entry) { setSavedId(res.entry.id); savedIdRef.current = res.entry.id; }
        if (res.ok && res.rate_missing && !ratedHintRef.current) {
          ratedHintRef.current = true;
          toast.message("Zeit erfasst — noch ohne Stundensatz.", { description: "Der Chef hinterlegt Stundensätze unter Einstellungen → Mitarbeiter." });
        }
      } else {
        res = await update.mutateAsync({ id: savedIdRef.current, ...p.body });
      }
      if (!res.ok) { setSaveState({ status: "error", msg: res.error || "Speichern fehlgeschlagen." }); }
      else {
        lastSigRef.current = sig;
        setSaveState({ status: "saved", at: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) });
        ok2 = true;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setSaveState({ status: "error", msg: msg.includes("409") ? "Bereits abgerechnet — nicht mehr änderbar." : "Nicht gespeichert. Bitte erneut versuchen." });
    }
    flushingRef.current = false;
    // Nachzuegler: hat sich waehrend des Speicherns etwas geaendert? -> erneut
    // (nur nach Erfolg, damit ein echter Fehler keine Endlosschleife ausloest).
    if (ok2) {
      const latest = buildPayload(fRef.current);
      if (latest.ok && JSON.stringify(latest.body) !== lastSigRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { flush(); }, 400);
      }
    }
    return ok2;
  }

  // Auto-Save: debounced (~800 ms) bei jeder sinnvollen Aenderung.
  useEffect(() => {
    if (!autoSaveEnabled || !signature || signature === lastSigRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { flush(); }, 800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, autoSaveEnabled]);

  // Letzter Flush beim Verlassen (Zeile/Seite) — kein stiller Verlust.
  useEffect(() => {
    return () => {
      if (!autoSaveEnabled) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      const p = buildPayload(fRef.current);
      if (p.ok && JSON.stringify(p.body) !== lastSigRef.current) { flush(); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Speichern-Button (Backup + Owner-Nacherfassung): validieren, flushen, schliessen.
  async function submitButton() {
    const p = buildPayload(fRef.current);
    if (!p.ok) { toast.error((p as { error?: string }).error || "Bitte Datum und Zeiten prüfen (Von/Bis oder Dauer)."); return; }
    const ok = await flush();
    if (ok) { toast.success(editEntry ? "Eintrag gespeichert." : "Zeit gespeichert."); onDone(); }
  }

  function onCardBlur() {
    if (!autoSaveEnabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    flush();
  }

  return (
    <Card onBlur={onCardBlur}>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
        <Plus className="h-4 w-4" /> {editEntry ? "Eintrag bearbeiten" : "Zeit erfassen"}
      </CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isOwner && !editEntry && memberOptions.length > 0 && (
          <div>
            <Label className="text-xs">Mitarbeiter (Nacherfassung)</Label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={f.memberEmail}
              onChange={(e) => setF({ ...f, memberEmail: e.target.value })}>
              <option value="">— bitte wählen —</option>
              {memberOptions.map((m) => <option key={m.email} value={m.email}>{m.name}</option>)}
            </select>
          </div>
        )}
        {projects.length > 0 && (
          <div>
            <Label className="text-xs">Projekt</Label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={f.projectId}
              onChange={(e) => setF({ ...f, projectId: e.target.value })}>
              <option value="">— anderer Ort (Freitext) —</option>
              {projects.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            </select>
          </div>
        )}
        {!f.projectId && (
          <div>
            <Label className="text-xs">{projects.length > 0 ? "Kunde / Ort (Freitext)" : "Kunde"}</Label>
            <Input list="ue-time-customers" value={f.customer} placeholder="z. B. Familie Müller"
              onChange={(e) => setF({ ...f, customer: e.target.value })} className="h-10" />
            <datalist id="ue-time-customers">
              {customers.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
        )}
        <div>
          <Label className="text-xs">Datum</Label>
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="h-10" />
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={f.mode === "vonbis" ? "default" : "outline"} className="flex-1" onClick={() => setF({ ...f, mode: "vonbis" })}>Von – Bis</Button>
          <Button type="button" size="sm" variant={f.mode === "dauer" ? "default" : "outline"} className="flex-1" onClick={() => setF({ ...f, mode: "dauer" })}>Nur Dauer</Button>
        </div>
        {f.mode === "vonbis" ? (
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Von</Label><Input type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="h-10" /></div>
            <div><Label className="text-xs">Bis</Label><Input type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="h-10" /></div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label className="text-xs">Dauer (Minuten)</Label>
            <Input type="number" min={1} max={1440} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} className="h-10" />
            <div className="flex flex-wrap gap-1.5">
              {DUR_CHIPS.map((m) => (
                <button key={m} type="button" onClick={() => setF({ ...f, durationMin: String(m) })}
                  className={`px-2.5 py-1.5 rounded-full border text-xs ${f.durationMin === String(m) ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
                  {fmtMin(m)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <Label className="text-xs">Notiz (was wurde gemacht?)</Label>
          <Textarea value={f.note} rows={2} placeholder="z. B. Eckventil getauscht, Silikonfugen"
            onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <span className="text-sm">An Kunden abrechenbar</span>
          <Switch checked={f.billable} onCheckedChange={(v) => setF({ ...f, billable: v })} />
        </div>
        {autoSaveEnabled && (
          <div className="flex items-center gap-2 text-xs min-h-[20px]">
            {saveState.status === "saving" && <span className="text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Speichert…</span>}
            {saveState.status === "saved" && <span className="text-emerald-600 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Gespeichert {saveState.at}</span>}
            {saveState.status === "error" && (
              <span className="text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {saveState.msg}
                <button type="button" className="underline font-medium" onClick={() => flush()}>Erneut speichern</button>
              </span>
            )}
            {saveState.status === "idle" && <span className="text-muted-foreground">Wird beim Ausfüllen automatisch gespeichert.</span>}
          </div>
        )}
        <div className="flex gap-2">
          {editEntry && <Button variant="outline" className="flex-1 h-11" onClick={onDone}>Schließen</Button>}
          <Button className="flex-1 h-11 text-base" onClick={submitButton} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
            {editEntry ? "Speichern & schließen" : "Zeit speichern"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Eintrags-Zeile ────────────────────────────────────────────────────────────
function EntryRow({ e, isOwner, memberName, onEdit, onDelete, onUnbill }: {
  e: TimeEntry; isOwner: boolean; memberName?: string;
  onEdit: (e: TimeEntry) => void; onDelete: (e: TimeEntry) => void; onUnbill?: (e: TimeEntry) => void;
}) {
  const billed = e.status === "billed";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{e.customer_name || "(ohne Kunde)"}</span>
          {billed ? (
            <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="h-3 w-3" /> abgerechnet</Badge>
          ) : !e.billable ? (
            <Badge variant="outline" className="text-[10px]">nicht abrechenbar</Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {fmtDay(e.started_at)} · {fmtMin(e.duration_min)}
          {isOwner && memberName ? " · " + memberName : ""}
          {isOwner && e.hourly_rate_cents != null ? " · " + fmtCents(e.hourly_rate_cents) + "/Std" : isOwner ? " · Satz offen" : ""}
          {e.description ? " · " + e.description : ""}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-1">
        {!billed && (
          <>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onEdit(e)} title="Bearbeiten"><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => onDelete(e)} title="Löschen"><Trash2 className="h-4 w-4" /></Button>
          </>
        )}
        {billed && isOwner && onUnbill && (
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onUnbill(e)} title="Abrechnung zurücksetzen (Eintrag wird wieder offen)">
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> zurücksetzen
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Projekt-Verwaltung (Owner): anlegen / umbenennen / archivieren / sortieren ──
function ProjekteVerwaltung() {
  const projectsQ = useTimeProjects({}, true); // owner: alle inkl. archiviert (mit Flag)
  const createP = useCreateTimeProject();
  const updateP = useUpdateTimeProject();
  const deleteP = useDeleteTimeProject();
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const items = projectsQ.data?.items || [];
  const active = items.filter((p) => !p.archived);
  const archived = items.filter((p) => p.archived);

  async function addProject() {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await createP.mutateAsync({ name });
      if (!res.ok) { toast.error(res.error === "projects_migration_missing" ? "Projekte sind noch nicht freigeschaltet (Migration ausstehend)." : "Anlegen fehlgeschlagen."); return; }
      toast.success(`Projekt „${name}" angelegt.`);
      setNewName("");
    } catch { toast.error("Anlegen fehlgeschlagen."); }
  }
  async function rename(id: number) {
    const name = editName.trim();
    if (!name) { setEditId(null); return; }
    try {
      const res = await updateP.mutateAsync({ id, name });
      if (!res.ok) { toast.error(res.error === "name_exists" ? "Ein Projekt mit diesem Namen existiert schon." : "Umbenennen fehlgeschlagen."); return; }
      toast.success("Projekt umbenannt (alte Einträge bleiben unverändert).");
      setEditId(null);
    } catch { toast.error("Umbenennen fehlgeschlagen."); }
  }
  async function archive(p: TimeProject) {
    try {
      const res = await deleteP.mutateAsync({ id: p.id });
      if (!res.ok) { toast.error("Archivieren fehlgeschlagen."); return; }
      toast.message(`„${p.name}" archiviert.`, { description: "Verschwindet aus dem Mitarbeiter-Dropdown. Erfasste Zeiten bleiben erhalten." });
    } catch { toast.error("Archivieren fehlgeschlagen."); }
  }
  async function reactivate(p: TimeProject) {
    try {
      const res = await updateP.mutateAsync({ id: p.id, active: true });
      if (!res.ok) { toast.error("Reaktivieren fehlgeschlagen."); return; }
      toast.success(`„${p.name}" ist wieder aktiv.`);
    } catch { toast.error("Reaktivieren fehlgeschlagen."); }
  }
  async function move(idx: number, dir: -1 | 1) {
    const a = active[idx], b = active[idx + dir];
    if (!a || !b) return;
    const aOrder = a.sort_order ?? idx, bOrder = b.sort_order ?? (idx + dir);
    try {
      await updateP.mutateAsync({ id: a.id, sort_order: bOrder });
      await updateP.mutateAsync({ id: b.id, sort_order: aOrder });
    } catch { toast.error("Sortieren fehlgeschlagen."); }
  }

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
        <FolderKanban className="h-4 w-4" /> Projekte — für den Ein-Klick-Dropdown deiner Mitarbeiter
      </CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={newName} placeholder="Neues Projekt, z. B. Familie Müller / Baustelle Hauptstraße"
            onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addProject(); }} className="h-10" />
          <Button className="h-10 shrink-0" onClick={addProject} disabled={createP.isPending || !newName.trim()}>
            {createP.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Anlegen
          </Button>
        </div>

        {projectsQ.isLoading && <Skeleton className="h-12 w-full" />}
        {!projectsQ.isLoading && items.length === 0 && (
          <p className="text-sm text-muted-foreground py-1">Noch keine Projekte. Leg oben das erste an — deine Mitarbeiter wählen es dann per Klick statt frei zu tippen.</p>
        )}

        {active.map((p, idx) => (
          <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
            {editId === p.id ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Input value={editName} autoFocus onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") rename(p.id); if (e.key === "Escape") setEditId(null); }} className="h-9" />
                <Button size="sm" className="h-9 shrink-0" onClick={() => rename(p.id)} disabled={updateP.isPending}>Speichern</Button>
                <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={() => setEditId(null)}>Abbrechen</Button>
              </div>
            ) : (
              <>
                <span className="font-medium text-sm truncate">{p.name}</span>
                <div className="shrink-0 flex items-center gap-0.5">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Nach oben" disabled={idx === 0 || updateP.isPending} onClick={() => move(idx, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Nach unten" disabled={idx === active.length - 1 || updateP.isPending} onClick={() => move(idx, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Umbenennen" onClick={() => { setEditId(p.id); setEditName(p.name); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" title="Archivieren" onClick={() => archive(p)}><Archive className="h-4 w-4" /></Button>
                </div>
              </>
            )}
          </div>
        ))}

        {archived.length > 0 && (
          <div className="pt-1">
            <p className="text-[11px] text-muted-foreground mb-1">Archiviert ({archived.length}) — aus dem Dropdown ausgeblendet:</p>
            <div className="space-y-1.5">
              {archived.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-2 opacity-70">
                  <span className="text-sm truncate flex items-center gap-1.5"><Archive className="h-3.5 w-3.5" /> {p.name}</span>
                  <Button variant="ghost" size="sm" className="h-8 px-2 shrink-0" onClick={() => reactivate(p)} title="Wieder aktiv schalten"><RotateCcw className="mr-1 h-3.5 w-3.5" /> Reaktivieren</Button>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground pt-1">
          Umbenennen oder Archivieren ändert bereits erfasste Zeiten nicht (der Projektname wird beim Eintrag gespeichert). So bleiben alte Abrechnungen stabil.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Hauptseite ────────────────────────────────────────────────────────────────
export default function Zeiterfassung() {
  const me = useMe();
  const isEmployee = (me.data as { role?: string } | undefined)?.role === "employee";
  const isOwner = !isEmployee;

  // v4.140.0 — Abwesenheit (Urlaub/Krank): Umschalter + Badge-Zaehler (Owner).
  // Die Listen teilen sich den react-query-Cache mit dem AbsencePanel (gleicher
  // queryKey), also keine doppelten Requests.
  const [absView, setAbsView] = useState<"zeiten" | "urlaub" | "krank">("zeiten");
  const absVacList = useAbsences({ type: "vacation" }, isOwner && !me.isLoading);
  const absSickList = useAbsences({ type: "sick" }, isOwner && !me.isLoading);
  const pendingVacCount = (absVacList.data?.items || []).filter((a) => a.status === "pending").length;
  const reportedSickCount = (absSickList.data?.items || []).filter((a) => a.status === "reported").length;

  const [range, setRange] = useState<"week" | "month" | "all">("week");
  const [fltMember, setFltMember] = useState("");
  const [fltCustomer, setFltCustomer] = useState("");
  const [fltStatus, setFltStatus] = useState<"" | "open" | "billed">("");
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [formKey, setFormKey] = useState(0);

  const from = range === "week" ? isoDaysAgo(7) : range === "month" ? isoDaysAgo(31) : undefined;
  const params = useMemo(() => ({
    from,
    customer: isOwner && fltCustomer.trim() ? fltCustomer.trim() : undefined,
    member: isOwner && fltMember ? fltMember : undefined,
    status: fltStatus || undefined,
  }), [from, isOwner, fltCustomer, fltMember, fltStatus]);

  const entries = useTimeEntries(params, !me.isLoading);
  const team = useTeamMembers(isOwner);
  const projectsActive = useTimeProjects({ active: true }, !me.isLoading); // fuer den One-Click-Dropdown (employee + owner-Nacherfassung)
  const del = useDeleteTimeEntry();
  const unbill = useUnbillTimeEntry();

  // v4.132.0 Owner-Umbau (Leon 22.07. abends): Owner-Sicht = Übersicht + Abrechnung.
  // Alle OFFENEN abrechenbaren Zeiten je Kunde, mit Ein-Klick "Rechnung aus Zeiten".
  const navigate = useNavigate();
  const genInv = useGenerateInvoice();
  const applyTime = useApplyTimeToDocument();
  const openEntries = useTimeEntries({ status: "open" }, isOwner && !me.isLoading);
  const [showCapture, setShowCapture] = useState(false);
  const [billingBusy, setBillingBusy] = useState<string | null>(null);
  const byCustomer = useMemo(() => {
    const map = new Map<string, { minutes: number; count: number; valueCents: number; ids: number[]; noRate: number }>();
    for (const e of openEntries.data?.items || []) {
      if (!e.billable) continue;
      const k = e.customer_name || "(ohne Kunde)";
      const g = map.get(k) || { minutes: 0, count: 0, valueCents: 0, ids: [], noRate: 0 };
      g.minutes += e.duration_min; g.count += 1; g.ids.push(e.id);
      if (e.hourly_rate_cents != null) g.valueCents += Math.round(e.duration_min * e.hourly_rate_cents / 60);
      else g.noRate += 1;
      map.set(k, g);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].minutes - a[1].minutes);
  }, [openEntries.data]);

  // v4.133.0 — Mitarbeiter-Abrechnung (Lohnsatz): Mitarbeiter + Zeitraum → PDF/CSV.
  const billing = useBillingProfile();
  const [settlMember, setSettlMember] = useState("");
  const [settlRange, setSettlRange] = useState<"month" | "week" | "all">("month");
  const [showSettlPdf, setShowSettlPdf] = useState(false);
  const settlFrom = settlRange === "week" ? isoDaysAgo(7) : settlRange === "month" ? isoDaysAgo(31) : undefined;
  const settlEntriesQ = useTimeEntries({ member: settlMember || undefined, from: settlFrom }, isOwner && !!settlMember);
  const settlEntries = useMemo(() => settlMember ? (settlEntriesQ.data?.items || []) : [], [settlEntriesQ.data, settlMember]);
  const settlMemberObj = (team.data?.members || []).find((m) => m.email === settlMember) || null;
  const settlFallbackCost = settlMemberObj?.cost_rate_cents ?? team.data?.settings?.default_cost_rate_cents ?? null;
  const settlCostOf = (e: TimeEntry) => e.cost_rate_cents != null ? e.cost_rate_cents : (settlFallbackCost != null ? settlFallbackCost : null);
  const settlMin = settlEntries.reduce((s, e) => s + e.duration_min, 0);
  const settlCents = settlEntries.reduce((s, e) => { const c = settlCostOf(e); return s + (c != null ? Math.round(e.duration_min / 60 * c) : 0); }, 0);
  const settlNoRate = settlEntries.filter((e) => settlCostOf(e) == null).length;
  const settlName = settlMemberObj?.display_name || settlMember;
  const settlRangeLabel = settlRange === "week" ? "letzte 7 Tage" : settlRange === "month" ? "letzte 31 Tage" : "gesamt";

  function exportSettlementCsv() {
    const head = ["Datum", "Kunde", "Tätigkeit", "Dauer (min)", "Stunden", "Lohnsatz (EUR/Std)", "Betrag (EUR)"];
    const rows = [...settlEntries].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at))).map((e) => {
      const c = settlCostOf(e);
      return [
        fmtDay(e.started_at), e.customer_name || "", (e.description || "").replace(/[\r\n;]+/g, " "),
        String(e.duration_min), (Math.round(e.duration_min / 60 * 100) / 100).toString().replace(".", ","),
        c != null ? (c / 100).toFixed(2).replace(".", ",") : "",
        c != null ? (Math.round(e.duration_min / 60 * c) / 100).toFixed(2).replace(".", ",") : "",
      ];
    });
    const foot = ["Summe", "", "", String(settlMin), (Math.round(settlMin / 60 * 100) / 100).toString().replace(".", ","), "", (settlCents / 100).toFixed(2).replace(".", ",")];
    const csv = [head, ...rows, foot].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lohnabrechnung-${(settlName || "mitarbeiter").replace(/[^a-z0-9]+/gi, "_")}-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // v4.137.0 — echte Excel-Datei (xlsx) fuer den Steuerberater, zusaetzlich zu PDF/CSV.
  function exportSettlementXlsx() {
    const head = ["Datum", "Kunde/Projekt", "Tätigkeit", "Dauer (min)", "Stunden", "Lohnsatz (EUR/Std)", "Betrag (EUR)"];
    const body = [...settlEntries].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at))).map((e) => {
      const c = settlCostOf(e);
      return [
        fmtDay(e.started_at), e.customer_name || "", (e.description || "").replace(/[\r\n]+/g, " "),
        e.duration_min, Math.round(e.duration_min / 60 * 100) / 100,
        c != null ? Math.round(c) / 100 : "", c != null ? Math.round(e.duration_min / 60 * c) / 100 : "",
      ];
    });
    const foot = ["Summe", "", "", settlMin, Math.round(settlMin / 60 * 100) / 100, "", Math.round(settlCents) / 100];
    const ws = XLSX.utils.aoa_to_sheet([[`Lohnabrechnung ${settlName} — ${settlRangeLabel}`], [], head, ...body, foot]);
    ws["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 32 }, { wch: 11 }, { wch: 9 }, { wch: 16 }, { wch: 13 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lohnabrechnung");
    XLSX.writeFile(wb, `lohnabrechnung-${(settlName || "mitarbeiter").replace(/[^a-z0-9]+/gi, "_")}-${todayIso()}.xlsx`);
  }

  async function billCustomer(kunde: string, ids: number[]) {
    setBillingBusy(kunde);
    try {
      const inv = await genInv.mutateAsync({
        counterpart_name: kunde === "(ohne Kunde)" ? undefined : kunde,
        subject: "Rechnung" + (kunde !== "(ohne Kunde)" ? " für " + kunde : ""),
      });
      if ((inv as { skipped?: unknown }).skipped) { toast.error("Rechnungen sind noch nicht aktiviert (Feature/Postfach)."); return; }
      if (!inv.ok || !inv.document_id) { toast.error("Rechnung konnte nicht erstellt werden."); return; }
      const res = await applyTime.mutateAsync({ document_id: inv.document_id, entry_ids: ids, gruppierung: "je_eintrag" });
      if (!res.ok) { toast.error("Zeiten-Übernahme fehlgeschlagen: " + (res.error || "")); return; }
      toast.success(`Rechnungsentwurf mit ${res.added_positions} Position(en) erstellt — Einträge sind jetzt „abgerechnet".`);
      if ((res.entries_without_rate || 0) > 0) {
        toast.message("Einträge ohne Stundensatz dabei", { description: "Preis im Rechnungs-Editor bitte eintragen (Positionen sind offen)." });
      }
      navigate("/rechnungen");
    } catch { toast.error("Rechnung aus Zeiten fehlgeschlagen."); }
    finally { setBillingBusy(null); }
  }

  const memberOptions = (team.data?.members || []).filter((m) => m.active).map((m) => ({ email: m.email, name: m.display_name || m.email }));
  const nameByEmail = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of team.data?.members || []) map[m.email] = m.display_name || m.email;
    return map;
  }, [team.data]);

  const items = entries.data?.items || [];
  const totals = entries.data?.totals;
  const knownAmountCents = useMemo(() => items.reduce((s, e) => s + (e.hourly_rate_cents != null ? Math.round(e.duration_min * e.hourly_rate_cents / 60) : 0), 0), [items]);

  async function handleDelete(e: TimeEntry) {
    try {
      const res = await del.mutateAsync(e.id);
      if (!res.ok) { toast.error("Löschen fehlgeschlagen."); return; }
      toast.success("Eintrag gelöscht.");
    } catch { toast.error("Löschen fehlgeschlagen (bereits abgerechnet?)."); }
  }
  async function handleUnbill(e: TimeEntry) {
    try {
      const res = await unbill.mutateAsync(e.id);
      if (!res.ok) { toast.error("Zurücksetzen fehlgeschlagen."); return; }
      toast.message("Eintrag ist wieder offen.", { description: res.hint });
    } catch { toast.error("Zurücksetzen fehlgeschlagen."); }
  }
  function exportCsv() {
    const head = ["Datum", "Mitarbeiter", "Kunde", "Dauer (min)", "Stunden", "Satz (EUR/Std)", "Abrechenbar", "Status", "Notiz"];
    const rows = items.map((e) => [
      fmtDay(e.started_at), nameByEmail[e.member_email] || e.member_email, e.customer_name || "",
      String(e.duration_min), (Math.round((e.duration_min / 60) * 100) / 100).toString().replace(".", ","),
      e.hourly_rate_cents != null ? (e.hourly_rate_cents / 100).toFixed(2).replace(".", ",") : "",
      e.billable ? "ja" : "nein", e.status === "billed" ? "abgerechnet" : "offen", (e.description || "").replace(/[\r\n;]+/g, " "),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `zeiterfassung-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (me.isLoading) {
    return <div className="p-4 space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>;
  }

  return (
    <div className={isEmployee ? "space-y-4" : "p-4 sm:p-6 space-y-4 max-w-5xl"}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Clock className="h-5 w-5" /> Zeiterfassung</h1>
          <p className="text-sm text-muted-foreground">
            {isEmployee
              ? "Trag ein, wo du warst und wie lange — dein Chef übernimmt die Zeiten in die Abrechnung."
              : "Wer war wann wo — und mit einem Klick als Rechnung abgerechnet."}
          </p>
        </div>
        {isOwner && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!items.length}><Download className="mr-1 h-4 w-4" /> CSV</Button>
          </div>
        )}
      </div>

      {/* v4.140.0 — Umschalter Zeiten / Urlaub / Krank (Mitarbeiter + Owner) */}
      <div className="flex rounded-lg border overflow-hidden w-fit">
        {([["zeiten", "Zeiten"], ["urlaub", "Urlaub"], ["krank", "Krank"]] as const).map(([v, l]) => {
          const badge = isOwner ? (v === "urlaub" ? pendingVacCount : v === "krank" ? reportedSickCount : 0) : 0;
          return (
            <button key={v} onClick={() => setAbsView(v)}
              className={`px-3 py-1.5 text-xs flex items-center gap-1.5 ${absView === v ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}>
              {l}
              {badge > 0 && <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] h-4 min-w-[16px] px-1">{badge}</span>}
            </button>
          );
        })}
      </div>

      {absView === "urlaub" && <AbsencePanel isOwner={isOwner} kind="vacation" />}
      {absView === "krank" && <AbsencePanel isOwner={isOwner} kind="sick" />}

      {absView === "zeiten" && (<>
      {/* Summen-Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border p-3"><p className="text-[11px] text-muted-foreground">Diese Woche</p><p className="text-lg font-semibold">{fmtMin(totals?.week_min)}</p></div>
        <div className="rounded-lg border p-3"><p className="text-[11px] text-muted-foreground">Dieser Monat</p><p className="text-lg font-semibold">{fmtMin(totals?.month_min)}</p></div>
        <div className="rounded-lg border p-3"><p className="text-[11px] text-muted-foreground">Offen abrechenbar</p><p className="text-lg font-semibold">{fmtMin(totals?.open_billable_min)}</p></div>
        {isOwner ? (
          <div className="rounded-lg border p-3"><p className="text-[11px] text-muted-foreground">Wert (bekannte Sätze)</p><p className="text-lg font-semibold">{fmtCents(knownAmountCents)}</p></div>
        ) : (
          <div className="rounded-lg border p-3"><p className="text-[11px] text-muted-foreground">Im Zeitraum</p><p className="text-lg font-semibold">{fmtMin(totals?.scope_min)}</p></div>
        )}
      </div>

      {/* v4.132.0 Owner-Umbau: Abrechnung zuerst — offene Zeiten je Kunde mit
          Ein-Klick "Rechnung aus Zeiten" (erstellt Entwurf + übernimmt Einträge). */}
      {isOwner && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
            <ReceiptText className="h-4 w-4" /> Offene Zeiten je Kunde — bereit zur Abrechnung
          </CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {openEntries.isLoading && <Skeleton className="h-12 w-full" />}
            {!openEntries.isLoading && byCustomer.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                Keine offenen, abrechenbaren Zeiten. Sobald dein Team Zeiten erfasst, kannst du sie hier pro Kunde abrechnen.
              </p>
            )}
            {byCustomer.map(([kunde, g]) => (
              <div key={kunde} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <span className="font-medium text-sm truncate">{kunde}</span>
                  <p className="text-xs text-muted-foreground">
                    {g.count} Einsatz/Einsätze · {fmtMin(g.minutes)}{g.valueCents > 0 ? " · " + fmtCents(g.valueCents) + " netto" : ""}
                    {g.noRate > 0 ? ` · ${g.noRate}× Satz offen` : ""}
                  </p>
                </div>
                <Button size="sm" className="shrink-0" disabled={billingBusy != null}
                  onClick={() => billCustomer(kunde, g.ids)}
                  title="Erstellt einen Rechnungsentwurf und übernimmt alle offenen Zeiten dieses Kunden (Stunden × Satz)">
                  {billingBusy === kunde ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ReceiptText className="mr-1 h-4 w-4" />}
                  Rechnung aus Zeiten
                </Button>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground pt-1">
              Alternativ in einem bestehenden Angebots-/Rechnungs-Entwurf: „Offene Zeiten übernehmen“ (mit Auswahl &amp; Gruppierung).
            </p>
          </CardContent>
        </Card>
      )}

      {/* v4.133.0 — Mitarbeiter-Abrechnung (Lohnsatz): pro Mitarbeiter, als PDF/CSV */}
      {isOwner && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Mitarbeiter-Abrechnung — was du dem Mitarbeiter zahlst
          </CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <Label className="text-xs">Mitarbeiter</Label>
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[200px]" value={settlMember}
                  onChange={(e) => setSettlMember(e.target.value)}>
                  <option value="">— bitte wählen —</option>
                  {(team.data?.members || []).filter((m) => m.active).map((m) => (
                    <option key={m.email} value={m.email}>{m.display_name || m.email}</option>
                  ))}
                </select>
              </div>
              <div className="flex rounded-lg border overflow-hidden h-9">
                {(["month", "week", "all"] as const).map((r) => (
                  <button key={r} onClick={() => setSettlRange(r)}
                    className={`px-3 text-xs ${settlRange === r ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}>
                    {r === "month" ? "31 Tage" : r === "week" ? "7 Tage" : "Alle"}
                  </button>
                ))}
              </div>
            </div>

            {!settlMember && (
              <p className="text-sm text-muted-foreground py-2">Wähle einen Mitarbeiter, um seine Stunden als Lohn-Abrechnung (PDF/CSV) zu erstellen.</p>
            )}
            {settlMember && settlEntriesQ.isLoading && <Skeleton className="h-12 w-full" />}
            {settlMember && !settlEntriesQ.isLoading && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="rounded-lg border p-3"><p className="text-[11px] text-muted-foreground">Einsätze</p><p className="text-lg font-semibold">{settlEntries.length}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-[11px] text-muted-foreground">Stunden</p><p className="text-lg font-semibold">{fmtMin(settlMin)}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-[11px] text-muted-foreground">Lohnsumme</p><p className="text-lg font-semibold">{fmtCents(settlCents)}</p></div>
                </div>
                {settlNoRate > 0 && (
                  <p className="text-xs text-amber-600 flex items-start gap-1.5">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {settlNoRate}× ohne Lohnsatz — nicht in der Summe. Lohnsatz unter Einstellungen → Mitarbeiter pflegen (gilt für neue Einträge).
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setShowSettlPdf(true)} disabled={settlEntries.length === 0}>
                    <FileText className="mr-1 h-4 w-4" /> Als PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportSettlementXlsx} disabled={settlEntries.length === 0}>
                    <Sheet className="mr-1 h-4 w-4" /> Excel
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportSettlementCsv} disabled={settlEntries.length === 0}>
                    <Download className="mr-1 h-4 w-4" /> CSV
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Nutzt den <b>Lohnsatz</b> (getrennt vom Kunden-Abrechnungssatz). Interne Abrechnungsgrundlage — keine steuerliche Lohnabrechnung.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {showSettlPdf && settlMember && (
        <MitarbeiterAbrechnungPdf
          memberName={settlName}
          memberEmail={settlMember}
          entries={settlEntries}
          periodLabel={settlRangeLabel}
          seller={billing.data?.profile}
          fallbackCostCents={settlFallbackCost}
          onClose={() => setShowSettlPdf(false)}
        />
      )}

      {/* v4.137.0 — Projekte verwalten (Owner): der Chef legt sie an, der Mitarbeiter waehlt per Klick. */}
      {isOwner && <ProjekteVerwaltung />}

      {/* Erfassen: Mitarbeiter immer prominent; Owner nur zum Nacherfassen (eingeklappt). */}
      {isOwner && !showCapture && !editEntry && (
        <Button variant="outline" size="sm" className="w-fit" onClick={() => setShowCapture(true)}>
          <Plus className="mr-1 h-4 w-4" /> Zeit nacherfassen (für Mitarbeiter)
        </Button>
      )}
      {(isEmployee || showCapture || editEntry) && (
        <EntryForm key={editEntry ? "edit-" + editEntry.id : "new-" + formKey}
          customers={entries.data?.customers || []}
          projects={projectsActive.data?.items || []}
          isOwner={isOwner} isEmployee={isEmployee} memberOptions={memberOptions} editEntry={editEntry}
          onDone={() => { setEditEntry(null); setFormKey((k) => k + 1); setShowCapture(false); }} />
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border overflow-hidden">
          {(["week", "month", "all"] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs ${range === r ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}>
              {r === "week" ? "7 Tage" : r === "month" ? "31 Tage" : "Alle"}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border overflow-hidden">
          {([["", "Alle"], ["open", "Offen"], ["billed", "Abgerechnet"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFltStatus(v as "" | "open" | "billed")}
              className={`px-3 py-1.5 text-xs ${fltStatus === v ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
        {isOwner && (
          <>
            <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={fltMember} onChange={(e) => setFltMember(e.target.value)}>
              <option value="">Alle Mitarbeiter</option>
              {memberOptions.map((m) => <option key={m.email} value={m.email}>{m.name}</option>)}
            </select>
            <Input value={fltCustomer} onChange={(e) => setFltCustomer(e.target.value)} placeholder="Kunde filtern…" className="h-8 w-40 text-xs" />
          </>
        )}
      </div>

      {/* Liste */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{isEmployee ? "Meine Zeiten" : "Team-Zeiten"}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {entries.isLoading && <><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></>}
          {!entries.isLoading && items.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">
              {isEmployee ? "Noch keine Einträge im Zeitraum. Leg oben mit dem ersten los!" : "Keine Einträge im gewählten Zeitraum/Filter."}
            </p>
          )}
          {items.map((e) => (
            <EntryRow key={e.id} e={e} isOwner={isOwner} memberName={nameByEmail[e.member_email]}
              onEdit={setEditEntry} onDelete={handleDelete} onUnbill={isOwner ? handleUnbill : undefined} />
          ))}
        </CardContent>
      </Card>

      {isOwner && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Mitarbeiter anlegen &amp; Stundensätze pflegen: Einstellungen → Mitarbeiter.
          Mitarbeiter melden sich mit ihrer hinterlegten E-Mail unter app.useeasy.ai an (Kachel „Mitarbeiter“).
        </p>
      )}
      </>)}
    </div>
  );
}
