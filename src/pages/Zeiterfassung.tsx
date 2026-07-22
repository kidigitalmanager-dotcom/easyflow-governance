// -----------------------------------------------------------------------------
// Zeiterfassung.tsx (v4.132.0) — BRIEFING-ZEITERFASSUNG-MITARBEITER-2026-07-21
// Mitarbeiter (mobil-first, Baustellen-Daumen): "+ Zeit erfassen" (Kunde,
// Datum, von/bis ODER Dauer, Notiz, abrechenbar), eigene Liste + Wochensumme.
// Owner: Team-Tabelle (Filter Mitarbeiter/Kunde/Zeitraum, Summen, CSV-Export),
// Nacherfassung, billed-Einträge zurücksetzen. Übernahme in Angebot/Rechnung
// läuft über den Dialog in Rechnungen.tsx/Angebote.tsx (TimeApplyDialog).
// -----------------------------------------------------------------------------
import { useMemo, useState } from "react";
import {
  useMe, useTimeEntries, useCreateTimeEntry, useUpdateTimeEntry, useDeleteTimeEntry,
  useUnbillTimeEntry, useTeamMembers,
} from "@/hooks/use-api";
import type { TimeEntry } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Clock, Plus, Trash2, Loader2, Pencil, RotateCcw, Download, Lock, Users } from "lucide-react";

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
  customer: string; date: string; mode: "vonbis" | "dauer";
  from: string; to: string; durationMin: string;
  note: string; billable: boolean; memberEmail: string;
};
const EMPTY_FORM: FormState = { customer: "", date: todayIso(), mode: "vonbis", from: "", to: "", durationMin: "60", note: "", billable: true, memberEmail: "" };

// ── Erfassungs-Formular (Mitarbeiter + Owner-Nacherfassung) ──────────────────
function EntryForm({ customers, isOwner, memberOptions, editEntry, onDone }: {
  customers: string[]; isOwner: boolean;
  memberOptions: { email: string; name: string }[];
  editEntry: TimeEntry | null; onDone: () => void;
}) {
  const create = useCreateTimeEntry();
  const update = useUpdateTimeEntry();
  const [f, setF] = useState<FormState>(() => {
    if (!editEntry) return EMPTY_FORM;
    return {
      customer: editEntry.customer_name || "",
      date: (editEntry.started_at || "").slice(0, 10),
      mode: "vonbis",
      from: fmtTime(editEntry.started_at), to: fmtTime(editEntry.ended_at),
      durationMin: String(editEntry.duration_min),
      note: editEntry.description || "", billable: editEntry.billable, memberEmail: editEntry.member_email,
    };
  });
  const busy = create.isPending || update.isPending;

  async function submit() {
    if (!f.date) { toast.error("Bitte ein Datum wählen."); return; }
    const base: Record<string, unknown> = {
      customer_name: f.customer.trim() || undefined,
      description: f.note.trim() || undefined,
      billable: f.billable,
    };
    if (isOwner && !editEntry && f.memberEmail) base.member_email = f.memberEmail;
    if (f.mode === "vonbis") {
      if (!f.from || !f.to) { toast.error("Bitte Von- und Bis-Zeit angeben (oder auf „Dauer“ wechseln)."); return; }
      const start = new Date(`${f.date}T${f.from}:00`);
      const end = new Date(`${f.date}T${f.to}:00`);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) { toast.error("Zeitangabe ungültig."); return; }
      if (end <= start) { toast.error("Bis-Zeit muss nach der Von-Zeit liegen."); return; }
      base.started_at = start.toISOString();
      base.ended_at = end.toISOString();
    } else {
      const dur = parseInt(f.durationMin, 10);
      if (!Number.isFinite(dur) || dur <= 0) { toast.error("Bitte eine Dauer angeben."); return; }
      base.date = f.date; base.duration_min = dur;
    }
    try {
      const res = editEntry
        ? await update.mutateAsync({ id: editEntry.id, ...base })
        : await create.mutateAsync(base);
      if (!res.ok) { toast.error("Speichern fehlgeschlagen: " + (res.error || "")); return; }
      if (!editEntry && (res as { rate_missing?: boolean }).rate_missing) {
        toast.message("Zeit erfasst — noch ohne Stundensatz.", { description: "Der Chef hinterlegt Stundensätze unter Einstellungen → Team; bei der Übernahme bleibt der Preis sonst offen." });
      } else {
        toast.success(editEntry ? "Eintrag aktualisiert." : "Zeit erfasst.");
      }
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg.includes("409") ? "Eintrag ist bereits abgerechnet." : "Speichern fehlgeschlagen." + (msg ? " (" + msg + ")" : ""));
    }
  }

  return (
    <Card>
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
        <div>
          <Label className="text-xs">Kunde</Label>
          <Input list="ue-time-customers" value={f.customer} placeholder="z. B. Familie Müller"
            onChange={(e) => setF({ ...f, customer: e.target.value })} className="h-10" />
          <datalist id="ue-time-customers">
            {customers.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
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
        <div className="flex gap-2">
          {editEntry && <Button variant="outline" className="flex-1 h-11" onClick={onDone}>Abbrechen</Button>}
          <Button className="flex-1 h-11 text-base" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
            {editEntry ? "Speichern" : "Zeit speichern"}
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

// ── Hauptseite ────────────────────────────────────────────────────────────────
export default function Zeiterfassung() {
  const me = useMe();
  const isEmployee = (me.data as { role?: string } | undefined)?.role === "employee";
  const isOwner = !isEmployee;

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
  const del = useDeleteTimeEntry();
  const unbill = useUnbillTimeEntry();

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
              : "Alle Zeiten deines Teams. Übernehmen in Angebot/Rechnung: dort „Offene Zeiten übernehmen“."}
          </p>
        </div>
        {isOwner && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!items.length}><Download className="mr-1 h-4 w-4" /> CSV</Button>
          </div>
        )}
      </div>

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

      {/* Erfassen / Bearbeiten */}
      <EntryForm key={editEntry ? "edit-" + editEntry.id : "new-" + formKey}
        customers={entries.data?.customers || []}
        isOwner={isOwner} memberOptions={memberOptions} editEntry={editEntry}
        onDone={() => { setEditEntry(null); setFormKey((k) => k + 1); }} />

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
          <Users className="h-3.5 w-3.5" /> Mitarbeiter anlegen &amp; Stundensätze pflegen: Einstellungen → Team.
          Mitarbeiter melden sich mit ihrer hinterlegten E-Mail unter app.useeasy.ai an.
        </p>
      )}
    </div>
  );
}
