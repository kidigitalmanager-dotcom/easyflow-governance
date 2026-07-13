import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bot, Loader2, Plus, RefreshCw, Save, PhoneOutgoing } from "lucide-react";

// Voice-Agent Admin-API (Lambda useeasy-vapi-admin hinter useeasy-api-mvp)
const VA_BASE = "https://gpl60wd3uj.execute-api.eu-central-1.amazonaws.com/vapi-admin";

async function va<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Nicht angemeldet");
  const res = await fetch(`${VA_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `API-Fehler ${res.status}`);
  return data as T;
}

interface Tenant {
  tenant_id: string; vertical: string; twilio_number: string | null;
  jana_mode: string; status: string; prompt_version: number;
}
interface QueueItem {
  tenant_id: string; thread_key: string; target: string; phone: string;
  due_at: string; attempts: number; status: string; outcome: string | null; last_error: string | null;
}
interface CallItem {
  vapi_call_id: string; direction: string | null; started_at: string | null;
  ended_reason: string | null; summary: string | null; transcript_preview: string | null;
}
interface Template { id: string; name: string; firstMessage: string; systemPrompt: string }
interface PoolNumber { number: string; status: string; tenant_id: string | null; assigned_at: string | null }

const VERTICALS = [
  { value: "handwerk", label: "Handwerk" },
  { value: "hausverwaltung", label: "Hausverwaltung" },
  { value: "ecommerce", label: "E-Commerce" },
  { value: "versicherung", label: "Versicherung" },
  { value: "finanzen", label: "Finanzen" },
];
const JANA_MODES = [
  { value: "off", label: "Aus" },
  { value: "end_customer", label: "Endkunde anrufen" },
  { value: "owner", label: "Bearbeiter anrufen" },
  { value: "both", label: "Endkunde + Notification" },
];

const statusBadge = (s: string) =>
  s === "live" || s === "done" ? "default" : s === "failed" || s === "off" ? "destructive" : "secondary";

export default function VoiceAgentsTab() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [kind, setKind] = useState<"inbound" | "jana">("inbound");
  const [prompt, setPrompt] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [janaMode, setJanaMode] = useState("off");
  const [janaSla, setJanaSla] = useState(24);
  const [janaFrom, setJanaFrom] = useState("09:00");
  const [janaTo, setJanaTo] = useState("18:00");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [provOpen, setProvOpen] = useState(false);
  const [provBusy, setProvBusy] = useState(false);
  const [prov, setProv] = useState({
    tenantId: "", vertical: "handwerk", janaMode: "end_customer",
    firma: "", beschreibung: "", zeiten: "", notdienst: "", gewerke: "", gebiet: "", faq: "",
  });
  const [pool, setPool] = useState<PoolNumber[]>([]);
  const [poolAdd, setPoolAdd] = useState({ number: "", sid: "", token: "" });
  const [poolBusy, setPoolBusy] = useState(false);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const d = await va<{ tenants: Tenant[] }>("GET", "/admin/tenants");
      setTenants(d.tenants);
      if (!selected && d.tenants[0]) setSelected(d.tenants[0].tenant_id);
    } catch (e) { toast.error(`Kunden laden fehlgeschlagen: ${(e as Error).message}`); }
    finally { setLoading(false); }
  }, [selected]);

  const loadQueue = useCallback(async () => {
    try { setQueue((await va<{ queue: QueueItem[] }>("GET", "/admin/queue")).queue); }
    catch (e) { toast.error((e as Error).message); }
  }, []);

  const loadPool = useCallback(async () => {
    try { setPool((await va<{ numbers: PoolNumber[] }>("GET", "/admin/numbers")).numbers); }
    catch { /* Pool optional */ }
  }, []);

  const refillPool = async () => {
    setPoolBusy(true);
    try {
      const r = await va<{ ok: boolean; bought?: string[]; error?: string }>("POST", "/admin/numbers/refill");
      toast.success(r.bought?.length ? `${r.bought.length} Nummer(n) automatisch gekauft.` : "Pool ist bereits ausreichend gefüllt.");
      loadPool();
    } catch (e) { toast.error((e as Error).message); }
    finally { setPoolBusy(false); }
  };

  const addPoolNumber = async () => {
    if (!poolAdd.number.trim() || !poolAdd.sid.trim() || !poolAdd.token.trim())
      { toast.error("Nummer, Account SID und Auth Token sind Pflicht."); return; }
    setPoolBusy(true);
    try {
      await va("POST", "/admin/numbers", { number: poolAdd.number.trim(), accountSid: poolAdd.sid.trim(), authToken: poolAdd.token.trim() });
      toast.success("Nummer im Pool.");
      setPoolAdd({ number: "", sid: "", token: "" });
      loadPool();
    } catch (e) { toast.error((e as Error).message); }
    finally { setPoolBusy(false); }
  };

  useEffect(() => { loadTenants(); loadQueue(); loadPool(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) return;
    const t = tenants.find((x) => x.tenant_id === selected);
    if (t) setJanaMode(t.jana_mode);
    (async () => {
      try { setCalls((await va<{ calls: CallItem[] }>("GET", `/admin/tenants/${encodeURIComponent(selected)}/calls`)).calls); }
      catch { setCalls([]); }
    })();
  }, [selected, tenants]);

  const loadAgent = async () => {
    if (!selected) return;
    setAgentLoading(true);
    try {
      const d = await va<{ agent: { systemPrompt: string; firstMessage: string } | null; prompt_version: number }>(
        "GET", `/admin/tenants/${encodeURIComponent(selected)}?kind=${kind}`);
      if (!d.agent) { toast.warning("Dieser Kunde hat keinen solchen Agenten."); setPrompt(""); setFirstMessage(""); return; }
      setPrompt(d.agent.systemPrompt); setFirstMessage(d.agent.firstMessage); setVersion(d.prompt_version);
    } catch (e) { toast.error((e as Error).message); }
    finally { setAgentLoading(false); }
  };

  const saveAgent = async () => {
    if (!selected || !prompt.trim()) return;
    setSaving(true);
    try {
      const r = await va<{ version: number }>("PUT", `/admin/tenants/${encodeURIComponent(selected)}/agent`,
        { kind, systemPrompt: prompt, firstMessage });
      setVersion(r.version);
      toast.success(`Veröffentlicht — Version ${r.version}. Gilt sofort für neue Anrufe.`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const saveJana = async () => {
    if (!selected) return;
    try {
      await va("PUT", `/admin/tenants/${encodeURIComponent(selected)}/jana`, {
        mode: janaMode, slaHours: janaSla,
        callWindow: { days: [1, 2, 3, 4, 5], from: janaFrom, to: janaTo },
      });
      toast.success("Jana-Einstellungen gespeichert.");
      loadTenants();
    } catch (e) { toast.error((e as Error).message); }
  };

  const provision = async () => {
    if (!prov.tenantId.trim() || !prov.firma.trim()) { toast.error("Tenant-ID und Firma sind Pflicht."); return; }
    setProvBusy(true);
    try {
      const body: Record<string, unknown> = {
        vertical: prov.vertical, janaMode: prov.janaMode,
        variables: {
          firma: prov.firma, firma_beschreibung: prov.beschreibung, oeffnungszeiten: prov.zeiten,
          faq: prov.faq, notdienst_nummer: prov.notdienst, eskalation_nummer: prov.notdienst,
          gewerke: prov.gewerke, einzugsgebiet: prov.gebiet,
        },
      };
      const r = await va<{ inboundId: string; janaId: string | null; number: string | null; poolEmpty?: boolean }>(
        "POST", `/admin/tenants/${encodeURIComponent(prov.tenantId.trim())}/provision`, body);
      if (r.poolEmpty) toast.warning("Agent live — aber Nummern-Pool ist leer, keine Nummer zugewiesen.");
      else toast.success(`Provisioniert — Agent live${r.number ? `, Nummer ${r.number}` : ""}.`);
      setProvOpen(false); loadTenants(); loadPool();
    } catch (e) { toast.error((e as Error).message); }
    finally { setProvBusy(false); }
  };

  const loadTemplates = async () => {
    try { setTemplates((await va<{ templates: Template[] }>("GET", "/admin/templates")).templates); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      {/* Kunden */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Bot className="w-4 h-4" />Kunden-Agenten</CardTitle>
            <CardDescription>Vorlage-Agenten pro Vertikale — ab Kauf sofort aktiv, Prompt pro Kunde anpassbar.</CardDescription>
          </div>
          <Dialog open={provOpen} onOpenChange={setProvOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />Neuer Kunde</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Voice-Agent provisionieren</DialogTitle>
                <DialogDescription>Klont die Vertikale-Vorlage mit den Firmendaten — der Agent ist danach sofort live.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Tenant-ID *</Label><Input value={prov.tenantId} onChange={(e) => setProv({ ...prov, tenantId: e.target.value })} placeholder="kunde-schulz-01" /></div>
                <div><Label>Vertikale</Label>
                  <Select value={prov.vertical} onValueChange={(v) => setProv({ ...prov, vertical: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{VERTICALS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label>Firma *</Label><Input value={prov.firma} onChange={(e) => setProv({ ...prov, firma: e.target.value })} /></div>
                <div><Label>Jana-Modus</Label>
                  <Select value={prov.janaMode} onValueChange={(v) => setProv({ ...prov, janaMode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{JANA_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div className="col-span-2"><Label>Kurzbeschreibung</Label><Input value={prov.beschreibung} onChange={(e) => setProv({ ...prov, beschreibung: e.target.value })} /></div>
                <div><Label>Öffnungszeiten</Label><Input value={prov.zeiten} onChange={(e) => setProv({ ...prov, zeiten: e.target.value })} placeholder="Mo–Fr 8–17 Uhr" /></div>
                <div><Label>Eskalations-/Notdienstnr.</Label><Input value={prov.notdienst} onChange={(e) => setProv({ ...prov, notdienst: e.target.value })} placeholder="+49…" /></div>
                {prov.vertical === "handwerk" && (<>
                  <div><Label>Gewerke</Label><Input value={prov.gewerke} onChange={(e) => setProv({ ...prov, gewerke: e.target.value })} /></div>
                  <div><Label>Einzugsgebiet</Label><Input value={prov.gebiet} onChange={(e) => setProv({ ...prov, gebiet: e.target.value })} /></div>
                </>)}
                <div className="col-span-2"><Label>Wissensbasis / FAQ</Label><Textarea rows={3} value={prov.faq} onChange={(e) => setProv({ ...prov, faq: e.target.value })} /></div>
                <p className="col-span-2 text-xs text-muted-foreground">
                  Die Rufnummer wird automatisch aus dem UseEasy-Nummern-Pool zugewiesen
                  ({pool.filter((n) => n.status === "free").length} frei). Der Kunde richtet danach nur die Rufumleitung ein.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={provision} disabled={provBusy} className="gap-1.5">
                  {provBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Provisionieren
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Kunden-Agenten provisioniert.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tenant</TableHead><TableHead>Vertikale</TableHead><TableHead>Nummer</TableHead>
                <TableHead>Jana</TableHead><TableHead>Status</TableHead><TableHead>Version</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {tenants.map((t) => (
                  <TableRow key={t.tenant_id} className={t.tenant_id === selected ? "bg-muted/50" : "cursor-pointer"} onClick={() => setSelected(t.tenant_id)}>
                    <TableCell className="font-medium">{t.tenant_id}</TableCell>
                    <TableCell>{t.vertical}</TableCell>
                    <TableCell>{t.twilio_number || "—"}</TableCell>
                    <TableCell>{JANA_MODES.find((m) => m.value === t.jana_mode)?.label || t.jana_mode}</TableCell>
                    <TableCell><Badge variant={statusBadge(t.status)}>{t.status}</Badge></TableCell>
                    <TableCell>v{t.prompt_version}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent-Editor</CardTitle>
          <CardDescription>Prompt und erste Ansage anpassen — Veröffentlichen wirkt sofort auf neue Anrufe. Platzhalter wie {"{{call.id}}"} nicht entfernen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-56"><Label>Kunde</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger><SelectValue placeholder="Kunde wählen" /></SelectTrigger>
                <SelectContent>{tenants.map((t) => <SelectItem key={t.tenant_id} value={t.tenant_id}>{t.tenant_id}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="w-56"><Label>Agent</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as "inbound" | "jana")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound">Inbound (Customer Service)</SelectItem>
                  <SelectItem value="jana">Jana (Outbound)</SelectItem>
                </SelectContent>
              </Select></div>
            <Button variant="outline" size="sm" onClick={loadAgent} disabled={agentLoading || !selected} className="gap-1.5">
              {agentLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Laden
            </Button>
            <Button size="sm" onClick={saveAgent} disabled={saving || !prompt.trim()} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Veröffentlichen{version ? ` (v${version})` : ""}
            </Button>
          </div>
          <div><Label>Erste Ansage</Label><Input value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} /></div>
          <div><Label>System-Prompt</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={16} spellCheck={false} className="font-mono text-xs" /></div>
        </CardContent>
      </Card>

      {/* Jana + Queue */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><PhoneOutgoing className="w-4 h-4" />Jana — Thread-Follow-ups</CardTitle>
            <CardDescription>Ruft an, wenn E-Mail-Threads liegen bleiben. Läuft alle 15 Minuten im Anruffenster.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadQueue} className="gap-1.5"><RefreshCw className="w-3.5 h-3.5" />Queue</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-56"><Label>Modus ({selected || "—"})</Label>
              <Select value={janaMode} onValueChange={setJanaMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{JANA_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="w-28"><Label>SLA (Std.)</Label><Input type="number" value={janaSla} onChange={(e) => setJanaSla(Number(e.target.value))} /></div>
            <div className="w-28"><Label>Fenster von</Label><Input value={janaFrom} onChange={(e) => setJanaFrom(e.target.value)} /></div>
            <div className="w-28"><Label>bis</Label><Input value={janaTo} onChange={(e) => setJanaTo(e.target.value)} /></div>
            <Button size="sm" onClick={saveJana} disabled={!selected}>Speichern</Button>
          </div>
          {queue.length > 0 && (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tenant</TableHead><TableHead>Thread</TableHead><TableHead>Ziel</TableHead>
                <TableHead>Fällig</TableHead><TableHead>Versuche</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {queue.map((r) => (
                  <TableRow key={`${r.tenant_id}-${r.thread_key}-${r.target}`}>
                    <TableCell>{r.tenant_id}</TableCell>
                    <TableCell className="font-mono text-xs">{r.thread_key}</TableCell>
                    <TableCell>{r.target === "owner" ? "Bearbeiter" : "Endkunde"}</TableCell>
                    <TableCell className="text-xs">{r.due_at?.slice(0, 16).replace("T", " ")}</TableCell>
                    <TableCell>{r.attempts}</TableCell>
                    <TableCell><Badge variant={statusBadge(r.status)}>{r.status}</Badge>
                      {r.last_error && <span className="ml-2 text-xs text-muted-foreground">{r.last_error}</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Anrufe */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Anrufe ({selected || "—"})</CardTitle>
          <CardDescription>Eingehende und Jana-Anrufe der Kunden-Agenten.</CardDescription>
        </CardHeader>
        <CardContent>
          {calls.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Anrufe.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Zeit</TableHead><TableHead>Richtung</TableHead><TableHead>Ende</TableHead><TableHead>Inhalt</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {calls.map((c) => (
                  <TableRow key={c.vapi_call_id}>
                    <TableCell className="text-xs whitespace-nowrap">{c.started_at?.slice(0, 16).replace("T", " ") || "—"}</TableCell>
                    <TableCell>{c.direction === "outbound" ? "Jana →" : "→ Inbound"}</TableCell>
                    <TableCell className="text-xs">{c.ended_reason || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md truncate">{c.summary || c.transcript_preview || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Nummern-Pool */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Twilio-Nummern-Pool</CardTitle>
            <CardDescription>
              Kauf & Zuweisung laufen automatisch: Puffer wird stündlich aufgefüllt, bei leerem Pool kauft
              das Provisioning on-demand nach (Regulatory Bundle in AWS-Secret nötig).
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refillPool} disabled={poolBusy} className="gap-1.5">
            {poolBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Jetzt auffüllen
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-44"><Label>Nummer (E.164)</Label><Input value={poolAdd.number} onChange={(e) => setPoolAdd({ ...poolAdd, number: e.target.value })} placeholder="+4930…" /></div>
            <div className="w-56"><Label>Twilio Account SID</Label><Input value={poolAdd.sid} onChange={(e) => setPoolAdd({ ...poolAdd, sid: e.target.value })} /></div>
            <div className="w-56"><Label>Twilio Auth Token</Label><Input type="password" value={poolAdd.token} onChange={(e) => setPoolAdd({ ...poolAdd, token: e.target.value })} /></div>
            <Button size="sm" onClick={addPoolNumber} disabled={poolBusy} className="gap-1.5">
              {poolBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}In Pool aufnehmen
            </Button>
          </div>
          {pool.length > 0 && (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nummer</TableHead><TableHead>Status</TableHead><TableHead>Kunde</TableHead><TableHead>Zugewiesen</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {pool.map((n) => (
                  <TableRow key={n.number}>
                    <TableCell className="font-medium">{n.number}</TableCell>
                    <TableCell><Badge variant={n.status === "free" ? "secondary" : "default"}>{n.status === "free" ? "frei" : n.status}</Badge></TableCell>
                    <TableCell>{n.tenant_id || "—"}</TableCell>
                    <TableCell className="text-xs">{n.assigned_at?.slice(0, 16).replace("T", " ") || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Vorlagen */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Zentrale Vorlagen</CardTitle>
            <CardDescription>Die [TPL]-Vorlagen pro Vertikale — Basis jeder neuen Provisionierung.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadTemplates} className="gap-1.5"><RefreshCw className="w-3.5 h-3.5" />Laden</Button>
        </CardHeader>
        {templates.length > 0 && (
          <CardContent className="grid gap-3 md:grid-cols-2">
            {templates.map((t) => (
              <details key={t.id} className="rounded-lg border p-3">
                <summary className="text-sm font-medium cursor-pointer">{t.name}</summary>
                <p className="text-xs text-muted-foreground mt-2">{t.firstMessage}</p>
                <pre className="text-[11px] text-muted-foreground mt-2 whitespace-pre-wrap max-h-48 overflow-auto">{t.systemPrompt}</pre>
              </details>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
