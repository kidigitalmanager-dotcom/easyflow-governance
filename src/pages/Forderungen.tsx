import { useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useDocuments,
  useScanSentForAr,
  useGenerateDunning,
  useDocumentVerdict,
  useMarkArPaid,
  useAddManualAr,
  useImportArXlsx,
  useConfirmArInvoice,
  useRunDunning,
} from "@/hooks/use-api";
import type { TenantDocument, DunningDraft, DunningRunResult, DunningRunItem } from "@/lib/api-client";
import { exportArXlsx, exportArCsvDatev } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { RechnungenView } from "@/pages/Rechnungen";
import { PageHeader, SectionCard, Chip, Dot, EmptyState, type DotTone } from "@/components/ue/primitives";
import { describeSkipped, type SkipInfo } from "@/lib/scan-result";
import { toast } from "sonner";
import {
  Receipt, ReceiptText, RefreshCw, Download, Upload, Plus, Mail, CheckCircle2, Loader2, AlertTriangle,
  Send, FileSpreadsheet, FileText, ChevronDown, PlayCircle,
} from "lucide-react";

// Forderungen & Erinnerungen (Phase 0/1a + v4.134.0 Mahn-Zyklus). Der Ledger fuellt sich
// thread-abgeleitet aus dem Gesendet-Ordner ("Jetzt scannen") + optional aus einer Excel-Liste.
// Eine Erinnerung wird als Entwurf ins Postfach gelegt — NIE automatisch versendet.
// v4.134.0: Zyklus-Spalten (Mahnstufe/zuletzt erinnert/naechste Aktion), Bestaetigen-Geste,
// on-demand "Alle faelligen Entwuerfe" (dry_run-Vorschau -> echt), Entwurfs-Warteschlange,
// Steuerberater-CSV (DATEV-kompatibel).
//
// Redesign 27.07.2026: Console-Bausteine (PageHeader/SectionCard/Chip/Dot/EmptyState) statt
// Card+Table. Aus der 8-spaltigen Tabelle sind Listenzeilen geworden — die Spalten "Mahnstufe",
// "Zuletzt erinnert" und "Naechste Aktion" stehen jetzt als Meta-Zeile unter dem Kunden, damit
// auf schmalen Fenstern nichts mehr abgeschnitten wird. Es ist KEINE Aktion entfallen.

const DAY_MS = 86_400_000;

function stufeLabel(s: number | null): string {
  if (s === 3) return "Letzte Erinnerung";
  if (s === 2) return "2. Erinnerung";
  return "Zahlungserinnerung";
}

/* Mahnstufe als Token-Pille (kein Roh-Tailwind): 3 = Alarm, 2 = Frist, 1 = neutral.
   Ohne Stufe wird nichts gerendert — die Spalte "naechste Aktion" sagt ohnehin,
   was ansteht, und eine Pille "keine" waere nur Rauschen. */
function stufeBadge(s: number | null | undefined) {
  if (!s) return null;
  const tone =
    s >= 3 ? "bg-danger/15 text-danger" : s === 2 ? "bg-amber/15 text-amber" : "bg-secondary text-muted-foreground";
  return (
    <span className={"whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold " + tone}>
      Stufe <span className="tabular">{s}</span>
    </span>
  );
}

function naechsteAktion(r: TenantDocument): string {
  if (!r.overdue) return "noch nicht fällig";
  if (r.needs_confirmation) return "erst bestätigen";
  const s = r.suggested_mahnstufe ?? (Math.min(3, (r.mahnstufe ?? 0) + 1) || 1);
  return `Stufe ${s} vorbereiten`;
}

function previewItems(r: DunningRunResult | null): DunningRunItem[] {
  if (!r?.results) return [];
  return r.results.flatMap((x) => x.items ?? []);
}

/* Fehlt der Betrag, steht ein Gedankenstrich da — keine erfundene Null. */
function formatAmount(v: number | null | undefined, currency: string | null | undefined): string {
  if (v == null) return "–";
  try { return new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(v); }
  catch { return `${v} ${currency || "EUR"}`; }
}
function fmtDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("de-DE") : "–";
}

/* Statuspunkt der Zeile: ueberfaellig = rot, in den naechsten 7 Tagen faellig = amber.
   Beides kommt aus Server-Feldern (overdue/due_date), nichts wird geschaetzt. */
