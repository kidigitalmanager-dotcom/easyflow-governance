/**
 * AgentAdminPanel — Super-Admin-Sicht auf die Voice-Agenten (v4.146.0).
 *
 * Enthaelt alles, was frueher JEDER eingeloggte Kunde im KI-Agenten-Tab sehen
 * konnte: alle Tenants, den Twilio-Nummern-Pool und die Jana-Queue. Die Daten
 * kommen jetzt ueber /voice/agents/admin/* — der api-router prueft die Rolle
 * serverseitig (isSuperAdmin) und liefert sonst 403. Das Ausblenden hier ist
 * reine UX; die Rechte haengen am Backend.
 */
import { useState } from "react";
import { useAgentAdminOverview, useAgentAdminPool } from "@/hooks/use-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, RefreshCw, ShieldAlert, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Unbekannter Fehler");

export default function AgentAdminPanel() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = useAgentAdminOverview(open);
  const pool = useAgentAdminPool();
  const [add, setAdd] = useState({ number: "", accountSid: "", authToken: "" });

  const forbidden = error && (error as { status?: number }).status === 403;

  const addNumber = async () => {
    if (!add.number.trim() || !add.accountSid.trim() || !add.authToken.trim()) {
      toast.error("Nummer, Account SID und Auth Token sind Pflicht.");
      return;
    }
    try {
      await pool.addNumber.mutateAsync({
        number: add.number.trim(), accountSid: add.accountSid.trim(), authToken: add.authToken.trim(),
      });
      toast.success("Nummer im Pool.");
      setAdd({ number: "", accountSid: "", authToken: "" });
    } catch (e) { toast.error(errText(e)); }
  };

  const refill = async () => {
    try {
      const r = await pool.refill.mutateAsync();
      toast.success(r.bought?.length ? `${r.bought.length} Nummer(n) gekauft.` : "Pool ist ausreichend gefüllt.");
    } catch (e) { toast.error(errText(e)); }
  };

  const importNr = async (number: string) => {
    try { await pool.importNumber.mutateAsync(number); toast.success(`${number} in den Pool aufgenommen.`); }
    catch (e) { toast.error(errText(e)); }
  };

  const freeCount = (data?.pool ?? []).filter((n) => n.status === "free").length;

  return (
    <Card className="border-dashed">
      <CardHeader
        className="flex flex-row items-center justify-between space-y-0 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <ShieldAlert className="w-4 h-4" />
            UseEasy-Betrieb
            <Badge variant="outline" className="ml-1 font-normal">nur Super-Admin</Badge>
          </CardTitle>
          <CardDescription>
            Alle Kunden-Agenten, Twilio-Nummern-Pool und Jana-Queue. Kunden sehen diesen Block nicht —
            der api-router antwortet ihnen mit 403.
          </CardDescription>
        </div>
        {open && (
          <Button
            variant="outline" size="sm" className="gap-1.5"
            onClick={(e) => { e.stopPropagation(); refetch(); }}
          >
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Neu laden
          </Button>
        )}
      </CardHeader>

      {open && (
        <CardContent className="space-y-8">
          {forbidden && (
            <p className="text-sm text-amber-400">
              Dein Login ist kein Super-Admin — das Backend hat mit 403 geantwortet.
              (Rechte kommen aus <code>SUPER_ADMIN_EMAILS</code> im api-router.)
            </p>
          )}
          {error && !forbidden && <p className="text-sm text-red-400">Konnte nicht laden: {errText(error)}</p>}
          {isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>}

          {data?.partial && (
            <p className="text-xs text-amber-400">
              Teilausfall: mindestens eine Upstream-Quelle (Vapi/Twilio) hat nicht geantwortet — die
              angezeigten Blöcke stimmen, es können welche fehlen.
            </p>
          )}

          {data && (
            <>
              {/* Alle Kunden-Agenten */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Kunden-Agenten ({data.tenants.length})</h3>
                {data.tenants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Noch keine Agenten provisioniert.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Tenant</TableHead><TableHead>Vertikale</TableHead><TableHead>Nummer</TableHead>
                      <TableHead>Jana</TableHead><TableHead>Status</TableHead><TableHead>Prompt</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.tenants.map((t) => (
                        <TableRow key={t.tenant_id}>
                          <TableCell className="font-medium">{t.tenant_id}</TableCell>
                          <TableCell>{t.vertical}</TableCell>
                          <TableCell>{t.twilio_number || "—"}</TableCell>
                          <TableCell>{t.jana_mode}</TableCell>
                          <TableCell><Badge variant={t.status === "live" ? "default" : "secondary"}>{t.status}</Badge></TableCell>
                          <TableCell>v{t.prompt_version}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>

              {/* Nummern-Pool */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Twilio-Nummern-Pool — <span className={freeCount === 0 ? "text-red-400" : "text-emerald-400"}>{freeCount} frei</span>
                  </h3>
                  <Button variant="outline" size="sm" onClick={refill} disabled={pool.refill.isPending} className="gap-1.5">
                    {pool.refill.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Jetzt auffüllen
                  </Button>
                </div>
                {freeCount === 0 && (
                  <p className="text-xs text-amber-400">
                    Pool ist leer. Aktiviert jetzt ein Kunde einen Agenten, kauft das Provisioning
                    on-demand nach — schlägt das fehl, geht der Agent ohne Rufnummer live.
                  </p>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-44"><Label className="text-xs">Nummer (E.164)</Label>
                    <Input value={add.number} onChange={(e) => setAdd({ ...add, number: e.target.value })} placeholder="+4930…" /></div>
                  <div className="w-56"><Label className="text-xs">Twilio Account SID</Label>
                    <Input value={add.accountSid} onChange={(e) => setAdd({ ...add, accountSid: e.target.value })} /></div>
                  <div className="w-56"><Label className="text-xs">Twilio Auth Token</Label>
                    <Input type="password" value={add.authToken} onChange={(e) => setAdd({ ...add, authToken: e.target.value })} /></div>
                  <Button size="sm" onClick={addNumber} disabled={pool.addNumber.isPending} className="gap-1.5">
                    {pool.addNumber.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    In Pool aufnehmen
                  </Button>
                </div>

                {!data.twilio_configured ? (
                  <p className="text-sm text-muted-foreground">
                    Twilio nicht verbunden — <code>accountSid</code>, <code>authToken</code>, <code>bundleSid</code>,{" "}
                    <code>addressSid</code> ins AWS-Secret <code>useeasy/voice/twilio</code> eintragen.
                  </p>
                ) : data.twilio_numbers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Nummern im Twilio-Account.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Nummer</TableHead><TableHead>Name</TableHead><TableHead>Pool</TableHead>
                      <TableHead>Kunde</TableHead><TableHead></TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.twilio_numbers.map((n) => (
                        <TableRow key={n.number}>
                          <TableCell className="font-medium">{n.number}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{n.friendlyName}</TableCell>
                          <TableCell>
                            <Badge variant={n.poolStatus === "free" ? "secondary" : n.poolStatus === "assigned" ? "default" : "outline"}>
                              {n.poolStatus === "free" ? "frei" : n.poolStatus === "assigned" ? "zugewiesen" : "nicht im Pool"}
                            </Badge>
                          </TableCell>
                          <TableCell>{n.tenantId || "—"}</TableCell>
                          <TableCell>
                            {n.poolStatus === "nicht_im_pool" && (
                              <Button variant="outline" size="sm" onClick={() => importNr(n.number)}>In Pool</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>

              {/* Jana-Queue */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Jana-Queue ({data.queue.length})</h3>
                {data.queue.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine offenen Follow-ups.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Tenant</TableHead><TableHead>Thread</TableHead><TableHead>Ziel</TableHead>
                      <TableHead>Fällig</TableHead><TableHead>Versuche</TableHead><TableHead>Status</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.queue.map((r) => (
                        <TableRow key={`${r.tenant_id}-${r.thread_key}-${r.target}`}>
                          <TableCell>{r.tenant_id}</TableCell>
                          <TableCell className="font-mono text-xs">{r.thread_key}</TableCell>
                          <TableCell>{r.target === "owner" ? "Bearbeiter" : "Endkunde"}</TableCell>
                          <TableCell className="text-xs">{r.due_at?.slice(0, 16).replace("T", " ")}</TableCell>
                          <TableCell>{r.attempts}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === "done" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>
                            {r.last_error && <span className="ml-2 text-xs text-muted-foreground">{r.last_error}</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>

              {/* Vorlagen-Rohtexte */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">[TPL]-Vorlagen in Vapi ({data.templates.length})</h3>
                <p className="text-xs text-muted-foreground">
                  Basis jeder Provisionierung. Die Kunden-Kacheln oben beschreiben denselben Satz in
                  Klartext — die Zuordnung Kachel → Vorlage steht im <code>TEMPLATE_MAP</code> der vapi-admin-Lambda.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {data.templates.map((t) => (
                    <details key={t.id} className="rounded-lg border p-3">
                      <summary className="text-sm font-medium cursor-pointer">{t.name}</summary>
                      <p className="text-xs text-muted-foreground mt-2">{t.firstMessage}</p>
                      <pre className="text-[11px] text-muted-foreground mt-2 whitespace-pre-wrap max-h-48 overflow-auto">{t.systemPrompt}</pre>
                    </details>
                  ))}
                </div>
              </section>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
