/**
 * VoiceAgentsTab — Self-Serve KI-Agenten fuer den Betrieb (v4.146.0).
 *
 * Vorher: der Tab sprach direkt mit der Lambda useeasy-vapi-admin, zeigte ALLE
 * Tenants und verlangte eine handgetippte Tenant-ID. Jetzt: Kachel-Katalog, der
 * pro Vorlage erklaert wofuer sie da ist, Aktivierung fuer den EIGENEN Tenant
 * (kommt serverseitig aus dem JWT) und ein Agent-Editor, der nur den eigenen
 * Agenten laedt. Der Betriebs-Teil (alle Tenants, Nummern-Pool, Queue) liegt in
 * AgentAdminPanel und ist serverseitig auf Super-Admins begrenzt.
 *
 * Die Katalog-Texte kommen vom Backend (console_agents.js CATALOG) — eine
 * Quelle der Wahrheit, Textaenderungen brauchen kein Frontend-Release.
 */
import { useMemo, useState } from "react";
import {
  useAgentCatalog, useActivateAgent, useOwnAgent, usePublishOwnAgent,
  useSaveOwnJana, useOwnAgentCalls, useMe,
} from "@/hooks/use-api";
import type { AgentCatalogEntry } from "@/lib/api-client";
import AgentAdminPanel from "@/components/voice/AgentAdminPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Bot, Loader2, Save, RefreshCw, PhoneCall, PhoneOutgoing, Check, ArrowRight,
  Hammer, Building2, ShoppingCart, ShieldCheck, Calculator, AlertTriangle, Info, Phone,
} from "lucide-react";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Unbekannter Fehler");

/** Icons pro Vorlage — der Rest der Kachel kommt komplett aus dem Backend-Katalog. */
const ICONS: Record<string, typeof Hammer> = {
  handwerk: Hammer,
  hausverwaltung: Building2,
  ecommerce: ShoppingCart,
  versicherung: ShieldCheck,
  finanzen: Calculator,
  jana_endkunde: PhoneOutgoing,
  jana_inhaber: PhoneCall,
};

/** Formularfelder fuer die Aktivierung — `needs` aus dem Katalog steuert, was gezeigt wird. */
const FIELDS: Record<string, { label: string; placeholder?: string; long?: boolean; required?: boolean }> = {
  firma: { label: "Firmenname", placeholder: "Schulz Sanitär GmbH", required: true },
  firma_beschreibung: { label: "Was macht ihr? (ein Satz)", placeholder: "Sanitär, Heizung, Bad — seit 1998 in Berlin" },
  oeffnungszeiten: { label: "Öffnungszeiten", placeholder: "Mo–Fr 8–17 Uhr" },
  notdienst_nummer: { label: "Notdienst-/Eskalationsnummer", placeholder: "+4930123456" },
  eskalation_nummer: { label: "Eskalationsnummer", placeholder: "+4930123456" },
  gewerke: { label: "Gewerke", placeholder: "Sanitär, Heizung, Klima" },
  einzugsgebiet: { label: "Einzugsgebiet", placeholder: "Berlin + 30 km" },
  faq: { label: "Wissensbasis / FAQ", long: true, placeholder: "Häufige Fragen und die Antworten, die der Assistent geben darf." },
};

const JANA_MODE_LABEL: Record<string, string> = {
  off: "Aus",
  end_customer: "Rückruf beim Kunden",
  owner: "Erinnerung an den Bearbeiter",
  both: "Kunde anrufen + Bearbeiter benachrichtigen",
};

