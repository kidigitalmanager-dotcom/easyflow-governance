// -----------------------------------------------------------------------------
// AbsencePanel.tsx (v4.140.0) — Urlaub + Krankmeldung (Lane 4)
// Mitarbeiter: Resttage + Urlaubsantrag / Krank melden + eigene Liste (Storno).
// Owner: Urlaub genehmigen/ablehnen + Urlaubskonto pflegen; Krank zur Kenntnis.
// Additiv, laeuft gegen die time-Greedy-Route (0 neue API-GW-Routen). Krank
// ohne Genehmigung/Kontingent (nur Meldung). Kein AU-Beleg-Upload in v1.
// -----------------------------------------------------------------------------
import { useMemo, useState } from "react";
import {
  useAbsences, useVacationAccount, useCreateAbsence, useDecideAbsence,
  useAcknowledgeAbsence, useCancelAbsence, useSetVacationAccount, useTeamMembers,
} from "@/hooks/use-api";
import type { Absence, AbsenceType, AbsenceStatus } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plane, Stethoscope, Check, X, Loader2, Plus, Trash2, Wallet, AlertTriangle, CalendarDays } from "lucide-react";

// ── Helfer ───────────────────────────────────────────────────────────────────
function todayIso(): string { return new Date().toISOString().slice(0, 10); }
function curYear(): number { return new Date().getFullYear(); }
function fmtDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}
function fmtRange(a: Absence): string {
  const base = a.start_date === a.end_date ? fmtDay(a.start_date) : `${fmtDay(a.start_date)} bis ${fmtDay(a.end_date)}`;
  const halves: string[] = [];
  if (a.half_day_start) halves.push("erster Tag halb");
  if (a.half_day_end && a.end_date !== a.start_date) halves.push("letzter Tag halb");
  return halves.length ? `${base} (${halves.join(", ")})` : base;
}
function fmtDays(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}
const STATUS_LABEL: Record<AbsenceStatus, string> = {
  pending: "Offen", approved: "Genehmigt", rejected: "Abgelehnt",
  cancelled: "Storniert", reported: "Gemeldet", acknowledged: "Zur Kenntnis",
};
function statusVariant(s: AbsenceStatus): "default" | "secondary" | "destructive" | "outline" {
  if (s === "approved" || s === "acknowledged") return "default";
  if (s === "rejected") return "destructive";
  if (s === "pending" || s === "reported") return "secondary";
  return "outline";
}
function absErrMsg(code?: string): string {
  switch (code) {
    case "overlap": return "Der Zeitraum ueberschneidet sich mit einem bestehenden Urlaub.";
    case "absence_migration_missing": return "Urlaub/Krank ist noch nicht freigeschaltet (Migration ausstehend).";
    case "invalid_start_date":
    case "invalid_end_date":
    case "invalid_date": return "Bitte ein gueltiges Datum waehlen.";
    case "end_before_start": return "Das Enddatum liegt vor dem Startdatum.";
    case "span_too_long": return "Der Zeitraum ist zu lang.";
    case "owner_required": return "Das kann nur der Inhaber.";
    case "not_pending": return "Der Antrag ist nicht mehr offen.";
    case "not_cancellable": return "Das laesst sich nicht mehr stornieren.";
    default: return "Aktion fehlgeschlagen. Bitte erneut versuchen.";
  }
}

