/**
 * AgentTenantAdminTab — Voice-Agent eines FREMDEN Tenants bedienen (v4.146.0).
 *
 * Sitzt im Tenant-Setup der Admin-Sicht. Frueher hing hier der Kunden-Tab mit
 * einer `tenantId`-Prop; der ist jetzt self-serve und immer auf den eigenen
 * Tenant gebunden. Diese Variante nutzt die ausdruecklich admin-gegateten
 * Routen /voice/agents/admin/tenants/{id}/* — ohne Super-Admin-Rolle 403.
 */
import { useState } from "react";
import { useAdminTenantAgent, useAdminTenantAgentMutations, useAdminTenantCalls } from "@/hooks/use-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Save, Rocket } from "lucide-react";
import { toast } from "sonner";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Unbekannter Fehler");

const VERTICALS = [
  { value: "handwerk", label: "Handwerk & Bau" },
  { value: "hausverwaltung", label: "Hausverwaltung" },
  { value: "ecommerce", label: "E-Commerce" },
  { value: "versicherung", label: "Versicherung" },
  { value: "finanzen", label: "Finanzen & Steuerberatung" },
];
const JANA_MODES = [
  { value: "off", label: "Aus" },
  { value: "end_customer", label: "Endkunde anrufen" },
  { value: "owner", label: "Bearbeiter anrufen" },
  { value: "both", label: "Endkunde + Benachrichtigung" },
];

