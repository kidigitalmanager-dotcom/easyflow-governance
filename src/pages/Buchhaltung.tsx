import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  useCashIndex,
  useApSettings,
  useSetApSettings,
  useDocuments,
  useApInvoices,
} from "@/hooks/use-api";
import { exportApXlsx, exportApCsvDatev, exportArXlsx } from "@/lib/api-client";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Download, FileSpreadsheet, FileText, ChevronDown, ArrowDownCircle, ArrowUpCircle,
  Receipt, CreditCard, Send,
} from "lucide-react";
import { PageHeader, SectionCard, Chip, Dot } from "@/components/ue/primitives";
import { agingBuckets, avgPaymentDays, confirmedShare } from "@/lib/ar-metrics";
import { FristenStrip } from "@/components/ue/FristenStrip";
import { UmsatzChart } from "@/components/ue/UmsatzChart";

/* Buchhaltung — Cash-Dashboard (Uebersicht). Cash-Index, Geld rein / Geld raus
   und Verzug kommen server-berechnet aus /cashindex (nichts persistiert, kein Drift).

   Redesign 27.07.2026 (Briefing §3): zusaetzlich Altersstruktur, Ø Zahlungsdauer
   und die Belege-Quote. Diese drei rechnet die Console aus den ohnehin geladenen
   Rohdaten (tenant_documents bzw. AP-Liste) — kein neuer Endpoint, keine
   geschaetzten Zahlen. Der 30-Tage-Trend fehlt weiterhin bewusst: dafuer gibt es
   keine Historie, und eine erfundene Kurve waere schlimmer als gar keine.
   Ein USt-Widget gibt es nicht (Entscheidung Leon) — kein Steuer-Feature vortaeuschen. */

const HORIZONS = [7, 14, 30, 60];
const AMPEL: Record<string, { tone: "emerald" | "amber" | "danger"; text: string; label: string }> = {
  gruen: { tone: "emerald", text: "text-primary", label: "grün" },
  gelb: { tone: "amber", text: "text-amber", label: "gelb" },
  rot: { tone: "danger", text: "text-danger", label: "rot" },
};

function eur(v: number | null | undefined): string {
  if (v == null) return "—";
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
  } catch {
    return `${v} EUR`;
  }
}