// ── Antragsformular (Mitarbeiter: Urlaub beantragen / Krank melden) ──────────
function AbsenceForm({ kind }: { kind: AbsenceType }) {
  const create = useCreateAbsence();
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(todayIso());
  const [halfStart, setHalfStart] = useState(false);
  const [halfEnd, setHalfEnd] = useState(false);
  const [note, setNote] = useState("");
  const isVac = kind === "vacation";

  async function submit() {
    if (!start) { toast.error("Bitte ein Startdatum waehlen."); return; }
    const eff = end || start;
    if (eff < start) { toast.error("Das Enddatum liegt vor dem Startdatum."); return; }
    try {
      const res = await create.mutateAsync({
        type: kind, start_date: start, end_date: eff,
        half_day_start: isVac ? halfStart : false,
        half_day_end: isVac ? halfEnd : false,
        note: note.trim() || undefined,
      });
      if (!res.ok) { toast.error(absErrMsg(res.error)); return; }
      if (isVac) {
        const rest = res.vacation ? `Noch ${fmtDays(res.vacation.remaining_days)} Tage offen.` : "";
        toast.success(`Urlaubsantrag eingereicht. ${rest}`.trim());
      } else {
        toast.success("Krankmeldung ist raus. Dein Chef sieht sie sofort.");
      }
      setNote(""); setHalfStart(false); setHalfEnd(false);
    } catch {
      toast.error("Speichern fehlgeschlagen. Bitte Verbindung pruefen.");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
        {isVac ? <Plane className="h-4 w-4" /> : <Stethoscope className="h-4 w-4" />}
        {isVac ? "Urlaub beantragen" : "Krank melden"}
      </CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Von</Label>
            <Input type="date" value={start} onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value); }} />
          </div>
          <div>
            <Label className="text-xs">Bis</Label>
            <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {isVac && (
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-input" checked={halfStart} onChange={(e) => setHalfStart(e.target.checked)} />
              Erster Tag nur halb
            </label>
            {end !== start && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-input" checked={halfEnd} onChange={(e) => setHalfEnd(e.target.checked)} />
                Letzter Tag nur halb
              </label>
            )}
          </div>
        )}
        <div>
          <Label className="text-xs">Notiz (optional)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder={isVac ? "z. B. Familienurlaub" : "z. B. Erkaeltung"} />
        </div>
        {!isVac && (
          <p className="text-[11px] text-muted-foreground">
            Krankmeldung ist eine Meldung, keine Genehmigung noetig. Ein AU-Beleg ist in dieser Version noch nicht noetig.
          </p>
        )}
        <Button size="sm" onClick={submit} disabled={create.isPending}>
          {create.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
          {isVac ? "Antrag einreichen" : "Krank melden"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Eigene Liste (Mitarbeiter): Storno fuer offene/gemeldete Eintraege ───────
function OwnList({ kind }: { kind: AbsenceType }) {
  const list = useAbsences({ type: kind });
  const cancel = useCancelAbsence();
  const items = list.data?.items || [];
  const isVac = kind === "vacation";

  async function doCancel(id: number) {
    try {
      const res = await cancel.mutateAsync(id);
      if (!res.ok) { toast.error(absErrMsg(res.error)); return; }
      toast.success("Storniert.");
    } catch { toast.error("Storno fehlgeschlagen."); }
  }

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{isVac ? "Meine Urlaubsantraege" : "Meine Krankmeldungen"}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {list.isLoading && <><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></>}
        {!list.isLoading && items.length === 0 && (
          <p className="text-sm text-muted-foreground py-3">
            {isVac ? "Noch keine Urlaubsantraege." : "Noch keine Krankmeldungen."}
          </p>
        )}
        {items.map((a) => {
          const cancellable = a.status === "pending" || a.status === "reported";
          return (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{fmtRange(a)}</span>
                  <Badge variant={statusVariant(a.status)}>{STATUS_LABEL[a.status]}</Badge>
                  {isVac && a.days_count != null && <span className="text-xs text-muted-foreground">{fmtDays(a.days_count)} Tage</span>}
                </div>
                {a.note && <p className="text-xs text-muted-foreground truncate">{a.note}</p>}
                {a.status === "rejected" && a.decision_note && <p className="text-xs text-destructive">Grund: {a.decision_note}</p>}
              </div>
              {cancellable && (
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => doCancel(a.id)} disabled={cancel.isPending}>
                  <Trash2 className="mr-1 h-4 w-4" /> Stornieren
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Mitarbeiter: Urlaub (Resttage + Antrag + Liste) ──────────────────────────
function EmployeeVacation() {
  const year = curYear();
  const acc = useVacationAccount({ year });
  const a = acc.data?.account;
  const total = a ? a.annual_days + a.carried_over : null;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Mein Urlaubskonto {year}</CardTitle></CardHeader>
        <CardContent>
          {acc.isLoading ? <Skeleton className="h-10 w-40" /> : (
            <div className="flex items-end gap-3 flex-wrap">
              <p className="text-3xl font-semibold">{fmtDays(a?.remaining_days)}</p>
              <p className="text-sm text-muted-foreground pb-1">
                von {fmtDays(total)} Tagen offen{a && a.used_days > 0 ? ` · ${fmtDays(a.used_days)} genommen` : ""}
                {a && a.carried_over > 0 ? ` · inkl. ${fmtDays(a.carried_over)} Uebertrag` : ""}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <AbsenceForm kind="vacation" />
      <OwnList kind="vacation" />
    </div>
  );
}

function EmployeeSick() {
  return (
    <div className="space-y-4">
      <AbsenceForm kind="sick" />
      <OwnList kind="sick" />
    </div>
  );
}

// ── Owner: Urlaub genehmigen/ablehnen + Team-Liste + Konto-Pflege ────────────
function OwnerVacation() {
  const list = useAbsences({ type: "vacation" });
  const team = useTeamMembers(true);
  const decide = useDecideAbsence();
  const cancel = useCancelAbsence();
  const items = list.data?.items || [];
  const nameByEmail = useMemo(() => {
    const m: Record<string, string> = {};
    (team.data?.members || []).forEach((x) => { m[x.email] = x.display_name || x.email; });
    return m;
  }, [team.data]);
  const pending = items.filter((a) => a.status === "pending");
  const rest = items.filter((a) => a.status !== "pending");

  async function doDecide(id: number, action: "approve" | "reject") {
    try {
      const res = await decide.mutateAsync({ id, action });
      if (!res.ok) { toast.error(absErrMsg(res.error)); return; }
      if (action === "approve") {
        const r = res.vacation ? ` Rest: ${fmtDays(res.vacation.remaining_days)} Tage.` : "";
        if (res.overdraft) toast.warning(`Genehmigt, aber ueberbucht.${r}`);
        else toast.success(`Genehmigt.${r}`);
      } else {
        toast.success("Abgelehnt.");
      }
    } catch { toast.error("Aktion fehlgeschlagen."); }
  }
  async function freeUp(id: number) {
    try {
      const res = await cancel.mutateAsync(id);
      if (!res.ok) { toast.error(absErrMsg(res.error)); return; }
      const r = res.vacation ? ` Rest: ${fmtDays(res.vacation.remaining_days)} Tage.` : "";
      toast.success(`Urlaub storniert, Tage wieder frei.${r}`);
    } catch { toast.error("Storno fehlgeschlagen."); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
          <Plane className="h-4 w-4" /> Offene Urlaubsantraege
          {pending.length > 0 && <Badge variant="secondary">{pending.length}</Badge>}
        </CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {list.isLoading && <Skeleton className="h-12 w-full" />}
          {!list.isLoading && pending.length === 0 && <p className="text-sm text-muted-foreground py-2">Keine offenen Antraege.</p>}
          {pending.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{nameByEmail[a.member_email] || a.member_email}</p>
                <p className="text-xs text-muted-foreground">{fmtRange(a)} · {fmtDays(a.days_count)} Tage</p>
                {a.note && <p className="text-xs text-muted-foreground truncate">{a.note}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" onClick={() => doDecide(a.id, "approve")} disabled={decide.isPending}><Check className="mr-1 h-4 w-4" /> Genehmigen</Button>
                <Button size="sm" variant="outline" onClick={() => doDecide(a.id, "reject")} disabled={decide.isPending}><X className="mr-1 h-4 w-4" /> Ablehnen</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <VacationAccountCard members={(team.data?.members || []).filter((m) => m.active).map((m) => ({ email: m.email, name: m.display_name || m.email }))} />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Team-Urlaube</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!list.isLoading && rest.length === 0 && <p className="text-sm text-muted-foreground py-2">Noch keine entschiedenen Urlaube.</p>}
          {rest.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{nameByEmail[a.member_email] || a.member_email}</span>
                  <Badge variant={statusVariant(a.status)}>{STATUS_LABEL[a.status]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{fmtRange(a)} · {fmtDays(a.days_count)} Tage</p>
              </div>
              {a.status === "approved" && (
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => freeUp(a.id)} disabled={cancel.isPending}>
                  <Trash2 className="mr-1 h-4 w-4" /> Stornieren
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Owner: Urlaubskonto je Mitarbeiter pflegen (Jahresanspruch + Uebertrag) ──
function VacationAccountCard({ members }: { members: { email: string; name: string }[] }) {
  const [member, setMember] = useState("");
  const year = curYear();
  const acc = useVacationAccount({ year, member: member || undefined }, !!member);
  const save = useSetVacationAccount();
  const a = acc.data?.account;
  const [annual, setAnnual] = useState("");
  const [carried, setCarried] = useState("");
  // Beim Laden des Kontos die Felder vorbelegen (nur wenn leer / Mitgliedwechsel).
  const loadedKey = a ? `${member}:${a.annual_days}:${a.carried_over}` : "";
  const [lastLoaded, setLastLoaded] = useState("");
  if (a && loadedKey !== lastLoaded) {
    setLastLoaded(loadedKey);
    setAnnual(String(a.annual_days));
    setCarried(String(a.carried_over));
  }

  async function doSave() {
    if (!member) { toast.error("Bitte einen Mitarbeiter waehlen."); return; }
    const an = Number(annual.replace(",", "."));
    const ca = Number((carried || "0").replace(",", "."));
    if (!Number.isFinite(an) || an < 0) { toast.error("Bitte gueltige Urlaubstage eintragen."); return; }
    try {
      const res = await save.mutateAsync({ member_email: member, year, annual_days: an, carried_over: Number.isFinite(ca) ? ca : 0 });
      if (!res.ok) { toast.error(absErrMsg(res.error)); return; }
      toast.success(`Urlaubskonto gespeichert. Rest: ${fmtDays(res.account?.remaining_days)} Tage.`);
    } catch { toast.error("Speichern fehlgeschlagen."); }
  }

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Urlaubskonto pflegen ({year})</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <Label className="text-xs">Mitarbeiter</Label>
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[200px]" value={member} onChange={(e) => { setMember(e.target.value); setLastLoaded(""); }}>
              <option value="">— bitte waehlen —</option>
              {members.map((m) => <option key={m.email} value={m.email}>{m.name}</option>)}
            </select>
          </div>
        </div>
        {member && (
          <>
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              <div>
                <Label className="text-xs">Jahresanspruch (Tage)</Label>
                <Input inputMode="decimal" value={annual} onChange={(e) => setAnnual(e.target.value)} placeholder="24" />
              </div>
              <div>
                <Label className="text-xs">Uebertrag Vorjahr (Tage)</Label>
                <Input inputMode="decimal" value={carried} onChange={(e) => setCarried(e.target.value)} placeholder="0" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Aktuell: {acc.isLoading ? "…" : `${fmtDays(a?.remaining_days)} von ${fmtDays((a?.annual_days ?? 0) + (a?.carried_over ?? 0))} Tagen offen`}
              {a && a.source === "default" ? " (Standard 24, noch nicht individuell gesetzt)" : ""}. Du kannst hier auch mehr als den Standard geben.
            </p>
            <Button size="sm" onClick={doSave} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Speichern
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Owner: Krankmeldungen zur Kenntnis nehmen ────────────────────────────────
function OwnerSick() {
  const list = useAbsences({ type: "sick" });
  const team = useTeamMembers(true);
  const ack = useAcknowledgeAbsence();
  const items = list.data?.items || [];
  const nameByEmail = useMemo(() => {
    const m: Record<string, string> = {};
    (team.data?.members || []).forEach((x) => { m[x.email] = x.display_name || x.email; });
    return m;
  }, [team.data]);
  const fresh = items.filter((a) => a.status === "reported");
  const rest = items.filter((a) => a.status !== "reported");

  async function doAck(id: number) {
    try {
      const res = await ack.mutateAsync(id);
      if (!res.ok) { toast.error(absErrMsg(res.error)); return; }
      toast.success("Zur Kenntnis genommen.");
    } catch { toast.error("Aktion fehlgeschlagen."); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
          <Stethoscope className="h-4 w-4" /> Neue Krankmeldungen
          {fresh.length > 0 && <Badge variant="secondary">{fresh.length}</Badge>}
        </CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {list.isLoading && <Skeleton className="h-12 w-full" />}
          {!list.isLoading && fresh.length === 0 && <p className="text-sm text-muted-foreground py-2">Keine neuen Krankmeldungen.</p>}
          {fresh.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{nameByEmail[a.member_email] || a.member_email}</p>
                <p className="text-xs text-muted-foreground">{fmtRange(a)}</p>
                {a.note && <p className="text-xs text-muted-foreground truncate">{a.note}</p>}
              </div>
              <Button size="sm" className="shrink-0" onClick={() => doAck(a.id)} disabled={ack.isPending}><Check className="mr-1 h-4 w-4" /> Zur Kenntnis</Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Team-Krankmeldungen</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!list.isLoading && rest.length === 0 && <p className="text-sm text-muted-foreground py-2">Noch nichts zur Kenntnis genommen.</p>}
          {rest.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{nameByEmail[a.member_email] || a.member_email}</span>
                  <Badge variant={statusVariant(a.status)}>{STATUS_LABEL[a.status]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{fmtRange(a)}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Krankheitsdaten sind besonders geschuetzt (Art. 9 DSGVO). Nur du und der betroffene Mitarbeiter sehen sie.
      </p>
    </div>
  );
}

// ── Einstieg ─────────────────────────────────────────────────────────────────
export function AbsencePanel({ isOwner, kind }: { isOwner: boolean; kind: AbsenceType }) {
  if (isOwner) return kind === "vacation" ? <OwnerVacation /> : <OwnerSick />;
  return kind === "vacation" ? <EmployeeVacation /> : <EmployeeSick />;
}

export default AbsencePanel;