function faelligTone(r: { overdue: boolean; due_date: string | null }, now = Date.now()): DotTone {
  if (r.overdue) return "danger";
  const t = r.due_date ? Date.parse(r.due_date) : NaN;
  if (Number.isFinite(t) && t <= now + 7 * DAY_MS) return "amber";
  return "muted";
}
function isBaldFaellig(r: { overdue: boolean; due_date: string | null }, now = Date.now()): boolean {
  return !r.overdue && faelligTone(r, now) === "amber";
}

type ArFilter = "alle" | "ueberfaellig" | "bald" | "pruefen";

// Umbau 2026-07-27 (Leon): Forderungen und Rechnungen sind EINE Seite mit zwei
// Untertabs — die Rechnung ist die Quelle, die offene Forderung ihr Zustand.
// (Backend v4.148.0: Finalisieren einer Rechnung legt die Forderung automatisch an.)
// Der Tab-Zustand haengt weiterhin am Query-Parameter ?tab=rechnungen, damit
// /forderungen?tab=rechnungen&invoice=<id> (Angebote/Zeiterfassung) weiter greift.
export default function ForderungenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "rechnungen" ? "rechnungen" : "forderungen";
  const setTab = (v: string) =>
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      if (v === "forderungen") n.delete("tab"); else n.set("tab", v);
      return n;
    }, { replace: true });

  // Gleicher Query-Key wie in ForderungenView — react-query liefert beide Aufrufe
  // aus einem Request. Bei Fehler bleibt der Zaehler leer statt "0" zu behaupten.
  const open = useDocuments("ar_invoice", "open");
  const openCount = open.isSuccess ? (open.data?.items?.length ?? 0) : undefined;

  const tabs = (
    <div className="flex flex-wrap gap-1.5">
      <Chip active={tab === "forderungen"} count={openCount} onClick={() => setTab("forderungen")}>
        <Receipt className="h-3.5 w-3.5" /> Forderungen
      </Chip>
      <Chip active={tab === "rechnungen"} onClick={() => setTab("rechnungen")}>
        <ReceiptText className="h-3.5 w-3.5" /> Rechnungen
      </Chip>
    </div>
  );

  return (
    <div className="space-y-6">
      {tab === "forderungen" ? (
        <ForderungenView tabs={tabs} />
      ) : (
        <>
          {tabs}
          {/* RechnungenView bringt eigenen Kopf und eigenen Deep-Link (?invoice=) mit. */}
          <RechnungenView />
        </>
      )}
    </div>
  );
}

