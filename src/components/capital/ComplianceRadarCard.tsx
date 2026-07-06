import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Scale, AlertTriangle, Clock, FileWarning, Mail, ShieldQuestion, Info, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase as authClient } from "@/integrations/supabase/client";

// ── UseEasy Compliance-Radar (Risk-Shield-Erweiterung) ───────────────────────
// Zeigt dem eingeloggten Tenant seine EIGENE Rechts-/Compliance-Lage: erkannte
// Fristen, Mahn-Eskalationen, Rechts-Signal-Häufungen und offene DSGVO-Fristen —
// abgeleitet aus dem, was ohnehin durchs Postfach läuft. Kein Finanz-Tool sieht das.
//
// Self-contained (eigener Fetch/Typen), damit die einzige Änderung an geteilten
// Dateien das Einhängen in Signale.tsx ist. Auth = Console-Session (Auth-Projekt)
// via x-console-token, exakt wie RiskShieldCard/useMySignals.
//
// Rechts-Hard-Line: KEINE Rechtsberatung. "Signal erkannt, bitte prüfen."

const COMPLIANCE_URL = "https://vunhcexnwbvxrwecymiy.functions.supabase.co/compliance-radar";
const CAPITAL_ANON = "sb_publishable_FXGJwwQt69sfmWS3cuF37g_hYALbbe2";

type Ampel = "red" | "amber" | "green";
type Subtype = "deadline_overdue" | "dunning_escalation" | "legal_signal" | "dsar_pending";
type ComplianceItem = {
  subtype: Subtype; title: string | null; severity: "red" | "amber"; tier: "confirmed" | "watch";
  count: number | null; days: number | null; message: string; source_note: string | null;
  was_tun: string | null; first_detected_at: string | null;
};
type ComplianceRadar = {
  has_tenant: boolean; tenant_id: string | null; ampel: Ampel; exposure_score: number | null;
  updated_at: string | null; disclaimer: string | null;
  summary: { total: number; red: number; amber: number };
  items: ComplianceItem[];
};

const EMPTY: ComplianceRadar = {
  has_tenant: false, tenant_id: null, ampel: "green", exposure_score: null, updated_at: null,
  disclaimer: null, summary: { total: 0, red: 0, amber: 0 }, items: [],
};

async function callCompliance(): Promise<ComplianceRadar> {
  const { data: { session } } = await authClient.auth.getSession();
  const token = session?.access_token ?? "";
  if (!token) return EMPTY;
  const res = await fetch(COMPLIANCE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: CAPITAL_ANON, "x-console-token": token },
    body: JSON.stringify({ action: "list" }),
  });
  if (res.status === 401) return EMPTY;
  const j = await res.json().catch(() => ({} as any));
  if (!res.ok || !j.ok) throw new Error(j.error || ("compliance_radar_failed_" + res.status));
  return {
    has_tenant: !!j.has_tenant, tenant_id: j.tenant_id ?? null, ampel: j.ampel ?? "green",
    exposure_score: j.exposure_score ?? null, updated_at: j.updated_at ?? null, disclaimer: j.disclaimer ?? null,
    summary: j.summary ?? { total: 0, red: 0, amber: 0 }, items: j.items ?? [],
  };
}

function useComplianceRadar() {
  return useQuery<ComplianceRadar>({ queryKey: ["cap", "compliance-radar"], refetchOnWindowFocus: false, queryFn: callCompliance });
}

function ampelColor(a: Ampel | "gray"): string {
  switch (a) { case "red": return "#C0392B"; case "amber": return "#E8A33D"; case "green": return "#10b981"; default: return "#5A6473"; }
}
function ampelLabel(a: Ampel): string {
  switch (a) { case "red": return "Handlungsbedarf"; case "amber": return "Beobachtung"; default: return "Unauffällig"; }
}
const SUBTYPE_ICON: Record<Subtype, typeof Clock> = {
  deadline_overdue: Clock, dunning_escalation: FileWarning, legal_signal: Scale, dsar_pending: Mail,
};