export default function VoiceAgentsTab() {
  const me = useMe();
  const isSuperAdmin = !!me.data?.user?.is_super_admin;

  const { data, isLoading, error, refetch, isFetching } = useAgentCatalog();
  const activate = useActivateAgent();
  const mine = data?.mine ?? null;

  const [detail, setDetail] = useState<AgentCatalogEntry | null>(null);
  const [activateFor, setActivateFor] = useState<AgentCatalogEntry | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const inbound = useMemo(() => (data?.catalog ?? []).filter((c) => c.group === "inbound"), [data]);
  const jana = useMemo(() => (data?.catalog ?? []).filter((c) => c.group === "jana"), [data]);

  const openActivation = (entry: AgentCatalogEntry) => {
    setDetail(null);
    setForm({ firma: form.firma ?? "" });
    setActivateFor(entry);
  };

  const submitActivation = async () => {
    if (!activateFor) return;
    if (activateFor.group === "jana") {
      // Jana ist kein eigener Agent, sondern ein Modus auf dem bestehenden Tenant.
      try {
        await saveJanaMode(activateFor.jana_mode || "end_customer");
        setActivateFor(null);
      } catch (e) { toast.error(errText(e)); }
      return;
    }
    if (!form.firma?.trim()) { toast.error("Firmenname ist Pflicht."); return; }
    try {
      const res = await activate.mutateAsync({
        vertical: activateFor.slug,
        variables: Object.fromEntries(Object.entries(form).filter(([, v]) => v?.trim())),
      });
      if (!res.ok) { toast.error(res.upstream || res.error || "Aktivierung fehlgeschlagen"); return; }
      if (res.pool_empty) {
        toast.warning("Assistent ist live — aber es war keine Rufnummer frei. Wir melden uns, sobald eine zugewiesen ist.");
      } else {
        toast.success(`Assistent ist live${res.number ? ` unter ${res.number}` : ""}.`);
      }
      setActivateFor(null);
    } catch (e) { toast.error(errText(e)); }
  };

  // ── Jana-Einstellungen ──
  const saveJana = useSaveOwnJana();
  const [janaSla, setJanaSla] = useState(24);
  const [janaFrom, setJanaFrom] = useState("09:00");
  const [janaTo, setJanaTo] = useState("18:00");
  const saveJanaMode = async (mode: string) => {
    const res = await saveJana.mutateAsync({
      mode, slaHours: janaSla, callWindow: { days: [1, 2, 3, 4, 5], from: janaFrom, to: janaTo },
    });
    if (!res.ok) throw new Error(res.error || "Speichern fehlgeschlagen");
    toast.success(mode === "off" ? "Jana ist aus." : `Jana aktiv: ${JANA_MODE_LABEL[mode] ?? mode}`);
  };

  // ── Agent-Editor (eigener Agent) ──
  const [kind, setKind] = useState<"inbound" | "jana">("inbound");
  const agentQ = useOwnAgent(kind, !!mine);
  const publish = usePublishOwnAgent();
  const [prompt, setPrompt] = useState<string | null>(null);
  const [firstMessage, setFirstMessage] = useState<string | null>(null);
  const loadedPrompt = agentQ.data?.agent?.systemPrompt ?? "";
  const loadedFirst = agentQ.data?.agent?.firstMessage ?? "";
  const effPrompt = prompt ?? loadedPrompt;
  const effFirst = firstMessage ?? loadedFirst;
  const dirty = (prompt !== null && prompt !== loadedPrompt) || (firstMessage !== null && firstMessage !== loadedFirst);

  const doPublish = async () => {
    if (!effPrompt.trim()) { toast.error("Der Prompt darf nicht leer sein."); return; }
    try {
      const r = await publish.mutateAsync({ kind, systemPrompt: effPrompt, firstMessage: effFirst });
      if (!r.ok) { toast.error(r.error || "Veröffentlichen fehlgeschlagen"); return; }
      toast.success(`Veröffentlicht — Version ${r.version ?? "?"}. Gilt ab dem nächsten Anruf.`);
      setPrompt(null); setFirstMessage(null);
    } catch (e) { toast.error(errText(e)); }
  };

  const callsQ = useOwnAgentCalls(!!mine);

  // ── Render ──
  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>;
  }
  if (error) {
    return (
      <Card><CardContent className="py-8 text-center space-y-3">
        <p className="text-sm text-red-400">Der Agenten-Katalog konnte nicht geladen werden.</p>
        <p className="text-xs text-muted-foreground">{errText(error)}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Erneut versuchen</Button>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Status: mein Assistent ───────────────────────────────────────── */}
      {mine ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Euer Telefon-Assistent läuft
              </CardTitle>
              <CardDescription>
                {inbound.find((c) => c.slug === mine.vertical)?.title ?? mine.vertical}
                {" · "}Prompt-Version {mine.prompt_version}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Status
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Rufnummer</p>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                {mine.twilio_number || "noch keine zugewiesen"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={mine.status === "live" ? "default" : "secondary"}>{mine.status}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Jana (ausgehend)</p>
              <p className="text-sm font-medium">{JANA_MODE_LABEL[mine.jana_mode] ?? mine.jana_mode}</p>
            </div>
            {!mine.twilio_number && (
              <p className="sm:col-span-3 text-xs text-amber-400 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Der Assistent ist aktiv, hat aber noch keine Rufnummer — es kommen also noch keine Anrufe an.
                Sobald eine Nummer frei ist, wird sie automatisch zugewiesen.
              </p>
            )}
            {mine.twilio_number && (
              <p className="sm:col-span-3 text-xs text-muted-foreground flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Damit Anrufe ankommen, richtet ihr auf eurer bestehenden Nummer eine Rufumleitung auf{" "}
                <span className="font-medium text-foreground">{mine.twilio_number}</span> ein.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Bot className="w-4 h-4" />Noch kein Telefon-Assistent aktiv</CardTitle>
            <CardDescription>
              Wählt unten die Vorlage, die zu eurem Betrieb passt. Klick auf eine Kachel erklärt,
              was der Assistent übernimmt und welche Angaben er dafür braucht.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* ── Katalog: eingehende Anrufe ───────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Telefon-Assistent für eingehende Anrufe</h2>
          <p className="text-sm text-muted-foreground">
            Eine Vorlage pro Betrieb. Der Assistent ist direkt nach dem Aktivieren erreichbar —
            Prompt und Ansage könnt ihr danach jederzeit anpassen.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {inbound.map((c) => {
            const Icon = ICONS[c.slug] ?? Bot;
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => setDetail(c)}
                className={`text-left rounded-xl border p-4 transition-colors hover:border-primary/60 hover:bg-muted/30 ${
                  c.active ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <Icon className="w-5 h-5 text-primary shrink-0" />
                  {c.active && <Badge className="gap-1"><Check className="w-3 h-3" />aktiv</Badge>}
                </div>
                <p className="mt-3 text-sm font-semibold">{c.title}</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{c.tagline}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary">
                  Was macht der? <ArrowRight className="w-3 h-3" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Katalog: Jana ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Jana — ausgehende Rückrufe</h2>
          <p className="text-sm text-muted-foreground">
            Greift, wenn ein E-Mail-Thread liegen bleibt. Braucht einen aktiven Telefon-Assistenten,
            weil Jana über dieselbe Rufnummer anruft.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {jana.map((c) => {
            const Icon = ICONS[c.slug] ?? PhoneOutgoing;
            const locked = !c.selectable;
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => setDetail(c)}
                className={`text-left rounded-xl border p-4 transition-colors hover:border-primary/60 hover:bg-muted/30 ${
                  c.active ? "border-primary bg-primary/5" : "border-border"
                } ${locked ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <Icon className="w-5 h-5 text-primary shrink-0" />
                  {c.active
                    ? <Badge className="gap-1"><Check className="w-3 h-3" />aktiv</Badge>
                    : locked && <Badge variant="outline">Assistent zuerst</Badge>}
                </div>
                <p className="mt-3 text-sm font-semibold">{c.title}</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{c.tagline}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary">
                  Was macht die? <ArrowRight className="w-3 h-3" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Editor + Anrufe (nur mit aktivem Agenten) ────────────────────── */}
      {mine && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Was der Assistent sagt</CardTitle>
              <CardDescription>
                Erste Ansage und Anweisungen anpassen. Veröffentlichen wirkt ab dem nächsten Anruf.
                Platzhalter in doppelten geschweiften Klammern bitte stehen lassen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-64">
                  <Label>Agent</Label>
                  <Select value={kind} onValueChange={(v) => { setKind(v as "inbound" | "jana"); setPrompt(null); setFirstMessage(null); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inbound">Eingehende Anrufe</SelectItem>
                      <SelectItem value="jana">Jana (ausgehend)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setPrompt(null); setFirstMessage(null); agentQ.refetch(); }} className="gap-1.5">
                  {agentQ.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Neu laden
                </Button>
                <Button size="sm" onClick={doPublish} disabled={publish.isPending || !dirty} className="gap-1.5">
                  {publish.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Veröffentlichen
                </Button>
                {dirty && <span className="text-xs text-amber-400">ungespeicherte Änderungen</span>}
              </div>

              {agentQ.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : !agentQ.data?.agent ? (
                <p className="text-sm text-muted-foreground">
                  {kind === "jana"
                    ? "Für Jana ist noch kein Agent angelegt — aktiviert oben eine Jana-Kachel."
                    : "Kein Agent gefunden."}
                </p>
              ) : (
                <>
                  <div>
                    <Label>Erste Ansage</Label>
                    <Input value={effFirst} onChange={(e) => setFirstMessage(e.target.value)} />
                  </div>
                  <div>
                    <Label>Anweisungen (System-Prompt)</Label>
                    <Textarea
                      value={effPrompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={16}
                      spellCheck={false}
                      className="font-mono text-xs"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Jana-Einstellungen</CardTitle>
                <CardDescription>Ab wann nachgefasst wird und in welchem Zeitfenster angerufen werden darf.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <div className="w-72">
                <Label>Modus</Label>
                <Select
                  value={mine.jana_mode}
                  onValueChange={(v) => { saveJanaMode(v).catch((e) => toast.error(errText(e))); }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(JANA_MODE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-32"><Label>Nachfassen nach (Std.)</Label>
                <Input type="number" min={1} max={168} value={janaSla} onChange={(e) => setJanaSla(Number(e.target.value))} /></div>
              <div className="w-28"><Label>Anrufe von</Label>
                <Input value={janaFrom} onChange={(e) => setJanaFrom(e.target.value)} /></div>
              <div className="w-28"><Label>bis</Label>
                <Input value={janaTo} onChange={(e) => setJanaTo(e.target.value)} /></div>
              <Button size="sm" disabled={saveJana.isPending} onClick={() => saveJanaMode(mine.jana_mode).catch((e) => toast.error(errText(e)))} className="gap-1.5">
                {saveJana.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Speichern
              </Button>
              <p className="w-full text-xs text-muted-foreground">
                Mo–Fr, Zeiten in Europe/Berlin. Jana ruft nur auf eine eigene Anfrage des Kunden zurück und
                macht keine Werbung.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Anrufe</CardTitle>
              <CardDescription>Eingehende Anrufe und Jana-Rückrufe eures Assistenten.</CardDescription>
            </CardHeader>
            <CardContent>
              {callsQ.isLoading ? <Skeleton className="h-24 w-full" />
                : (callsQ.data?.calls ?? []).length === 0
                  ? <p className="text-sm text-muted-foreground">Noch keine Anrufe.</p>
                  : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Zeit</TableHead><TableHead>Richtung</TableHead><TableHead>Ende</TableHead><TableHead>Inhalt</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {(callsQ.data?.calls ?? []).map((c) => (
                          <TableRow key={c.vapi_call_id}>
                            <TableCell className="text-xs whitespace-nowrap">{c.started_at?.slice(0, 16).replace("T", " ") || "—"}</TableCell>
                            <TableCell>{c.direction === "outbound" ? "Jana →" : "→ eingehend"}</TableCell>
                            <TableCell className="text-xs">{c.ended_reason || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-md truncate">{c.summary || c.transcript_preview || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Betriebs-Panel (Super-Admin) ─────────────────────────────────── */}
      {isSuperAdmin && <AgentAdminPanel />}

      {/* ── Detail-Dialog: wofuer ist diese Vorlage da? ──────────────────── */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => { const I = ICONS[detail.slug] ?? Bot; return <I className="w-5 h-5 text-primary" />; })()}
                  {detail.title}
                  {detail.active && <Badge className="gap-1"><Check className="w-3 h-3" />aktiv</Badge>}
                </DialogTitle>
                <DialogDescription>{detail.tagline}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <p className="leading-relaxed">{detail.purpose}</p>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Das übernimmt er</p>
                  <ul className="space-y-1">
                    {detail.does.map((d) => (
                      <li key={d} className="flex gap-2 text-sm">
                        <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Passt, wenn</p>
                  <p className="text-sm text-muted-foreground">{detail.good_when}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Dafür braucht er</p>
                  <p className="text-sm text-muted-foreground">
                    {detail.needs.map((n) => FIELDS[n]?.label ?? n).join(" · ")}
                  </p>
                </div>

                {detail.compliance && (
                  <p className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-md px-3 py-2 flex gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{detail.compliance}</span>
                  </p>
                )}

                {detail.group === "jana" && !detail.selectable && (
                  <p className="text-xs text-amber-400 flex gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Aktiviert zuerst einen Telefon-Assistenten — Jana ruft über dessen Rufnummer an.
                  </p>
                )}
                {detail.group === "inbound" && !!mine && !detail.active && (
                  <p className="text-xs text-amber-400 flex gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Ihr habt bereits „{inbound.find((c) => c.slug === mine.vertical)?.title}" aktiv.
                    Ein Betrieb hat genau einen Telefon-Assistenten — bei einem Wechsel meldet euch bei uns.
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setDetail(null)}>Schließen</Button>
                {!detail.active && detail.selectable && !(detail.group === "inbound" && !!mine) && (
                  <Button onClick={() => openActivation(detail)} className="gap-1.5">
                    Auswählen <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Aktivierungs-Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!activateFor} onOpenChange={(o) => !o && setActivateFor(null)}>
        <DialogContent className="max-w-xl">
          {activateFor && (
            <>
              <DialogHeader>
                <DialogTitle>{activateFor.title} aktivieren</DialogTitle>
                <DialogDescription>
                  {activateFor.group === "jana"
                    ? "Jana nutzt eure bestehende Rufnummer und die Angaben eures Telefon-Assistenten."
                    : "Diese Angaben werden in die Vorlage eingesetzt. Danach ist der Assistent sofort erreichbar."}
                </DialogDescription>
              </DialogHeader>

              {activateFor.group === "inbound" && (
                <div className="grid grid-cols-2 gap-3">
                  {activateFor.needs.filter((n) => FIELDS[n]).map((n) => {
                    const f = FIELDS[n];
                    return (
                      <div key={n} className={f.long ? "col-span-2" : ""}>
                        <Label>{f.label}{f.required ? " *" : ""}</Label>
                        {f.long ? (
                          <Textarea rows={3} placeholder={f.placeholder} value={form[n] ?? ""} onChange={(e) => setForm({ ...form, [n]: e.target.value })} />
                        ) : (
                          <Input placeholder={f.placeholder} value={form[n] ?? ""} onChange={(e) => setForm({ ...form, [n]: e.target.value })} />
                        )}
                      </div>
                    );
                  })}
                  <p className="col-span-2 text-xs text-muted-foreground">
                    Die Rufnummer wird automatisch zugewiesen. Ihr richtet danach nur noch eine
                    Rufumleitung von eurer bestehenden Nummer ein.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={() => setActivateFor(null)}>Abbrechen</Button>
                <Button onClick={submitActivation} disabled={activate.isPending || saveJana.isPending} className="gap-1.5">
                  {(activate.isPending || saveJana.isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Jetzt aktivieren
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