function ForderungenView({ tabs }: { tabs: React.ReactNode }) {
  const open = useDocuments("ar_invoice", "open");
  const paid = useDocuments("ar_invoice", "paid");
  const dunningQueue = useDocuments("dunning", "draft");
  const scan = useScanSentForAr();
  const generate = useGenerateDunning();
  const verdict = useDocumentVerdict();
  const markPaid = useMarkArPaid();
  const addManual = useAddManualAr();
  const importXlsx = useImportArXlsx();
  const confirmAr = useConfirmArInvoice();
  const runDun = useRunDunning();
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<DunningDraft | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [useLlm, setUseLlm] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [manual, setManual] = useState({ counterpart_name: "", counterpart_email: "", invoice_ref: "", amount_gross: "", due_date: "" });
  const [preview, setPreview] = useState<DunningRunResult | null>(null);
  const [showCsv, setShowCsv] = useState(false);
  const [csvFrom, setCsvFrom] = useState("");
  const [csvTo, setCsvTo] = useState("");
  const [filter, setFilter] = useState<ArFilter>("alle");
  // 2026-07-27: Spinner nur in der geklickten Zeile — vorher drehte sich das
  // Icon in JEDER Zeile, weil nur der globale isPending-Zustand abgefragt wurde.
  const [busyRow, setBusyRow] = useState<number | null>(null);
  // Ergebnis des letzten Scans, falls er uebersprungen wurde. Ein Toast ist nach
  // drei Sekunden weg; wenn der Betrieb gar nicht freigeschaltet ist, muss der
  // Hinweis stehen bleiben, sonst klickt man ewig weiter.
  const [scanSkip, setScanSkip] = useState<SkipInfo | null>(null);

  const rows = open.data?.items ?? [];
  const paidRows = paid.data?.items ?? [];
  const queue = dunningQueue.data?.items ?? [];

  const counts = {
    alle: rows.length,
    ueberfaellig: rows.filter((r) => r.overdue).length,
    bald: rows.filter((r) => isBaldFaellig(r)).length,
    pruefen: rows.filter((r) => r.needs_confirmation).length,
  };
  const shown = rows.filter((r) =>
    filter === "ueberfaellig" ? r.overdue
      : filter === "bald" ? isBaldFaellig(r)
        : filter === "pruefen" ? !!r.needs_confirmation
          : true,
  );

  async function handleScan() {
    try {
      const r = await scan.mutateAsync(720); // letzte 30 Tage
      // `skipped` kann ein Zaehler ODER ein Abbruchgrund sein. describeSkipped
      // trennt beides und liefert deutschen Klartext statt des Roh-Enums.
      const skip = describeSkipped(r.skipped);
      setScanSkip(skip);
      if (skip?.tone === "blocked") toast.error(skip.title);
      else if (skip) toast.info(skip.title + ": " + skip.hint);
      else toast.success(`Gesendet-Ordner gescannt: ${r.upserted ?? 0} Forderungen erfasst (${r.structured ?? 0} aus E-Rechnung, ${r.text_fallback ?? 0} aus E-Mail-Text).`);
    } catch { toast.error("Scan fehlgeschlagen."); }
  }

  async function handleGenerate(ar: TenantDocument) {
    setBusyRow(ar.id);
    try {
      const d = await generate.mutateAsync({ arInvoiceId: ar.id, use_llm: useLlm });
      setDraft(d); setEditSubject(d.subject); setEditBody(d.body);
    } catch { toast.error("Entwurf konnte nicht erzeugt werden."); }
    finally { setBusyRow(null); }
  }

  async function handleApprove() {
    if (!draft) return;
    try {
      await verdict.mutateAsync({ documentId: draft.dunning_document_id, action: "approve", subject: editSubject, body: editBody });
      toast.success("Erinnerung liegt als Entwurf in deinem Postfach. Du kannst sie dort prüfen und senden.");
      setDraft(null); open.refetch();
    } catch { toast.error("Konnte den Entwurf nicht ins Postfach legen."); }
  }
  async function handleReject() {
    if (!draft) return;
    try { await verdict.mutateAsync({ documentId: draft.dunning_document_id, action: "reject" }); toast.info("Entwurf verworfen."); setDraft(null); }
    catch { toast.error("Aktion fehlgeschlagen."); }
  }

  // v4.134.0 — Entwurfs-Warteschlange: Freigeben/Verwerfen direkt (bestehender verdict-Flow).
  async function queueApprove(d: TenantDocument) {
    setBusyRow(d.id);
    try { await verdict.mutateAsync({ documentId: d.id, action: "approve" }); toast.success("Erinnerung liegt als Entwurf in deinem Postfach."); }
    catch { toast.error("Konnte den Entwurf nicht ins Postfach legen."); }
    finally { setBusyRow(null); }
  }
  async function queueReject(d: TenantDocument) {
    setBusyRow(d.id);
    try { await verdict.mutateAsync({ documentId: d.id, action: "reject" }); toast.info("Entwurf verworfen."); }
    catch { toast.error("Aktion fehlgeschlagen."); }
    finally { setBusyRow(null); }
  }

  // v4.134.0 — Bestaetigen-Geste fuer needs_confirmation-Zeilen (Text-Fallback).
  async function handleConfirm(r: TenantDocument) {
    setBusyRow(r.id);
    try {
      const res = await confirmAr.mutateAsync(r.id);
      if (!res.ok) { toast.error("Konnte die Forderung nicht bestätigen."); return; }
      toast.success("Forderung bestätigt. Sie kann jetzt automatisch bemahnt werden.");
      open.refetch();
    } catch { toast.error("Konnte die Forderung nicht bestätigen."); }
    finally { setBusyRow(null); }
  }

  // v4.134.0 — "Alle faelligen Entwuerfe": erst dry_run-Vorschau, dann echt.
  async function handleDryRun() {
    try {
      const r = await runDun.mutateAsync(true);
      if (r.migration_missing) { toast.error("Der Zyklus ist serverseitig noch nicht freigeschaltet (Migration ausstehend)."); return; }
      setPreview(r);
    } catch { toast.error("Vorschau fehlgeschlagen."); }
  }
  async function handleRunReal() {
    try {
      const r = await runDun.mutateAsync(false);
      // 2026-07-27: Es zaehlt, was der SERVER erzeugt hat — nicht die Vorschau.
      // (Zwischen Vorschau und Lauf koennen Cooldown/Cap/Fehler die Menge aendern.)
      const generated = r.generated ?? (r.results ?? []).reduce((a, x) => a + (x.generated ?? 0), 0);
      const errors = (r.results ?? []).reduce((a, x) => a + (typeof x.errors === "number" ? x.errors : 0), 0);
      if (errors > 0) toast.warning(`${generated} Erinnerungs-Entwürfe erzeugt, ${errors} fehlgeschlagen.`);
      else toast.success(`${generated} Erinnerungs-Entwürfe erzeugt. Sie liegen unten zur Freigabe bereit.`);
      setPreview(null);
      open.refetch(); dunningQueue.refetch();
    } catch { toast.error("Erzeugen fehlgeschlagen."); }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const buf = await f.arrayBuffer();
    let bin = ""; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    try {
      const r = await importXlsx.mutateAsync(b64);
      toast.success(`Import: ${r.imported ?? 0} neu, ${r.updated ?? 0} aktualisiert, ${r.marked_paid ?? 0} als bezahlt.`);
    } catch { toast.error("Import fehlgeschlagen (bitte .xlsx prüfen)."); }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleAddManual() {
    if (!manual.amount_gross) { toast.error("Bitte einen Betrag angeben."); return; }
    try {
      await addManual.mutateAsync(manual);
      toast.success("Forderung hinzugefügt.");
      setShowAdd(false); setManual({ counterpart_name: "", counterpart_email: "", invoice_ref: "", amount_gross: "", due_date: "" });
    } catch { toast.error("Konnte die Forderung nicht speichern."); }
  }

  async function handleCsvExport() {
    try {
      await exportArCsvDatev({ from: csvFrom || undefined, to: csvTo || undefined });
      setShowCsv(false);
    } catch { toast.error("CSV-Export fehlgeschlagen."); }
  }

  const previewCount = previewItems(preview).length;

  return (
    <>
      <PageHeader
        kicker="Buchhaltung"
        title="Forderungen & Erinnerungen"
        subtitle="Jana erkennt aus deinem Gesendet-Ordner, welche Rechnungen offen sind, und bereitet Zahlungserinnerungen als Entwurf vor. Gesendet wird nie automatisch."
        actions={
          /* Die actions-Spalte des PageHeader ist shrink-0 — fuenf Buttons wuerden auf
             schmalen Fenstern seitlich herauslaufen statt umzubrechen. Die Breiten-
             Deckelung unterhalb von xl erzwingt den Umbruch; ab xl ist Platz fuer eine Zeile.
             (Kein Seiten-Rahmen, nur diese Button-Leiste.) */
          <div className="flex max-w-[420px] flex-wrap justify-end gap-2 xl:max-w-none">
            <Button variant="outline" size="sm" onClick={handleScan} disabled={scan.isPending}>
              {scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Jetzt scannen
            </Button>
            <Button variant="outline" size="sm" onClick={handleDryRun} disabled={runDun.isPending}>
              {runDun.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} Alle fälligen Entwürfe
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" /> Export <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Forderungen exportieren</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => exportArXlsx().catch(() => toast.error("Export fehlgeschlagen."))}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (Betrieb)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowCsv(true)}>
                  <FileText className="mr-2 h-4 w-4" /> CSV für Steuerberater (DATEV-kompatibel)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Liste importieren
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFile} />
            <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Manuell</Button>
          </div>
        }
      />

      {tabs}

      {scanSkip && (
        <div
          className={
            "flex items-start gap-3 rounded-[var(--radius)] border px-4 py-3 " +
            (scanSkip.tone === "blocked"
              ? "border-amber-surface bg-amber-surface/30"
              : "border-line-soft bg-muted")
          }
          role="status"
        >
          <AlertTriangle className={"mt-0.5 h-4 w-4 shrink-0 " + (scanSkip.tone === "blocked" ? "text-amber" : "text-muted-foreground")} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">{scanSkip.title}</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">{scanSkip.hint}</p>
          </div>
          <button
            type="button"
            onClick={() => setScanSkip(null)}
            className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Ausblenden
          </button>
        </div>
      )}

      <div className="flex items-center gap-2.5 rounded-[var(--radius)] border border-line-soft bg-muted px-4 py-2.5">
        <Switch checked={useLlm} onCheckedChange={setUseLlm} id="llm" />
        <Label htmlFor="llm" className="text-[12.5px] text-muted-foreground">
          Erinnerungen im Jana-Ton formulieren (sonst neutrale Vorlage)
        </Label>
      </div>

      {/* v4.134.0 — Entwurfs-Warteschlange: vom Zyklus erzeugte Erinnerungen zur Freigabe.
          2026-07-27: Ladefehler duerfen nicht wie "alles erledigt" aussehen — deshalb
          bekommt die Karte den Fehlerzustand STATT still zu verschwinden. */}
      {(dunningQueue.isError || queue.length > 0) && (
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              Erinnerungs-Entwürfe zur Freigabe
              {!dunningQueue.isError && <span className="tabular text-tx-weak">({queue.length})</span>}
            </span>
          }
          subtitle="vom Mahn-Zyklus vorbereitet · nichts wird versendet, bevor du freigibst"
          bodyClassName="p-0"
        >
          {dunningQueue.isError ? (
            <div className="p-4">
              <QueryErrorNotice
                label="Die Entwurfs-Warteschlange konnte nicht geladen werden."
                onRetry={() => dunningQueue.refetch()}
                retrying={dunningQueue.isFetching}
              />
            </div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {queue.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {stufeBadge(d.mahnstufe)}
                      <span className="truncate text-[13px] font-medium">
                        {d.counterpart_name || d.counterpart_email || "keine Angabe"}
                      </span>
                      {d.invoice_ref && <span className="text-[11px] text-tx-weak">Rechnung {d.invoice_ref}</span>}
                    </div>
                    {d.subject && <p className="mt-0.5 truncate text-[12px] text-tx-secondary">{d.subject}</p>}
                    {d.amount_display && <p className="tabular text-[11px] text-muted-foreground">{d.amount_display}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => queueReject(d)} disabled={verdict.isPending}>
                      Verwerfen
                    </Button>
                    <Button size="sm" onClick={() => queueApprove(d)} disabled={verdict.isPending}>
                      {busyRow === d.id && verdict.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Freigeben
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {/* data-tour: Ziel des gefuehrten Durchlaufs "buchhaltung-belege" (06.08.2026). */}
      <div data-tour="forderungen-liste">
      <SectionCard
        title="Offene Forderungen"
        subtitle={
          open.isSuccess
            ? (rows.length === 0
                ? "aus deinem Gesendet-Ordner und aus importierten Listen"
                : `${rows.length} offen · ${counts.ueberfaellig} überfällig`)
            : undefined
        }
        bodyClassName="p-0"
        action={
          open.isSuccess && rows.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              <Chip active={filter === "alle"} count={counts.alle} onClick={() => setFilter("alle")}>Alle</Chip>
              <Chip active={filter === "ueberfaellig"} count={counts.ueberfaellig} onClick={() => setFilter("ueberfaellig")}>Überfällig</Chip>
              <Chip active={filter === "bald"} count={counts.bald} onClick={() => setFilter("bald")}>Bald fällig</Chip>
              {/* Der Chip bleibt sichtbar, solange er aktiv ist — sonst verschwindet
                  beim Bestaetigen der letzten Zeile der Filter, und die Liste sieht
                  leer aus, ohne dass man den Weg zurueck findet. */}
              {(counts.pruefen > 0 || filter === "pruefen") && (
                <Chip active={filter === "pruefen"} count={counts.pruefen} onClick={() => setFilter("pruefen")}>Zu prüfen</Chip>
              )}
            </div>
          ) : null
        }
      >
        {open.isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : open.isError ? (
          <div className="p-4">
            <QueryErrorNotice
              label="Die offenen Forderungen konnten nicht geladen werden."
              onRetry={() => open.refetch()}
              retrying={open.isFetching}
            />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-8 w-8" />}
            title="Noch keine offenen Forderungen"
            description="Klicke auf „Jetzt scannen“, um deinen Gesendet-Ordner nach verschickten Rechnungen zu durchsuchen, oder importiere eine Liste."
            action={
              <Button variant="outline" size="sm" onClick={handleScan} disabled={scan.isPending}>
                {scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Jetzt scannen
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            Keine Forderung in diesem Filter.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {shown.map((r) => {
              const meta: string[] = [];
              if (r.counterpart_email && r.counterpart_name) meta.push(r.counterpart_email);
              meta.push(`fällig ${fmtDate(r.due_date)}`);
              meta.push(
                r.last_reminded_at
                  ? `zuletzt erinnert ${fmtDate(r.last_reminded_at)}${r.reminder_count ? ` (${r.reminder_count}×)` : ""}`
                  : "noch nie erinnert",
              );
              return (
                <li key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                  <Dot tone={faelligTone(r)} className="mt-[7px]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-[13px] font-medium">
                        {r.counterpart_name || r.counterpart_email || "–"}
                      </span>
                      {r.invoice_ref && <span className="text-[11px] text-tx-weak">Rechnung {r.invoice_ref}</span>}
                      {stufeBadge(r.mahnstufe || r.suggested_mahnstufe)}
                      {r.overdue && r.days_overdue != null && (
                        <span className="whitespace-nowrap rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-semibold text-danger">
                          <span className="tabular">{r.days_overdue}</span> Tage überfällig
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{meta.join(" · ")}</p>
                    {r.needs_confirmation && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold text-amber">
                          <AlertTriangle className="h-3 w-3" /> bitte prüfen
                        </span>
                        <Button
                          size="sm" variant="outline" className="h-6 px-2 text-xs"
                          onClick={() => handleConfirm(r)} disabled={confirmAr.isPending}
                        >
                          {busyRow === r.id && confirmAr.isPending
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <CheckCircle2 className="mr-1 h-3 w-3" />} Bestätigen
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[13px] font-medium">{r.amount_display || "–"}</p>
                    <p className="text-[11px] text-tx-weak">{naechsteAktion(r)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {r.overdue && (
                      <Button size="sm" onClick={() => handleGenerate(r)} disabled={generate.isPending}>
                        {busyRow === r.id && generate.isPending
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Mail className="h-4 w-4" />} Erinnerung
                      </Button>
                    )}
                    <Button
                      size="sm" variant="ghost" aria-label="Als bezahlt markieren" title="Als bezahlt markieren"
                      onClick={() => markPaid.mutate({ arInvoiceId: r.id }, { onError: () => toast.error("Konnte die Forderung nicht als bezahlt markieren.") })}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
      </div>

      {/* 2026-07-27: Auch die Bezahlt-Liste braucht einen echten Fehlerzustand — sonst
          sieht ein Ladefehler aus, als haette der Betrieb nie eine Zahlung erhalten. */}
      {(paid.isError || paidRows.length > 0) && (
        <SectionCard
          title={
            <span className="flex items-center gap-2 text-muted-foreground">
              Bezahlt {!paid.isError && <span className="tabular">({paidRows.length})</span>}
            </span>
          }
          subtitle={!paid.isError && paidRows.length > 10 ? "die zehn jüngsten · vollständig im Excel-Export" : undefined}
          bodyClassName="p-0"
        >
          {paid.isError ? (
            <div className="p-4">
              <QueryErrorNotice
                label="Die bezahlten Forderungen konnten nicht geladen werden."
                onRetry={() => paid.refetch()}
                retrying={paid.isFetching}
              />
            </div>
          ) : (
            <>
              <ul className="divide-y divide-line-soft">
                {paidRows.slice(0, 10).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                      {r.counterpart_name || r.counterpart_email || "–"}
                      {r.invoice_ref ? ` · ${r.invoice_ref}` : ""}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-[12.5px]">{r.amount_display || "–"}</span>
                      <Button
                        size="sm" variant="ghost" className="h-6 px-2 text-xs"
                        onClick={() => markPaid.mutate({ arInvoiceId: r.id, undo: true }, { onError: () => toast.error("Konnte den Bezahlt-Status nicht zurücknehmen.") })}
                      >
                        rückgängig
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
              {paidRows.length > 10 && (
                <p className="px-4 py-2 text-[11px] text-tx-weak">
                  … und <span className="tabular">{paidRows.length - 10}</span> weitere (vollständig im Excel-Export).
                </p>
              )}
            </>
          )}
        </SectionCard>
      )}

      {/* Dunning-Entwurf: Vorschau + Freigabe (Postfach-Entwurf, kein Versand) */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft ? stufeLabel(draft.mahnstufe) : ""}</DialogTitle>
            <DialogDescription>
              Diese Erinnerung wird als <strong>Entwurf</strong> in deinen Postfach-Entwürfen abgelegt.
              Du prüfst und sendest sie dort selbst. {draft?.used_llm ? "(Jana-Ton)" : "(Vorlage)"}
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                An: {draft.to_name || draft.to_email || "–"} · Betrag: <span className="tabular">{draft.amount}</span>
              </p>
              <div>
                <Label className="text-xs">Betreff</Label>
                <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Text</Label>
                <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={12} className="font-mono text-sm" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={handleReject} disabled={verdict.isPending}>Verwerfen</Button>
            <Button onClick={handleApprove} disabled={verdict.isPending}>
              {verdict.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} In Postfach-Entwürfe legen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* v4.134.0 — dry_run-Vorschau: welche Forderungen erinnerungsreif sind */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Fällige Zahlungserinnerungen</DialogTitle>
            <DialogDescription>
              {previewCount === 0
                ? "Aktuell ist keine Forderung erinnerungsreif (Karenz, Abstand und Bestätigung werden beachtet)."
                : `${previewCount} Forderung(en) sind erinnerungsreif. Es werden Entwürfe in der Konsole erzeugt, die du unten einzeln freigibst. Es wird nichts versendet.`}
            </DialogDescription>
          </DialogHeader>
          {previewCount > 0 && (
            <ul className="max-h-80 divide-y divide-line-soft overflow-auto rounded-[var(--radius)] border border-line-soft">
              {previewItems(preview).map((it) => (
                <li key={it.ar_invoice_id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{it.counterpart_name || "–"}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {it.invoice_ref ? `Rechnung ${it.invoice_ref} · ` : ""}
                      {it.days_overdue != null ? `${it.days_overdue} Tage überfällig` : "Verzug unbekannt"}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-[12.5px]">{formatAmount(it.amount_gross, it.currency)}</span>
                  <span className="shrink-0">{stufeBadge(it.suggested_mahnstufe)}</span>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreview(null)}>Abbrechen</Button>
            <Button onClick={handleRunReal} disabled={runDun.isPending || previewCount === 0}>
              {runDun.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {previewCount} Entwürfe erzeugen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* v4.134.0 — Steuerberater-CSV mit optionalem Zeitraum */}
      <Dialog open={showCsv} onOpenChange={setShowCsv}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>CSV für Steuerberater</DialogTitle>
            <DialogDescription>
              DATEV-kompatible OPOS-Liste (offene Posten) mit Mahnstatus. Zeitraum ist optional
              und filtert nach Belegdatum.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Von (optional)</Label><Input type="date" value={csvFrom} onChange={(e) => setCsvFrom(e.target.value)} /></div>
            <div><Label className="text-xs">Bis (optional)</Label><Input type="date" value={csvTo} onChange={(e) => setCsvTo(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCsv(false)}>Abbrechen</Button>
            <Button onClick={handleCsvExport}><FileText className="mr-1 h-4 w-4" /> CSV herunterladen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manuelle Forderung */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Forderung manuell hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Kunde</Label><Input value={manual.counterpart_name} onChange={(e) => setManual({ ...manual, counterpart_name: e.target.value })} /></div>
            <div><Label className="text-xs">E-Mail</Label><Input value={manual.counterpart_email} onChange={(e) => setManual({ ...manual, counterpart_email: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Rechnungsnr</Label><Input value={manual.invoice_ref} onChange={(e) => setManual({ ...manual, invoice_ref: e.target.value })} /></div>
              <div><Label className="text-xs">Betrag (z.B. 1.234,00)</Label><Input value={manual.amount_gross} onChange={(e) => setManual({ ...manual, amount_gross: e.target.value })} /></div>
            </div>
            <div><Label className="text-xs">Fällig (TT.MM.JJJJ)</Label><Input value={manual.due_date} onChange={(e) => setManual({ ...manual, due_date: e.target.value })} placeholder="15.08.2026" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Abbrechen</Button>
            <Button onClick={handleAddManual} disabled={addManual.isPending}>Hinzufügen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
