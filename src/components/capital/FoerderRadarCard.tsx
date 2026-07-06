import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Landmark, CheckCircle2, AlertCircle, PauseCircle, ChevronDown, ChevronRight,
  Banknote, Info, Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFoerderRadar } from "@/hooks/use-capital";
import { fmtEur, FOERDER_VERTICALS, type FoerderProgram } from "@/lib/capital";

// ── Foerder-Radar: latentes Foerderkapital ───────────────────────────────────
// Matcht den oeffentlichen Foerderkatalog gegen die Branche und zeigt das
// geschaetzte ungenutzte Foerdervolumen. Ehrlich: web-verifizierte Programme
// getrennt von "Status pruefen"; Kredite zaehlen nicht ins Zuschuss-Volumen.
// Die einzige echte Neubau-Luecke gegen Kemaris (Grant Pilot).

function StatusBadge({ sc }: { sc: FoerderProgram["status_class"] }) {
  const map = {
    verified: { c: "text-emerald-600", b: "bg-emerald-500/10", i: CheckCircle2, t: "verifiziert" },
    verify: { c: "text-amber-600", b: "bg-amber-500/10", i: AlertCircle, t: "Status prüfen" },
    paused: { c: "text-muted-foreground", b: "bg-muted", i: PauseCircle, t: "pausiert" },
  }[sc];
  const Icon = map.i;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded", map.c, map.b)}>
      <Icon className="w-3 h-3" />{map.t}
    </span>
  );
}

function ProgramRow({ p }: { p: FoerderProgram }) {
  const [open, setOpen] = useState(false);
  const amt = (p.amount_max_eur ?? 0) > 0
    ? (p.amount_min_eur && p.amount_min_eur !== p.amount_max_eur ? `${fmtEur(p.amount_min_eur)} – ${fmtEur(p.amount_max_eur)}` : `bis ${fmtEur(p.amount_max_eur)}`)
    : "Konditionen individuell";
  return (
    <div className="rounded-lg border border-border bg-background/40">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
        <Coins className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
            <StatusBadge sc={p.status_class} />
          </div>
          <div className="text-xs text-muted-foreground truncate">{p.level}{p.provider ? ` · ${p.provider}` : ""}</div>
        </div>
        <span className="text-xs font-medium text-foreground tabular-nums shrink-0 text-right">{amt}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-0.5 border-t border-border/60 space-y-1.5 text-xs text-muted-foreground leading-relaxed">
          {p.description && <p className="pt-1.5">{p.description}</p>}
          {p.eligibility && <p><span className="text-foreground">Wer:</span> {p.eligibility}</p>}
          {p.source && <p className="text-muted-foreground/70">Quelle: {p.source}</p>}
        </div>
      )}
    </div>
  );
}

export function FoerderRadarCard() {
  const [vertical, setVertical] = useState<string | undefined>(undefined);
  const { data, isLoading } = useFoerderRadar(vertical);
  const [showAll, setShowAll] = useState(false);
  const [showFin, setShowFin] = useState(false);

  const kpi = data?.kpi;
  const programs = data?.programs ?? [];
  const grants = programs.filter((p) => p.grant_class === "zuschuss" && (p.amount_max_eur ?? 0) > 0);
  const financing = programs.filter((p) => p.grant_class === "kredit" || p.grant_class === "gemischt" || p.grant_class === "finanzierung");
  const shownGrants = showAll ? grants : grants.slice(0, 6);
  const activeVertical = vertical ?? data?.vertical ?? undefined;

  return (
    <Card className="glass-card border-primary/20">
      <CardContent className="pt-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Förder-Radar</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ihr latentes Kapital: öffentliche Förderprogramme, die zu Ihrer Branche passen. Aus Ihren
              Profildaten gematcht, nicht per Fragebogen erhoben.
            </p>
          </div>
        </div>

        {/* Branchen-Umschalter (Quick-Check) */}
        <div className="flex flex-wrap gap-1.5">
          {FOERDER_VERTICALS.map((v) => {
            const active = activeVertical === v.key;
            return (
              <button key={v.key} onClick={() => { setVertical(v.key); setShowAll(false); }}
                className={cn("text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors",
                  active ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground border-border hover:bg-muted/60")}>
                {v.label}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : !data?.has_tenant ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            Kein Firmenprofil gefunden. Melden Sie sich mit Ihrem Firmen-Postfach an.
          </div>
        ) : (
          <>
            {/* Latentes-Kapital-Hero */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-4">
              <div className="text-xs text-muted-foreground">Geschätztes latentes Fördervolumen</div>
              <div className="text-3xl font-semibold text-foreground mt-0.5">
                bis {fmtEur(kpi?.latent_total_max)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                aus <span className="text-foreground font-medium">{kpi?.grant_count ?? 0}</span> passenden Zuschussprogrammen
                {(kpi?.verified_count ?? 0) > 0 && (
                  <> · davon <span className="text-emerald-600 font-medium">{kpi?.verified_count} web-verifiziert</span> ({fmtEur(kpi?.latent_verified_max)} sofort belastbar)</>
                )}
              </div>
            </div>

            {/* Zuschuss-Programme */}
            {grants.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Zuschüsse & Zulagen (nicht rückzahlbar)</h3>
                {shownGrants.map((p) => <ProgramRow key={p.program_key} p={p} />)}
                {grants.length > 6 && (
                  <button onClick={() => setShowAll((v) => !v)} className="text-xs font-medium text-primary hover:underline">
                    {showAll ? "Weniger anzeigen" : `Alle ${grants.length} Programme anzeigen`}
                  </button>
                )}
              </div>
            )}

            {/* Finanzierungsprogramme */}
            {financing.length > 0 && (
              <div className="space-y-2">
                <button onClick={() => setShowFin((v) => !v)} className="w-full flex items-center gap-2 text-left">
                  <Banknote className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground flex-1">Zusätzlich {financing.length} Finanzierungsprogramme (Kredite, Bürgschaften)</span>
                  {showFin ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </button>
                {showFin && <div className="space-y-2">{financing.map((p) => <ProgramRow key={p.program_key} p={p} />)}</div>}
              </div>
            )}

            {/* Ehrlicher Disclaimer */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground border-t border-border/60 pt-3">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
              <span>Obergrenze aller passenden Programme, nicht kumulativ. Realistisch kombinierbar sind meist 2 bis 4 Programme. Programme mit "Status prüfen" vor Antrag verifizieren. Antragsbegleitung über UseEasy-Partner.</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
