import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldAlert, Plus, X, ChevronDown, ChevronRight,
  TrendingDown, AlertTriangle, Loader2, Inbox, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useRiskShield, useRiskShieldAdd, useRiskShieldRemove } from "@/hooks/use-capital";
import { ampelColor, ampelLabel, verticalLabelDe, type RiskPartner } from "@/lib/capital";

// ── Risk Shield: Fruehwarnung fuer Geschaeftspartner ─────────────────────────
// Zeigt die Partner-Watchlist des Tenants, gematcht gegen das Distress-Universe.
// Der USP gegen Kemaris: wir sehen die Gegenparteien (bald automatisch aus dem
// Postfach), ein reines Finanz-Tool sieht sie nicht.

function AmpelDot({ a }: { a: RiskPartner["ampel"] }) {
  return <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ampelColor(a) }} />;
}

function PartnerRow({ p, onRemove, removing }: { p: RiskPartner; onRemove: (d: string) => void; removing: boolean }) {
  const [open, setOpen] = useState(false);
  const hasAlerts = p.alerts.length > 0;
  return (
    <div className="rounded-lg border border-border bg-background/40">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <AmpelDot a={p.ampel} />
        <button
          onClick={() => hasAlerts && setOpen((v) => !v)}
          className={cn("flex-1 min-w-0 text-left flex items-center gap-2", hasAlerts && "cursor-pointer")}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate">{p.name || p.domain}</span>
              {p.source === "inbox" && <Inbox className="w-3 h-3 text-muted-foreground shrink-0" />}
            </div>
            <div className="text-xs text-muted-foreground truncate">{p.domain}{p.vertical ? ` · ${verticalLabelDe(p.vertical)}` : ""}</div>
          </div>
        </button>
        <span className="text-xs font-medium tabular-nums shrink-0" style={{ color: ampelColor(p.ampel) }}>
          {ampelLabel(p.ampel)}
        </span>
        {p.health_score != null && (
          <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-8 text-right">{Math.round(p.health_score)}</span>
        )}
        {hasAlerts ? (
          <button onClick={() => setOpen((v) => !v)} className="text-muted-foreground hover:text-foreground shrink-0">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : <span className="w-4 shrink-0" />}
        <button
          onClick={() => onRemove(p.domain)} disabled={removing}
          className="text-muted-foreground/60 hover:text-foreground shrink-0" aria-label="Partner entfernen"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && hasAlerts && (
        <div className="px-3 pb-2.5 pt-0.5 space-y-1.5 border-t border-border/60">
          {p.alerts.map((al, i) => (
            <div key={i} className="flex items-start gap-2 text-xs pt-1.5">
              {al.kind === "trend_down"
                ? <TrendingDown className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: al.severity === "critical" ? ampelColor("red") : ampelColor("amber") }} />
                : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: al.severity === "critical" ? ampelColor("red") : ampelColor("amber") }} />}
              <span className="text-muted-foreground leading-relaxed">
                <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mr-1.5 align-middle" style={{ color: al.tier === "confirmed" ? ampelColor("red") : ampelColor("amber"), backgroundColor: (al.tier === "confirmed" ? ampelColor("red") : ampelColor("amber")) + "1a" }}>{al.tier === "confirmed" ? "bestätigt" : "beobachten"}</span>
                {al.message}
              </span>
            </div>
          ))}
        </div>
      )}
      {!hasAlerts && p.matched && (
        <div className="px-3 pb-2.5 -mt-1 text-xs text-muted-foreground">{p.reason}</div>
      )}
    </div>
  );
}

export function RiskShieldCard() {
  const { data, isLoading } = useRiskShield();
  const add = useRiskShieldAdd();
  const remove = useRiskShieldRemove();
  const { toast } = useToast();
  const [input, setInput] = useState("");

  function onAdd() {
    const d = input.trim();
    if (!d) return;
    add.mutate({ domain: d }, {
      onSuccess: () => { setInput(""); },
      onError: (e: any) => toast({ title: "Konnte Partner nicht hinzufügen", description: String(e?.message ?? e), variant: "destructive" }),
    });
  }
  function onRemove(domain: string) {
    remove.mutate({ domain }, { onError: (e: any) => toast({ title: "Konnte Partner nicht entfernen", description: String(e?.message ?? e), variant: "destructive" }) });
  }

  const s = data?.summary;
  const partners = data?.partners ?? [];

  return (
    <Card className="glass-card border-primary/20">
      <CardContent className="pt-6 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Risk Shield</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Frühwarnung für Ihre Geschäftspartner. Wir gleichen Kunden und Lieferanten laufend
              gegen Distress-Signale ab (News, Web-Präsenz, Register), bevor eine Zahlung ausfällt.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : !data?.has_tenant ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            Kein Firmenprofil gefunden. Melden Sie sich mit Ihrem Firmen-Postfach an.
          </div>
        ) : (
          <>
            {/* Ampel-Uebersicht */}
            <div className="grid grid-cols-4 gap-2">
              {([["red", s?.red ?? 0, "Bestätigt"], ["amber", s?.amber ?? 0, "Beobachten"], ["green", s?.green ?? 0, "Stabil"], ["gray", s?.gray ?? 0, "Offen"]] as const).map(([a, n, lbl]) => (
                <div key={a} className="rounded-lg border border-border bg-background/40 px-3 py-2.5 text-center">
                  <div className="text-2xl font-semibold tabular-nums" style={{ color: n > 0 ? ampelColor(a) : undefined }}>{n}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{lbl}</div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground -mt-1 leading-relaxed">
              Rot = bestätigt (kritisch und über mehrere Läufe stabil). Gelb = frisches Signal, noch in Beobachtung. Bewertung nur aus öffentlichen Quellen.
            </p>

            {/* Distress-Banner */}
            {(s?.red ?? 0) > 0 && (
              <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm" style={{ borderColor: ampelColor("red") + "40", backgroundColor: ampelColor("red") + "0d" }}>
                <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: ampelColor("red") }} />
                <span className="text-foreground">
                  <strong>{s?.red}</strong> {s?.red === 1 ? "Partner zeigt" : "Partner zeigen"} bestätigte Distress-Signale (kritisch und über mehrere Läufe stabil). Prüfen Sie offene Forderungen und Vorkasse.
                </span>
              </div>
            )}

            {/* Partner-Liste */}
            {partners.length > 0 ? (
              <div className="space-y-2">
                {partners.map((p) => <PartnerRow key={p.domain} p={p} onRemove={onRemove} removing={remove.isPending} />)}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Noch keine Partner beobachtet. Fügen Sie unten eine Domain hinzu.
              </div>
            )}

            {/* Partner hinzufuegen */}
            <div className="flex items-center gap-2">
              <Input
                value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
                placeholder="Partner-Domain, z.B. lieferant-mueller.de"
                className="flex-1"
              />
              <Button onClick={onAdd} disabled={add.isPending || !input.trim()} size="sm">
                {add.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span className="ml-1.5">Hinzufügen</span>
              </Button>
            </div>

            {/* USP-Teaser */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground border-t border-border/60 pt-3">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
              <span>Bald automatisch: UseEasy erkennt Ihre Geschäftspartner aus dem Postfach und überwacht sie ohne Zutun. Ein reines Finanz-Tool sieht diese Gegenparteien nicht.</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