export default function Buchhaltung() {
  const [horizon, setHorizon] = useState(14);
  const ci = useCashIndex(horizon);
  const settings = useApSettings();
  const setSettings = useSetApSettings();
  // Rohdaten fuer die drei neuen Kennzahlen (Briefing §3).
  const arDocs = useDocuments("ar_invoice");
  const apList = useApInvoices();

  const d = ci.data;
  // 2026-07-27: KEINE Ampel-Aussage ohne Daten. Vorher stand waehrend des
  // Ladens (und bei Fehlern) hart "Liquiditaet gelb" — eine erfundene Zahl.
  const ampel = d ? (AMPEL[d.ampel] ?? null) : null;
  const featureOn = settings.data?.feature_on ?? false;
  const s = settings.data?.settings;

  const docs = arDocs.data?.items;
  const buckets = useMemo(() => agingBuckets(docs), [docs]);
  const bucketMax = Math.max(1, ...buckets.map((b) => b.amount));
  const bucketTotal = buckets.reduce((sum, b) => sum + b.amount, 0);
  const avgDays = useMemo(() => avgPaymentDays(docs), [docs]);
  const belege = useMemo(() => confirmedShare(apList.data?.items), [apList.data]);
  const overdueCount = (docs ?? []).filter((x) => x.overdue && !x.paid_at).length;

  // 2026-07-27: gespeicherten Horizont (cash_horizon_days) beim Laden uebernehmen
  // und Aenderungen zurueckschreiben — vorher war die Server-Einstellung tot.
  const horizonSynced = useRef(false);
  useEffect(() => {
    const saved = s?.cash_horizon_days;
    if (!horizonSynced.current && typeof saved === "number" && HORIZONS.includes(saved)) {
      horizonSynced.current = true;
      setHorizon(saved);
    }
  }, [s?.cash_horizon_days]);

  function pickHorizon(h: number) {
    setHorizon(h);
    horizonSynced.current = true;
    // Best-effort persistieren; die Anzeige rechnet unabhaengig davon mit h.
    if (featureOn) setSettings.mutate({ cash_horizon_days: h });
  }

  async function toggleAutoIngest(v: boolean) {
    try {
      await setSettings.mutateAsync({ auto_ingest: v });
      toast.success(v ? "Auto-Erfassung an." : "Auto-Erfassung aus.");
    } catch {
      toast.error("Einstellung konnte nicht gespeichert werden.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Buchhaltung"
        title="Geld rein, Geld raus"
        subtitle="Deine Liquidität aus Forderungen und Verbindlichkeiten der nächsten Tage — server-berechnet, nichts gespeichert."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4" /> <span data-tour="buchhaltung-export">Export</span> <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Forderungen exportieren</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => exportArXlsx().catch(() => toast.error("Export fehlgeschlagen."))}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (Betrieb)
              </DropdownMenuItem>
              <DropdownMenuLabel>Verbindlichkeiten exportieren</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => exportApXlsx().catch(() => toast.error("Export fehlgeschlagen."))}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (Betrieb)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportApCsvDatev().catch(() => toast.error("Export fehlgeschlagen."))}>
                <FileText className="mr-2 h-4 w-4" /> DATEV-Kreditoren-CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {/* ── Cash-Index ──────────────────────────────────────────────────── */}
      {/* data-tour: Ziel des gefuehrten Durchlaufs "buchhaltung-belege" (06.08.2026). */}
      <div data-tour="buchhaltung-cash">
      <SectionCard
        title={`Cash-Index · ${horizon} Tage`}
        subtitle="erwartete Zuflüsse minus Abflüsse im Horizont"
        action={
          <div className="flex flex-wrap gap-1.5">
            {HORIZONS.map((h) => (
              <Chip key={h} active={horizon === h} onClick={() => pickHorizon(h)}>
                {h} Tage
              </Chip>
            ))}
          </div>
        }
      >
        {ci.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : ci.isError ? (
          <QueryErrorNotice
            label="Der Cash-Index konnte nicht berechnet werden."
            onRetry={() => ci.refetch()}
            retrying={ci.isFetching}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
            <div>
              <p
                className={
                  "tabular text-[34px] font-semibold leading-none tracking-[-0.02em] " +
                  (d && d.cash_index < 0 ? "text-danger" : "text-primary")
                }
              >
                {eur(d?.cash_index)}
              </p>
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">Cash-Index im Horizont</p>
            </div>
            {ampel && (
              <div>
                <p className={"flex items-center gap-2 text-sm font-medium " + ampel.text}>
                  <Dot tone={ampel.tone} pulse={ampel.tone !== "emerald"} />
                  Liquidität {ampel.label}
                </p>
                <p className="mt-1.5 text-[11.5px] text-muted-foreground">Ampel des Servers</p>
              </div>
            )}
            <div>
              <p className="tabular text-[20px] font-semibold leading-none">
                {d?.coverage_ratio != null ? `${(d.coverage_ratio * 100).toFixed(0)} %` : "—"}
              </p>
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                Deckung (Forderungen / Verbindlichkeiten)
              </p>
            </div>
          </div>
        )}
      </SectionCard>
      </div>

      {/* ── Geld rein / Geld raus ───────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard
          title={
            <span className="flex items-center gap-2 text-primary">
              <ArrowDownCircle className="h-4 w-4" /> Geld rein — Forderungen
            </span>
          }
        >
          {ci.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : ci.isError ? (
            <QueryErrorNotice label="Forderungs-Summen nicht ladbar." />
          ) : (
            <div className="space-y-1">
              <Row label="Offen gesamt" value={eur(d?.receivables?.total)} />
              <Row label={`Fällig in ${horizon} Tagen`} value={eur(d?.receivables?.due_horizon)} strong />
              <Row label="davon überfällig" value={eur(d?.receivables?.overdue)} muted />
              <Link
                to="/forderungen"
                className="inline-flex items-center gap-1 pt-1 text-xs text-primary hover:underline"
              >
                <Receipt className="h-3 w-3" /> zu den Forderungen
              </Link>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={
            <span className="flex items-center gap-2 text-danger">
              <ArrowUpCircle className="h-4 w-4" /> Geld raus — Verbindlichkeiten
            </span>
          }
        >
          {ci.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : ci.isError ? (
            <QueryErrorNotice label="Verbindlichkeits-Summen nicht ladbar." />
          ) : (
            <div className="space-y-1">
              <Row label="Offen gesamt" value={eur(d?.payables?.total)} />
              <Row label={`Fällig in ${horizon} Tagen`} value={eur(d?.payables?.due_horizon)} strong />
              <Row label="davon überfällig (im Verzug)" value={eur(d?.payables?.overdue)} muted />
              <Link
                to="/verbindlichkeiten"
                className="inline-flex items-center gap-1 pt-1 text-xs text-primary hover:underline"
              >
                <CreditCard className="h-3 w-3" /> zu den Verbindlichkeiten
              </Link>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Umsatz je Monat (client-berechnet aus denselben Rechnungen) ──── */}
      <UmsatzChart
        docs={docs}
        isLoading={arDocs.isLoading}
        isError={arDocs.isError}
        isFetching={arDocs.isFetching}
        onRetry={() => arDocs.refetch()}
      />

      {/* ── Fristen-Band: hier sind Fristen Zahlungsziele (Leon 27.07.) ───── */}
      <FristenStrip />

      {/* ── Altersstruktur + Ø Zahlungsdauer (client-berechnet, §3) ─────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Altersstruktur der offenen Forderungen"
          subtitle="aus Fälligkeitsdatum und Zahlungseingang deiner Rechnungen"
          action={
            overdueCount > 0 ? (
              <Link
                to="/forderungen?tab=forderungen"
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-amber/40 bg-amber-surface px-3 py-1.5 text-[12px] font-medium text-amber transition-colors hover:border-amber"
              >
                <Send className="h-3.5 w-3.5" />
                Mahnlauf vorbereiten ({overdueCount})
              </Link>
            ) : null
          }
        >
          {arDocs.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : arDocs.isError ? (
            <QueryErrorNotice
              label="Die Forderungen konnten nicht geladen werden."
              onRetry={() => arDocs.refetch()}
              retrying={arDocs.isFetching}
            />
          ) : bucketTotal === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Keine offenen Forderungen mit Fälligkeitsdatum.
            </p>
          ) : (
            <div className="space-y-3">
              {buckets.map((b) => (
                <div key={b.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] text-tx-secondary">
                      {b.label}
                      {b.count > 0 && <span className="ml-1.5 text-[11px] text-tx-weak">{b.count}</span>}
                    </span>
                    <span className="tabular text-[12.5px] font-medium">{eur(b.amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={
                        "h-full rounded-full transition-[width] duration-[1200ms] ease-out " +
                        (b.key === "notyet"
                          ? "bg-primary/70"
                          : b.key === "d1_30"
                            ? "bg-amber/70"
                            : "bg-danger/70")
                      }
                      style={{ width: `${Math.round((b.amount / bucketMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Ø Zahlungsdauer" subtitle="Ausstellung bis Zahlungseingang">
            {arDocs.isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : arDocs.isError ? (
              // Retry nachgereicht: die Query hat ein refetch, der Hinweis bot bisher
              // nur eine Sackgasse — ein Neuladen der ganzen Seite als einzigen Ausweg.
              <QueryErrorNotice label="Nicht berechenbar." onRetry={() => arDocs.refetch()} retrying={arDocs.isFetching} />
            ) : (
              <>
                <p className="tabular text-[30px] font-semibold leading-none">
                  {avgDays === null ? "–" : avgDays.toLocaleString("de-DE")}
                  {avgDays !== null && <span className="ml-1.5 text-base font-medium text-muted-foreground">Tage</span>}
                </p>
                <p className="mt-2 text-[11.5px] text-muted-foreground">
                  {avgDays === null
                    ? "Noch keine bezahlte Rechnung mit Ausstellungs- und Zahldatum."
                    : "Mittelwert über alle bezahlten Rechnungen."}
                </p>
              </>
            )}
          </SectionCard>

          <SectionCard title="Belege" subtitle="Eingangsrechnungen, eindeutig zugeordnet">
            {apList.isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : apList.isError ? (
              // Wie oben: refetch ist vorhanden, also gehoert der Neu-laden-Knopf dran.
              <QueryErrorNotice label="Belege nicht ladbar." onRetry={() => apList.refetch()} retrying={apList.isFetching} />
            ) : (
              <>
                <p className="tabular text-[30px] font-semibold leading-none">
                  {belege.pct === null ? "–" : `${belege.pct} %`}
                </p>
                <p className="mt-2 text-[11.5px] text-muted-foreground">
                  {belege.pct === null
                    ? "Noch keine Eingangsrechnungen erfasst."
                    : `${belege.confirmed} von ${belege.total} erkannt · Rest wartet auf deine Bestätigung.`}
                </p>
                {belege.total > belege.confirmed && (
                  <Link
                    to="/verbindlichkeiten"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Offene Belege prüfen
                  </Link>
                )}
              </>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── Rechnungseingang ────────────────────────────────────────────── */}
      <SectionCard title="Rechnungseingang">
        {settings.isLoading ? (
          /* 2026-07-27: waehrend des Ladens NICHT "nicht freigeschaltet" behaupten. */
          <Skeleton className="h-6 w-2/3" />
        ) : settings.isError ? (
          <QueryErrorNotice
            label="Die Einstellung konnte nicht geladen werden."
            onRetry={() => settings.refetch()}
            retrying={settings.isFetching}
          />
        ) : !featureOn ? (
          <p className="text-sm text-muted-foreground">
            Die automatische Erfassung eingehender Rechnungen ist für deinen Betrieb noch nicht
            freigeschaltet. Du kannst Verbindlichkeiten jederzeit manuell anlegen.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <Switch
              id="auto"
              checked={s?.auto_ingest ?? true}
              onCheckedChange={toggleAutoIngest}
              disabled={setSettings.isPending}
            />
            <Label htmlFor="auto" className="text-sm text-muted-foreground">
              Eingehende Rechnungen automatisch als Verbindlichkeit erfassen (unsichere PDFs zur
              Bestätigung). Es wird nie automatisch bezahlt.
            </Label>
          </div>
        )}
      </SectionCard>

      {d?.as_of && (
        <p className="text-xs text-tx-weak">
          Stand {new Date(d.as_of).toLocaleDateString("de-DE")}. Server-berechnet, nicht gespeichert.
        </p>
      )}
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className={muted ? "text-muted-foreground" : "text-tx-secondary"}>{label}</span>
      <span className={"tabular " + (strong ? "font-semibold" : muted ? "text-muted-foreground" : "")}>{value}</span>
    </div>
  );
}
