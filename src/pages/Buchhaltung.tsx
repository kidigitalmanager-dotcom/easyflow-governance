import { useState } from "react";
import { Link } from "react-router-dom";
import { useCashIndex, useApSettings, useSetApSettings } from "@/hooks/use-api";
import { exportApXlsx, exportApCsvDatev } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Wallet, Download, FileSpreadsheet, FileText, ChevronDown, ArrowDownCircle, ArrowUpCircle,
  Receipt, CreditCard, TrendingUp,
} from "lucide-react";

// Buchhaltung — Cash-Dashboard (Uebersicht). Reine Berechnung aus Forderungen (AR) +
// Verbindlichkeiten (AP): Geld rein / Geld raus im Horizont, Verzug, Liquiditaets-Kennzahl
// mit Ampel. Nichts wird persistiert (kein Drift), alles server-berechnet.

const HORIZONS = [7, 14, 30, 60];
const AMPEL: Record<string, { dot: string; text: string; label: string }> = {
  gruen: { dot: "bg-emerald-500", text: "text-emerald-600", label: "gruen" },
  gelb: { dot: "bg-amber-500", text: "text-amber-600", label: "gelb" },
  rot: { dot: "bg-red-500", text: "text-red-600", label: "rot" },
};

function eur(v: number | null | undefined): string {
  if (v == null) return "—";
  try { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v); }
  catch { return `${v} EUR`; }
}

export default function Buchhaltung() {
  const [horizon, setHorizon] = useState(14);
  const ci = useCashIndex(horizon);
  const settings = useApSettings();
  const setSettings = useSetApSettings();

  const d = ci.data;
  const ampel = d ? (AMPEL[d.ampel] ?? AMPEL.gelb) : AMPEL.gelb;
  const featureOn = settings.data?.feature_on ?? false;
  const s = settings.data?.settings;

  async function toggleAutoIngest(v: boolean) {
    try { await setSettings.mutateAsync({ auto_ingest: v }); toast.success(v ? "Auto-Erfassung an." : "Auto-Erfassung aus."); }
    catch { toast.error("Einstellung konnte nicht gespeichert werden."); }
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Wallet className="h-6 w-6" /> Buchhaltung — Uebersicht</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Geld rein, Geld raus und deine Liquiditaet auf einen Blick — aus Forderungen und
            Verbindlichkeiten der naechsten Tage.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            {HORIZONS.map((h) => (
              <button key={h} onClick={() => setHorizon(h)}
                className={`px-3 py-1.5 text-sm ${horizon === h ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                {h} Tage
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><Download className="h-4 w-4" /> Export <ChevronDown className="h-3 w-3 opacity-60" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Verbindlichkeiten exportieren</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => exportApXlsx().catch(() => toast.error("Export fehlgeschlagen."))}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel (Betrieb)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportApCsvDatev().catch(() => toast.error("Export fehlgeschlagen."))}>
                <FileText className="h-4 w-4 mr-2" /> DATEV-Kreditoren-CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Cash-Index-Kachel */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Cash-Index ({horizon} Tage)</CardTitle></CardHeader>
        <CardContent>
          {ci.isLoading ? <Skeleton className="h-16 w-full" /> : (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <div className={`text-3xl font-semibold ${d && d.cash_index < 0 ? "text-red-600" : "text-emerald-600"}`}>{eur(d?.cash_index)}</div>
                <div className="text-xs text-muted-foreground">erwartete Zufluesse minus Abfluesse im Horizont</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-block h-3 w-3 rounded-full ${ampel.dot}`} />
                <span className={`text-sm font-medium ${ampel.text}`}>Liquiditaet {ampel.label}</span>
              </div>
              <div>
                <div className="text-lg font-medium">{d?.coverage_ratio != null ? `${(d.coverage_ratio * 100).toFixed(0)} %` : "—"}</div>
                <div className="text-xs text-muted-foreground">Deckung (Forderungen / Verbindlichkeiten)</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Geld rein / Geld raus */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-emerald-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-700">
              <ArrowDownCircle className="h-4 w-4" /> Geld rein — Forderungen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {ci.isLoading ? <Skeleton className="h-16 w-full" /> : (
              <>
                <Row label="Offen gesamt" value={eur(d?.receivables.total)} />
                <Row label={`Faellig in ${horizon} Tagen`} value={eur(d?.receivables.due_horizon)} strong />
                <Row label="davon ueberfaellig" value={eur(d?.receivables.overdue)} muted />
                <Link to="/forderungen" className="text-xs text-primary hover:underline inline-flex items-center gap-1 pt-1"><Receipt className="h-3 w-3" /> zu den Forderungen</Link>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <ArrowUpCircle className="h-4 w-4" /> Geld raus — Verbindlichkeiten
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {ci.isLoading ? <Skeleton className="h-16 w-full" /> : (
              <>
                <Row label="Offen gesamt" value={eur(d?.payables.total)} />
                <Row label={`Faellig in ${horizon} Tagen`} value={eur(d?.payables.due_horizon)} strong />
                <Row label="davon ueberfaellig (im Verzug)" value={eur(d?.payables.overdue)} muted />
                <Link to="/verbindlichkeiten" className="text-xs text-primary hover:underline inline-flex items-center gap-1 pt-1"><CreditCard className="h-3 w-3" /> zu den Verbindlichkeiten</Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Auto-Erfassung */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Rechnungseingang</CardTitle></CardHeader>
        <CardContent>
          {!featureOn ? (
            <div className="text-sm text-muted-foreground">
              Die automatische Erfassung eingehender Rechnungen ist fuer deinen Betrieb noch nicht
              freigeschaltet. Du kannst Verbindlichkeiten jederzeit manuell anlegen.
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Switch id="auto" checked={s?.auto_ingest ?? true} onCheckedChange={toggleAutoIngest} disabled={setSettings.isPending} />
              <Label htmlFor="auto" className="text-sm text-muted-foreground">
                Eingehende Rechnungen automatisch als Verbindlichkeit erfassen (unsichere PDFs zur Bestaetigung).
                Es wird nie automatisch bezahlt.
              </Label>
            </div>
          )}
        </CardContent>
      </Card>

      {d?.as_of && <div className="text-xs text-muted-foreground">Stand {new Date(d.as_of).toLocaleDateString("de-DE")}. Server-berechnet, nicht gespeichert.</div>}
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className={strong ? "font-semibold" : muted ? "text-muted-foreground" : ""}>{value}</span>
    </div>
  );
}
