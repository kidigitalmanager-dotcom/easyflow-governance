import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Landmark, Coins, CheckCircle2, AlertCircle, PauseCircle, ChevronDown, ChevronRight,
  Banknote, Info, Building2, Rocket, Loader2, Save, Lock, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useFoerderRadar, useSaveFoerderProfile } from "@/hooks/use-capital";
import { fmtEur, FOERDER_VERTICALS, BUNDESLAENDER, type FoerderProgram } from "@/lib/capital";

// ── Foerder-Radar v2: latentes Kapital + konditionales Matching ──────────────
// Kuratierter Katalog x Branche x Firmenprofil (Alter/Stadt/Region/Groesse).
// Konditionale Programme (Start-Up, stadt-spezifisch) werden nur gezeigt, wenn
// die Bedingung passt; sonst als "bedingt relevant" mit Klartext-Grund.

function StatusBadge({ sc }: { sc: FoerderProgram["status_class"] }) {
  const m = {
    verified: { c: "text-emerald-600", b: "bg-emerald-500/10", i: CheckCircle2, t: "verifiziert" },
    verify: { c: "text-amber-600", b: "bg-amber-500/10", i: AlertCircle, t: "Status prüfen" },
    paused: { c: "text-muted-foreground", b: "bg-muted", i: PauseCircle, t: "pausiert" },
  }[sc];
  const Icon = m.i;
  return <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded", m.c, m.b)}><Icon className="w-3 h-3" />{m.t}</span>;
}

function AutoBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded text-sky-600 bg-sky-500/10" title="Automatisch aus der Förderdatenbank importiert – noch ungeprüft">
      <Sparkles className="w-3 h-3" />auto
    </span>
  );
}

function ProgramRow({ p, conditional }: { p: FoerderProgram; conditional?: boolean }) {
  const [open, setOpen] = useState(false);
  const amt = (p.amount_max_eur ?? 0) > 0
    ? (p.amount_min_eur && p.amount_min_eur !== p.amount_max_eur ? `${fmtEur(p.amount_min_eur)} – ${fmtEur(p.amount_max_eur)}` : `bis ${fmtEur(p.amount_max_eur)}`)
    : "individuell";
  return (
    <div className={cn("rounded-lg border bg-background/40", conditional ? "border-amber-500/20" : "border-border")}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
        {p.is_startup_program ? <Rocket className="w-4 h-4 text-primary shrink-0" /> : <Coins className="w-4 h-4 text-primary shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
            <StatusBadge sc={p.status_class} />
            {p.source_type === "auto" && <AutoBadge />}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {conditional && p.match_reason ? <span className="text-amber-600">{p.match_reason}</span> : `${p.level ?? ""}${p.provider ? ` · ${p.provider}` : ""}`}
          </div>
        </div>
        <span className="text-xs font-medium text-foreground tabular-nums shrink-0 text-right">{amt}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-0.5 border-t border-border/60 space-y-1.5 text-xs text-muted-foreground leading-relaxed">
          {p.description && <p className="pt-1.5">{p.description}</p>}
          {p.eligibility && <p><span className="text-foreground">Wer:</span> {p.eligibility}</p>}
          {p.conditional_note && <p className="text-amber-600">Bedingung: {p.conditional_note}</p>}
          {p.source && <p className="text-muted-foreground/70">Quelle: {p.source}</p>}
        </div>
      )}
    </div>
  );
}

