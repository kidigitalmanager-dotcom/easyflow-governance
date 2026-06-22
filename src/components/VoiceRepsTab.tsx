import { useState } from "react";
import {
  useVoiceReps,
  useVoiceRepUpdate,
  useVoiceRepDelete,
} from "@/hooks/use-api";
import type { VoiceRep, CallerIdStatus } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Phone, PhoneOff, Pencil, CheckCircle2, Clock, XCircle,
  Loader2, PhoneCall, RotateCcw, Info,
} from "lucide-react";
import { toast } from "sonner";

const CALLER_ID_META: Record<CallerIdStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  validated:  { label: "Verifiziert",     cls: "text-green-500 bg-green-500/10 border-green-500/20",  Icon: CheckCircle2 },
  pending:    { label: "Ausstehend",      cls: "text-amber-400 bg-amber-400/10 border-amber-400/20",  Icon: Clock },
  unverified: { label: "Nicht verifiziert", cls: "text-red-400 bg-red-400/10 border-red-400/20",      Icon: XCircle },
};

function CallerIdBadge({ status }: { status: CallerIdStatus }) {
  const meta = CALLER_ID_META[status] ?? CALLER_ID_META.pending;
  const { Icon } = meta;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${meta.cls}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

interface RepFormState {
  rep_id: string;
  name: string;
  email: string;
  twilio_number: string;
  caller_id_status: CallerIdStatus;
}

const EMPTY_FORM: RepFormState = {
  rep_id: "", name: "", email: "", twilio_number: "", caller_id_status: "pending",
};

export default function VoiceRepsTab() {
  const { data, isLoading, error } = useVoiceReps();
  const updateMut = useVoiceRepUpdate();
  const deleteMut = useVoiceRepDelete();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VoiceRep | null>(null);
  const [form, setForm] = useState<RepFormState>(EMPTY_FORM);

  const reps = data?.reps ?? [];

  const openEdit = (rep: VoiceRep) => {
    setEditing(rep);
    setForm({
      rep_id: rep.rep_id,
      name: rep.name,
      email: rep.email ?? "",
      twilio_number: rep.twilio_number ?? "",
      caller_id_status: rep.caller_id_status,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    try {
      if (!editing) return;
      await updateMut.mutateAsync({
        repId: editing.rep_id,
        payload: {
          name: form.name.trim(),
          email: form.email.trim() || null,
          twilio_number: form.twilio_number.trim() || null,
          caller_id_status: form.caller_id_status,
        },
      });
      toast.success(`${form.name} aktualisiert`);
      setDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  };

  const toggleActive = async (rep: VoiceRep) => {
    try {
      await updateMut.mutateAsync({ repId: rep.rep_id, payload: { active: !rep.active } });
      toast.success(rep.active ? `${rep.name} deaktiviert` : `${rep.name} reaktiviert`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    }
  };

  const removeRep = async (rep: VoiceRep) => {
    try {
      await deleteMut.mutateAsync(rep.rep_id);
      toast.success(`${rep.name} deaktiviert`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deaktivieren fehlgeschlagen");
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Vertriebler & Telefonnummern</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Twilio-Caller-IDs und Status deiner Vertriebler. Vertriebler werden im Co-Pilot-Tab angelegt — hier setzt du Rufnummer & Status.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? `${editing.name} bearbeiten` : "Vertriebler bearbeiten"}</DialogTitle>
                <DialogDescription>
                  Name, E-Mail, Twilio-Nummer und Caller-ID-Status anpassen.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Vor- und Nachname"
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">E-Mail (optional)</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="name@firma.de"
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Twilio-Nummer (E.164, optional)</label>
                  <input
                    value={form.twilio_number}
                    onChange={(e) => setForm((f) => ({ ...f, twilio_number: e.target.value }))}
                    placeholder="+4915888658953"
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Caller-ID-Status</label>
                  <select
                    value={form.caller_id_status}
                    onChange={(e) => setForm((f) => ({ ...f, caller_id_status: e.target.value as CallerIdStatus }))}
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
                  >
                    <option value="validated">Verifiziert</option>
                    <option value="pending">Ausstehend</option>
                    <option value="unverified">Nicht verifiziert</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
                <Button
                  onClick={submit}
                  disabled={updateMut.isPending || !form.name.trim()}
                >
                  {updateMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Speichern
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {error && (
          <p className="text-sm text-red-400">Vertriebler konnten nicht geladen werden.</p>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : reps.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <PhoneCall className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Noch keine Vertriebler angelegt</p>
            <p className="text-xs text-muted-foreground/70">
              {data?.note === "voice_tables_not_migrated"
                ? "Voice-Tabellen sind noch nicht migriert (migration_v1.13)."
                : "Vertriebler werden im Co-Pilot-Tab angelegt und erscheinen dann hier."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {reps.map((rep) => (
              <div key={rep.rep_id} className="flex items-center gap-4 py-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${rep.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Phone className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{rep.name}</p>
                    {!rep.active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">inaktiv</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {rep.twilio_number ?? "keine Nummer zugewiesen"}
                    {rep.email && <span className="text-muted-foreground/60"> · {rep.email}</span>}
                  </p>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                  <CallerIdBadge status={rep.caller_id_status} />
                  <p className="text-[11px] text-muted-foreground">
                    {rep.call_count} Anruf{rep.call_count === 1 ? "" : "e"}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(rep)} title="Bearbeiten">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {rep.active ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" title="Deaktivieren">
                          <PhoneOff className="w-3.5 h-3.5 text-red-400" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{rep.name} deaktivieren?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Der Vertriebler kann keine Anrufe mehr tätigen. Bestehende Anrufe bleiben
                            in der Audit-Historie erhalten. Reaktivieren ist jederzeit möglich.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeRep(rep)}>Deaktivieren</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(rep)} title="Reaktivieren">
                      <RotateCcw className="w-3.5 h-3.5 text-green-500" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 border border-border rounded-md px-3 py-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Twilio-Nummern werden separat im Twilio-Console gekauft und verifiziert. Der Caller-ID-Status
          hier steuert nur die Anzeige — die echte Verifikation passiert bei Twilio. Vollständiges
          Co-Pilot-Deployment neuer Vertriebler erfolgt über admin.useeasy.ai.
        </span>
      </div>
    </div>
  );
}
