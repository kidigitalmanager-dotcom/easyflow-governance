import { useState } from "react";
import {
  useCopilotVertriebler,
  useCopilotVertrieblerCreate,
  useCopilotVertrieblerUpdate,
  useCopilotVertrieblerRedeploy,
  useCopilotVertrieblerDelete,
} from "@/hooks/use-api";
import type { CopilotVertriebler } from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UserPlus, Pencil, Trash2, RefreshCw, ExternalLink, Copy,
  Loader2, Rocket, Link2Off,
} from "lucide-react";
import { toast } from "sonner";

function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
        active
          ? "text-green-500 bg-green-500/10 border-green-500/20"
          : "text-muted-foreground bg-muted border-border"
      }`}
    >
      {active ? "Aktiv" : "Inaktiv"}
    </span>
  );
}

interface CreateFormState {
  client_id: string;
  display_name: string;
  email: string;
}
const EMPTY_CREATE: CreateFormState = { client_id: "", display_name: "", email: "" };

interface EditFormState {
  display_name: string;
  email: string;
  status: string;
}

export default function CoPilotRepsTab() {
  const { data, isLoading, error, refetch } = useCopilotVertriebler();
  const createMut = useCopilotVertrieblerCreate();
  const updateMut = useCopilotVertrieblerUpdate();
  const redeployMut = useCopilotVertrieblerRedeploy();
  const deleteMut = useCopilotVertrieblerDelete();

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE);
  const [editTarget, setEditTarget] = useState<CopilotVertriebler | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ display_name: "", email: "", status: "active" });
  const [deleteTarget, setDeleteTarget] = useState<CopilotVertriebler | null>(null);
  const [redeployTarget, setRedeployTarget] = useState<CopilotVertriebler | null>(null);
  const [redeployingId, setRedeployingId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");

  const notConnected =
    error instanceof ApiError &&
    ["no_copilot_tenant_for_email", "console_auth_not_configured", "tenant_inactive"].includes(error.message);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (notConnected) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
        <Link2Off className="w-8 h-8 mx-auto text-muted-foreground" />
        <h3 className="font-semibold">Kein Co-Pilot-Workspace verknüpft</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {error.message === "console_auth_not_configured"
            ? "Die Konsolen-Anbindung ist serverseitig noch nicht freigeschaltet (SUPABASE_JWT_SECRET fehlt am Backend)."
            : "Deine Login-E-Mail ist mit keinem Co-Pilot-Workspace verknüpft. Die Verknüpfung läuft über die Admin-E-Mail des Workspaces — einmalig vom Betreiber zu setzen."}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Erneut prüfen</Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        Fehler beim Laden: {error instanceof Error ? error.message : "Unbekannt"}
      </div>
    );
  }

  const reps = data?.vertriebler ?? [];
  const activeReps = reps.filter((r) => r.status === "active");

  const copilotUrl = (r: CopilotVertriebler) =>
    r.deployed_url || `https://copilot.useeasy.ai/${r.client_id}/`;

  const doCreate = () => {
    const cid = createForm.client_id.trim().toLowerCase();
    const dn = createForm.display_name.trim();
    if (!cid || !dn) { toast.error("client-id und Anzeigename sind Pflicht."); return; }
    createMut.mutate(
      { client_id: cid, display_name: dn, email: createForm.email.trim() || null },
      {
        onSuccess: (d) => {
          if (d.auto_deploy?.ok) {
            toast.success(`${dn} angelegt — Co-Pilot live: ${d.auto_deploy.url}`);
          } else {
            toast.warning(`${dn} angelegt, aber Auto-Deploy fehlgeschlagen: ${d.auto_deploy?.error || "unbekannt"}`);
          }
          setCreateOpen(false);
          setCreateForm(EMPTY_CREATE);
        },
        onError: (e) => toast.error(`Anlegen fehlgeschlagen: ${e instanceof Error ? e.message : "Fehler"}`),
      },
    );
  };

  const doRedeploy = (r: CopilotVertriebler) => {
    setRedeployingId(r.vertriebler_id);
    redeployMut.mutate(r.vertriebler_id, {
      onSuccess: () => {
        toast.success(`${r.display_name} neu deployed — greift beim nächsten Laden der Co-Pilot-Seite.`);
        setRedeployingId(null);
      },
      onError: (e) => {
        toast.error(`Redeploy fehlgeschlagen: ${e instanceof Error ? e.message : "Fehler"}`);
        setRedeployingId(null);
      },
    });
    setRedeployTarget(null);
  };

  const doRedeployAll = async () => {
    if (!activeReps.length) { toast.info("Keine aktiven Vertriebler."); return; }
    setBulkRunning(true);
    let okCount = 0, failCount = 0;
    for (let i = 0; i < activeReps.length; i++) {
      setBulkProgress(`${i + 1}/${activeReps.length}`);
      try {
        await redeployMut.mutateAsync(activeReps[i].vertriebler_id);
        okCount++;
      } catch {
        failCount++;
      }
    }
    setBulkRunning(false);
    setBulkProgress("");
    if (failCount) toast.warning(`${okCount} neu deployed, ${failCount} fehlgeschlagen.`);
    else toast.success(`Alle ${okCount} Co-Piloten neu deployed.`);
  };

  const openEdit = (r: CopilotVertriebler) => {
    setEditTarget(r);
    setEditForm({ display_name: r.display_name, email: r.email ?? "", status: r.status });
  };

  const doEdit = () => {
    if (!editTarget) return;
    updateMut.mutate(
      {
        vId: editTarget.vertriebler_id,
        body: {
          display_name: editForm.display_name.trim() || undefined,
          email: editForm.email.trim() || null,
          status: editForm.status === "inactive" ? "inactive" : "active",
        },
      },
      {
        onSuccess: () => { toast.success("Gespeichert."); setEditTarget(null); },
        onError: (e) => toast.error(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : "Fehler"}`),
      },
    );
  };

  const doDelete = () => {
    if (!deleteTarget) return;
    deleteMut.mutate(deleteTarget.vertriebler_id, {
      onSuccess: () => { toast.success(`${deleteTarget.display_name} deaktiviert.`); setDeleteTarget(null); },
      onError: (e) => toast.error(`Löschen fehlgeschlagen: ${e instanceof Error ? e.message : "Fehler"}`),
    });
  };

  const copyUrl = (r: CopilotVertriebler) => {
    navigator.clipboard.writeText(copilotUrl(r)).then(
      () => toast.success("Co-Pilot-Link kopiert."),
      () => toast.error("Kopieren fehlgeschlagen."),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-xl">
          Jeder Vertriebler hat seine eigene Co-Pilot-URL. <b>Redeploy</b> generiert die
          Co-Pilot-Seite aus dem aktuellen Master-Template neu — Skripte, Einwände und
          Leads bleiben dabei unberührt.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={doRedeployAll}
            disabled={bulkRunning || !activeReps.length}
            className="gap-1.5"
          >
            {bulkRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {bulkRunning ? `Deploye ${bulkProgress}…` : "Alle neu deployen"}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            Neuer Vertriebler
          </Button>
        </div>
      </div>

      {reps.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-2">
          <Rocket className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Noch keine Vertriebler. Lege den ersten an — der Co-Pilot wird automatisch deployed.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Vertriebler</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Stats</th>
                <th className="px-4 py-2.5 font-medium">Co-Pilot</th>
                <th className="px-4 py-2.5 font-medium text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((r) => (
                <tr key={r.vertriebler_id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.display_name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{r.client_id}</div>
                    {r.email && <div className="text-[11px] text-muted-foreground">{r.email}</div>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <b className="text-foreground">{r.stats?.termine ?? 0}</b> Termine · {r.stats?.total_actions ?? 0} Aktionen
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <a
                        href={copilotUrl(r)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Öffnen <ExternalLink className="w-3 h-3" />
                      </a>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyUrl(r)} title="Link kopieren">
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        disabled={redeployingId === r.vertriebler_id || r.status !== "active"}
                        onClick={() => setRedeployTarget(r)}
                        title="Co-Pilot aus aktuellem Master-Template neu generieren"
                      >
                        {redeployingId === r.vertriebler_id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <RefreshCw className="w-3 h-3" />}
                        Redeploy
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} title="Bearbeiten">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(r)}
                        title="Deaktivieren (Soft-Delete)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuen Vertriebler anlegen</DialogTitle>
            <DialogDescription>
              Der Co-Pilot wird automatisch aus dem Master-Template deployed und ist sofort unter
              copilot.useeasy.ai/&lt;client-id&gt;/ erreichbar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-cid">client-id (lowercase, eindeutig)</Label>
              <Input
                id="cp-cid"
                placeholder="z. B. anna-vertrieb"
                value={createForm.client_id}
                onChange={(e) => setCreateForm((f) => ({ ...f, client_id: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-name">Anzeigename</Label>
              <Input
                id="cp-name"
                placeholder="z. B. Anna Müller"
                value={createForm.display_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-mail">E-Mail (optional)</Label>
              <Input
                id="cp-mail"
                type="email"
                placeholder="anna@firma.de"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
            <Button onClick={doCreate} disabled={createMut.isPending} className="gap-1.5">
              {createMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Anlegen + Deploy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vertriebler bearbeiten</DialogTitle>
            <DialogDescription>{editTarget?.client_id}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-edit-name">Anzeigename</Label>
              <Input
                id="cp-edit-name"
                value={editForm.display_name}
                onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-edit-mail">E-Mail</Label>
              <Input
                id="cp-edit-mail"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={editForm.status === "active" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEditForm((f) => ({ ...f, status: "active" }))}
                >
                  Aktiv
                </Button>
                <Button
                  type="button"
                  variant={editForm.status === "inactive" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEditForm((f) => ({ ...f, status: "inactive" }))}
                >
                  Inaktiv
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Abbrechen</Button>
            <Button onClick={doEdit} disabled={updateMut.isPending} className="gap-1.5">
              {updateMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!redeployTarget} onOpenChange={(o) => !o && setRedeployTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Co-Pilot neu deployen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{redeployTarget?.display_name}" wird aus dem aktuellen Master-Template neu generiert.
              Skripte, Einwände und Leads bleiben unberührt (liegen im Backend bzw. Browser).
              Die neue Version greift beim nächsten Laden der Co-Pilot-Seite — ein laufender Call
              wird nicht unterbrochen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => redeployTarget && doRedeploy(redeployTarget)}>
              Neu deployen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vertriebler deaktivieren?</AlertDialogTitle>
            <AlertDialogDescription>
              „{deleteTarget?.display_name}" wird deaktiviert (Soft-Delete). Der Co-Pilot-Link
              bleibt bestehen, der Zugang wird aber in der Verwaltung als inaktiv geführt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Deaktivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