export function FoerderRadarCard() {
  const [vertical, setVertical] = useState<string | undefined>(undefined);
  const { data, isLoading } = useFoerderRadar(vertical);
  const save = useSaveFoerderProfile(vertical);
  const { toast } = useToast();
  const [showAll, setShowAll] = useState(false);
  const [showFin, setShowFin] = useState(false);
  const [showAuto, setShowAuto] = useState(false);
  const [showAllAuto, setShowAllAuto] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const [year, setYear] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [emp, setEmp] = useState("");

  useEffect(() => {
    if (!data) return;
    const p = data.profile;
    setYear(p?.founding_year ? String(p.founding_year) : (data.suggested?.founding_year ? String(data.suggested.founding_year) : ""));
    setCity(p?.city ?? "");
    setRegion(p?.region ?? "");
    setEmp(p?.employee_count != null ? String(p.employee_count) : "");
  }, [data?.profile, data?.suggested]);

  const kpi = data?.kpi;
  const programs = data?.programs ?? [];
  const conditional = data?.conditional_programs ?? [];
  const grants = programs.filter((p) => (p.grant_class === "zuschuss" || p.grant_class === "stipendium") && (p.amount_max_eur ?? 0) > 0 && p.source_type !== "auto");
  const financing = programs.filter((p) => (p.grant_class === "kredit" || p.grant_class === "gemischt" || p.grant_class === "finanzierung") && p.source_type !== "auto");
  const autoPrograms = programs.filter((p) => p.source_type === "auto");
  const shownGrants = showAll ? grants : grants.slice(0, 6);
  const activeVertical = vertical ?? data?.vertical ?? undefined;
  const hasProfile = !!(data?.profile && (data.profile.founding_year || data.profile.city || data.profile.region));

  function onSave() {
    save.mutate(
      { founding_year: year ? Number(year) : null, city: city || null, region: region || null, employee_count: emp ? Number(emp) : null },
      { onSuccess: () => { toast({ title: "Profil gespeichert" }); setShowProfile(false); }, onError: (e: any) => toast({ title: "Fehler", description: String(e?.message ?? e), variant: "destructive" }) },
    );
  }

  return (
    <Card className="glass-card border-primary/20">
      <CardContent className="pt-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Landmark className="w-5 h-5 text-primary" /></div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Förder-Radar</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">Ihr latentes Kapital: öffentliche Förderprogramme, die zu Ihrer Branche und Firma passen. Aus Ihren Profildaten gematcht, nicht per Fragebogen erhoben.</p>
          </div>
        </div>

        {/* Branchen-Umschalter */}
        <div className="flex flex-wrap gap-1.5">
          {FOERDER_VERTICALS.map((v) => {
            const active = activeVertical === v.key;
            return (
              <button key={v.key} onClick={() => { setVertical(v.key); setShowAll(false); }}
                className={cn("text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors", active ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground border-border hover:bg-muted/60")}>
                {v.label}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : !data?.has_tenant ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">Kein Firmenprofil gefunden. Melden Sie sich mit Ihrem Firmen-Postfach an.</div>
        ) : (
          <>
            {/* Firmenprofil */}
            <div className="rounded-lg border border-border">
              <button onClick={() => setShowProfile((v) => !v)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
                <Building2 className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-medium text-foreground flex-1">Firmenprofil {hasProfile ? "" : "vervollständigen"}</span>
                <span className="text-xs text-muted-foreground">{hasProfile ? "für präzise Treffer" : "für Start-Up + regionale Programme"}</span>
                {showProfile ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showProfile && (
                <div className="px-3 pb-3 pt-1 border-t border-border/60 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Gründungsjahr{data.suggested?.founding_year && !data.profile?.founding_year ? ` (Vorschlag: ${data.suggested.founding_year})` : ""}</label>
                      <Input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" placeholder="z.B. 2022" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Mitarbeiterzahl</label>
                      <Input value={emp} onChange={(e) => setEmp(e.target.value)} inputMode="numeric" placeholder="z.B. 8" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Stadt</label>
                      <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="z.B. Hamburg" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Bundesland</label>
                      <select value={region} onChange={(e) => setRegion(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="">Bitte wählen</option>
                        {BUNDESLAENDER.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <Button onClick={onSave} disabled={save.isPending} size="sm">
                    {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}<span className="ml-1.5">Profil speichern</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Latentes-Kapital-Hero */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-4">
              <div className="text-xs text-muted-foreground">Geschätztes latentes Fördervolumen</div>
              <div className="text-3xl font-semibold text-foreground mt-0.5">bis {fmtEur(kpi?.latent_total_max)}</div>
              <div className="text-sm text-muted-foreground mt-1">
                aus <span className="text-foreground font-medium">{kpi?.grant_count ?? 0}</span> passenden Zuschussprogrammen
                {(kpi?.verified_count ?? 0) > 0 && <> · davon <span className="text-emerald-600 font-medium">{kpi?.verified_count} web-verifiziert</span> ({fmtEur(kpi?.latent_verified_max)} sofort belastbar)</>}
              </div>
            </div>

            {/* Zuschuss-Programme */}
            {grants.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Zuschüsse, Zulagen und Stipendien (nicht rückzahlbar)</h3>
                {shownGrants.map((p) => <ProgramRow key={p.program_key} p={p} />)}
                {grants.length > 6 && <button onClick={() => setShowAll((v) => !v)} className="text-xs font-medium text-primary hover:underline">{showAll ? "Weniger anzeigen" : `Alle ${grants.length} Programme anzeigen`}</button>}
              </div>
            )}

            {/* Konditionale Programme */}
            {conditional.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <h3 className="text-sm font-medium text-foreground">Bedingt relevant ({conditional.length})</h3>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">Diese Programme greifen, sobald die genannte Bedingung erfüllt ist. Firmenprofil ausfüllen für einen exakten Abgleich.</p>
                {conditional.slice(0, 8).map((p) => <ProgramRow key={p.program_key} p={p} conditional />)}
              </div>
            )}

            {/* Finanzierung */}
            {financing.length > 0 && (
              <div className="space-y-2">
                <button onClick={() => setShowFin((v) => !v)} className="w-full flex items-center gap-2 text-left">
                  <Banknote className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground flex-1">Zusätzlich {financing.length} Finanzierungsprogramme (Kredite, Beteiligungen, Bürgschaften)</span>
                  {showFin ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </button>
                {showFin && <div className="space-y-2">{financing.map((p) => <ProgramRow key={p.program_key} p={p} />)}</div>}
              </div>
            )}

            {/* Automatisch gefunden (Auto-Import Förderdatenbank, ungeprüft) */}
            {autoPrograms.length > 0 && (
              <div className="space-y-2">
                <button onClick={() => setShowAuto((v) => !v)} className="w-full flex items-center gap-2 text-left">
                  <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
                  <span className="text-sm font-medium text-foreground flex-1">Automatisch gefunden ({autoPrograms.length}) · ungeprüft</span>
                  {showAuto ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </button>
                {showAuto && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground -mt-1">Wöchentlich automatisch aus der Förderdatenbank des Bundes importiert und auf Ihre Branche gefiltert – noch nicht redaktionell geprüft. Vor Nutzung verifizieren.</p>
                    {(showAllAuto ? autoPrograms : autoPrograms.slice(0, 8)).map((p) => <ProgramRow key={p.program_key} p={p} />)}
                    {autoPrograms.length > 8 && <button onClick={() => setShowAllAuto((v) => !v)} className="text-xs font-medium text-primary hover:underline">{showAllAuto ? "Weniger anzeigen" : `Alle ${autoPrograms.length} anzeigen`}</button>}
                  </div>
                )}
              </div>
            )}

            {/* Disclaimer */}
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