export default function AgentTenantAdminTab({ tenantId }: { tenantId: string }) {
  const [kind, setKind] = useState<"inbound" | "jana">("inbound");
  const q = useAdminTenantAgent(tenantId, kind);
  const m = useAdminTenantAgentMutations(tenantId);
  const calls = useAdminTenantCalls(tenantId);

  const [prompt, setPrompt] = useState<string | null>(null);
  const [firstMessage, setFirstMessage] = useState<string | null>(null);
  const [prov, setProv] = useState({
    vertical: "handwerk", janaMode: "end_customer", firma: "", firma_beschreibung: "",
    oeffnungszeiten: "", notdienst_nummer: "", gewerke: "", einzugsgebiet: "", faq: "",
  });

  const forbidden = q.error && (q.error as { status?: number }).status === 403;
  const notFound = q.error && (q.error as { status?: number }).status === 404;
  const exists = !!q.data?.ok && !!q.data?.vertical;

  const loadedPrompt = q.data?.agent?.systemPrompt ?? "";
  const loadedFirst = q.data?.agent?.firstMessage ?? "";
  const effPrompt = prompt ?? loadedPrompt;
  const effFirst = firstMessage ?? loadedFirst;
  const dirty = (prompt !== null && prompt !== loadedPrompt) || (firstMessage !== null && firstMessage !== loadedFirst);

  const doProvision = async () => {
    if (!prov.firma.trim()) { toast.error("Firmenname ist Pflicht."); return; }
    try {
      const r = await m.provision.mutateAsync({
        vertical: prov.vertical, janaMode: prov.janaMode,
        variables: {
          firma: prov.firma, firma_beschreibung: prov.firma_beschreibung,
          oeffnungszeiten: prov.oeffnungszeiten, faq: prov.faq,
          notdienst_nummer: prov.notdienst_nummer, eskalation_nummer: prov.notdienst_nummer,
          gewerke: prov.gewerke, einzugsgebiet: prov.einzugsgebiet,
        },
      });
      if (!r.ok) { toast.error(r.upstream || r.error || "Provisionierung fehlgeschlagen"); return; }
      toast[r.poolEmpty ? "warning" : "success"](
        r.poolEmpty ? "Agent live — aber Pool leer, keine Nummer zugewiesen." : `Agent live${r.number ? `, Nummer ${r.number}` : ""}.`,
      );
    } catch (e) { toast.error(errText(e)); }
  };

  const doPublish = async () => {
    if (!effPrompt.trim()) { toast.error("Prompt darf nicht leer sein."); return; }
    try {
      const r = await m.putAgent.mutateAsync({ kind, systemPrompt: effPrompt, firstMessage: effFirst });
      if (!r.ok) { toast.error(r.error || "Veröffentlichen fehlgeschlagen"); return; }
      toast.success(`Veröffentlicht — Version ${r.version ?? "?"}.`);
      setPrompt(null); setFirstMessage(null);
    } catch (e) { toast.error(errText(e)); }
  };

  if (forbidden) {
    return <p className="text-sm text-amber-400">Kein Super-Admin — das Backend hat mit 403 geantwortet.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Voice-Agent — {tenantId}</CardTitle>
            <CardDescription>
              {exists
                ? <>Vertikale <b>{q.data?.vertical}</b> · Nummer {q.data?.twilio_number || "—"} · Jana {q.data?.jana_mode} · v{q.data?.prompt_version}</>
                : "Für diesen Tenant ist noch kein Agent provisioniert."}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setPrompt(null); setFirstMessage(null); q.refetch(); }} className="gap-1.5">
            {q.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Neu laden
          </Button>
        </CardHeader>

        {(notFound || (!q.isLoading && !exists)) && (
          <CardContent className="grid grid-cols-2 gap-3">
            <div><Label>Vertikale</Label>
              <Select value={prov.vertical} onValueChange={(v) => setProv({ ...prov, vertical: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VERTICALS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
              </Select></div>
            <div><Label>Jana-Modus</Label>
              <Select value={prov.janaMode} onValueChange={(v) => setProv({ ...prov, janaMode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{JANA_MODES.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
              </Select></div>
            <div><Label>Firma *</Label><Input value={prov.firma} onChange={(e) => setProv({ ...prov, firma: e.target.value })} /></div>
            <div><Label>Öffnungszeiten</Label><Input placeholder="Mo–Fr 8–17 Uhr" value={prov.oeffnungszeiten} onChange={(e) => setProv({ ...prov, oeffnungszeiten: e.target.value })} /></div>
            <div className="col-span-2"><Label>Kurzbeschreibung</Label><Input value={prov.firma_beschreibung} onChange={(e) => setProv({ ...prov, firma_beschreibung: e.target.value })} /></div>
            <div><Label>Eskalations-/Notdienstnr.</Label><Input placeholder="+49…" value={prov.notdienst_nummer} onChange={(e) => setProv({ ...prov, notdienst_nummer: e.target.value })} /></div>
            {prov.vertical === "handwerk" && (
              <div><Label>Gewerke</Label><Input value={prov.gewerke} onChange={(e) => setProv({ ...prov, gewerke: e.target.value })} /></div>
            )}
            {prov.vertical === "handwerk" && (
              <div><Label>Einzugsgebiet</Label><Input value={prov.einzugsgebiet} onChange={(e) => setProv({ ...prov, einzugsgebiet: e.target.value })} /></div>
            )}
            <div className="col-span-2"><Label>Wissensbasis / FAQ</Label><Textarea rows={3} value={prov.faq} onChange={(e) => setProv({ ...prov, faq: e.target.value })} /></div>
            <div className="col-span-2 flex justify-end">
              <Button onClick={doProvision} disabled={m.provision.isPending} className="gap-1.5">
                {m.provision.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}Provisionieren
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {exists && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agent-Editor</CardTitle>
            <CardDescription>Prompt und erste Ansage. Veröffentlichen wirkt sofort auf neue Anrufe.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-56"><Label>Agent</Label>
                <Select value={kind} onValueChange={(v) => { setKind(v as "inbound" | "jana"); setPrompt(null); setFirstMessage(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound">Inbound (Customer Service)</SelectItem>
                    <SelectItem value="jana">Jana (Outbound)</SelectItem>
                  </SelectContent>
                </Select></div>
              <Button size="sm" onClick={doPublish} disabled={m.putAgent.isPending || !dirty} className="gap-1.5">
                {m.putAgent.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Veröffentlichen
              </Button>
              {dirty && <span className="text-xs text-amber-400">ungespeicherte Änderungen</span>}
            </div>
            {q.isLoading ? <Skeleton className="h-64 w-full" /> : !q.data?.agent ? (
              <p className="text-sm text-muted-foreground">Für diesen Agent-Typ existiert kein Assistant.</p>
            ) : (
              <>
                <div><Label>Erste Ansage</Label><Input value={effFirst} onChange={(e) => setFirstMessage(e.target.value)} /></div>
                <div><Label>System-Prompt</Label>
                  <Textarea value={effPrompt} onChange={(e) => setPrompt(e.target.value)} rows={16} spellCheck={false} className="font-mono text-xs" /></div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {exists && (
        <Card>
          <CardHeader><CardTitle className="text-base">Anrufe ({tenantId})</CardTitle></CardHeader>
          <CardContent>
            {calls.isLoading ? <Skeleton className="h-20 w-full" />
              : (calls.data?.calls ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Anrufe.</p> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Zeit</TableHead><TableHead>Richtung</TableHead><TableHead>Ende</TableHead><TableHead>Inhalt</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(calls.data?.calls ?? []).map((c) => (
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
      )}

      <p className="text-xs text-muted-foreground">
        <Badge variant="outline" className="mr-1.5 font-normal">Hinweis</Badge>
        Kunden bedienen ihren eigenen Agenten inzwischen selbst unter Voice &amp; Co-Pilot → KI-Agenten.
        Diese Ansicht ist der Super-Admin-Weg für fremde Tenants.
      </p>
    </div>
  );
}