function ItemRow({ it }: { it: ComplianceItem }) {
  const [open, setOpen] = useState(false);
  const Icon = SUBTYPE_ICON[it.subtype] ?? AlertTriangle;
  const col = ampelColor(it.severity);
  return (
    <div className="rounded-lg border border-border bg-background/40">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col }} />
        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{it.title ?? it.subtype}</span>
        <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
          style={{ color: it.tier === "confirmed" ? ampelColor("red") : ampelColor("amber"), backgroundColor: (it.tier === "confirmed" ? ampelColor("red") : ampelColor("amber")) + "1a" }}>
          {it.tier === "confirmed" ? "bestätigt" : "beobachten"}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-0.5 space-y-1.5 border-t border-border/60 text-xs">
          <p className="text-foreground leading-relaxed pt-1.5">{it.message}</p>
          {it.source_note && <p className="text-muted-foreground italic">{it.source_note}</p>}
          {it.was_tun && (
            <p className="flex items-start gap-1.5 text-muted-foreground">
              <ChevronRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
              <span>{it.was_tun}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ComplianceRadarCard() {
  const { data, isLoading } = useComplianceRadar();
  const s = data?.summary;
  const items = data?.items ?? [];

  return (
    <Card className="glass-card border-primary/20">
      <CardContent className="pt-6 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Scale className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Rechts- & Compliance-Lage</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Frühwarnung für Ihre eigene rechtliche Lage. Wir erkennen überschrittene Fristen, Mahn-Eskalationen,
              Rechts-Signale und offene DSGVO-Auskunftsersuchen aus dem, was ohnehin durch Ihr Postfach läuft.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-20 w-full" /></div>
        ) : !data?.has_tenant ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            Kein Firmenprofil gefunden. Melden Sie sich mit Ihrem Firmen-Postfach an.
          </div>
        ) : (
          <>
            {/* Ampel-Status + Exposure-Score */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border bg-background/40 px-3 py-2.5 text-center">
                <div className="text-2xl font-semibold tabular-nums" style={{ color: (s?.red ?? 0) > 0 ? ampelColor("red") : undefined }}>{s?.red ?? 0}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Handlungsbedarf</div>
              </div>
              <div className="rounded-lg border border-border bg-background/40 px-3 py-2.5 text-center">
                <div className="text-2xl font-semibold tabular-nums" style={{ color: (s?.amber ?? 0) > 0 ? ampelColor("amber") : undefined }}>{s?.amber ?? 0}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Beobachtung</div>
              </div>
              <div className="rounded-lg border border-border bg-background/40 px-3 py-2.5 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ampelColor(data.ampel) }} />
                  <span className="text-sm font-medium" style={{ color: ampelColor(data.ampel) }}>{ampelLabel(data.ampel)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {data.exposure_score != null ? `Exposure-Index ${Math.round(data.exposure_score)}/100` : "Gesamtlage"}
                </div>
              </div>
            </div>

            {/* Handlungsbedarf-Banner */}
            {(s?.red ?? 0) > 0 && (
              <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm"
                style={{ borderColor: ampelColor("red") + "40", backgroundColor: ampelColor("red") + "0d" }}>
                <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: ampelColor("red") }} />
                <span className="text-foreground">
                  <strong>{s?.red}</strong> {s?.red === 1 ? "Punkt braucht" : "Punkte brauchen"} Ihre Aufmerksamkeit (erkanntes Signal, über mehrere Prüfläufe stabil). Bitte prüfen.
                </span>
              </div>
            )}

            {/* Punkte-Liste */}
            {items.length > 0 ? (
              <div className="space-y-2">{items.map((it, i) => <ItemRow key={it.subtype + i} it={it} />)}</div>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Keine offenen Compliance-Signale erkannt. Wir beobachten Ihr Postfach weiter im Hintergrund.
              </div>
            )}

            {/* Disclaimer — KEINE Rechtsberatung */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground border-t border-border/60 pt-3">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
              <span>{data.disclaimer ?? "Diese Hinweise sind automatisch erkannte Signale, keine Rechtsberatung und keine juristische Bewertung. Bitte prüfen Sie jeden Punkt selbst und ziehen Sie im Zweifel fachkundigen Rat hinzu."}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
