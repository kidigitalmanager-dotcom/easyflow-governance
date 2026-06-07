/**
 * AutopilotMaturityCard — „Autonomie-Stufen & Fortschritt" (Paket B 2026-06).
 * Einstellungen → Email-Autopilot, eigene Karte direkt unter der Intent-Whitelist.
 *
 * Pro freigeschaltetem Intent: Stufen-Stepper SHADOW → ASSISTED → AUTONOMOUS
 * + die 3 Promotion-Gates (Samples x/400 · Abweichung ≤5 % · Bearbeitungs-Quote ≤10 %)
 * aus governance.autopilot_maturity (kommt fertig im /autopilot/policy-Payload — 0 Backend-Touch).
 * Promotion bleibt Super-Admin-Workflow; hier gibt es höchstens „Promotion anfragen"
 * (bestehender Endpoint /autopilot/promote-request aus v4.16).
 */
import { Check, ChevronRight, HelpCircle, Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRequestAutopilotPromotion } from "@/hooks/use-api";
import { modeSentence } from "@/data/humanize";
import type { AutopilotCoreKey, AutopilotMaturityRow, AutopilotMode } from "@/lib/api-client";
import {
  MODE_ORDER,
  MODE_SHORT_LABELS,
  computeGates,
  maturityStatus,
  nextMode,
  type GateProgress,
  type MaturityStatusInfo,
} from "@/lib/autopilot-maturity";

const CORE_KEY_LABELS: Record<string, string> = {
  status_fulfillment: "Status & Abwicklung",
  request_order: "Anfrage & Auftrag",
  returns_refund: "Rückgabe & Erstattung",
};

const GATE_TOOLTIPS: Record<GateProgress["key"], string> = {
  samples:
    "So viele Mails dieses Typs hat UseEasy im Schatten-Modus beobachtet. Erst ab 400 beobachteten Mails wird eine Hochstufung überhaupt bewertet.",
  mismatch:
    "Wie oft die Schatten-Entscheidung von dem abwich, was du (oder dein Team) tatsächlich getan habt. Höchstens 5 % Abweichung sind erlaubt.",
  edit:
    "Wie oft freigegebene Entwürfe vor dem Senden noch bearbeitet wurden. Höchstens 10 % sind erlaubt — sonst formuliert UseEasy noch nicht gut genug.",
};

function statusBadge(info: MaturityStatusInfo) {
  switch (info.kind) {
    case "max":
      return <Badge>{info.label}</Badge>;
    case "ready":
      return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">{info.label}</Badge>;
    case "requested":
      return <Badge variant="secondary">{info.label}</Badge>;
    case "quality":
      return <Badge variant="destructive">{info.label}</Badge>;
    default:
      return <Badge variant="outline">{info.label}</Badge>;
  }
}

function gateDot(status: GateProgress["status"]) {
  const color =
    status === "pass" ? "bg-emerald-500" : status === "fail" ? "bg-destructive" : "bg-muted-foreground/40";
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
}

function ModeStepper({ mode }: { mode: AutopilotMode | string | undefined }) {
  const currentIdx = MODE_ORDER.indexOf(String(mode || "shadow") as AutopilotMode);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {MODE_ORDER.map((m, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={m} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
                    active
                      ? "bg-primary/15 text-primary border-primary/40"
                      : done
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                        : "text-muted-foreground border-border"
                  }`}
                >
                  <span
                    className={`flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-emerald-500 text-white"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="w-3 h-3" /> : i + 1}
                  </span>
                  {MODE_SHORT_LABELS[m]}
                  <span className="uppercase text-[9px] tracking-wide opacity-60">{m}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px]">
                <p className="text-xs">{modeSentence(m) || m}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}

interface AutopilotMaturityCardProps {
  maturity: AutopilotMaturityRow[];
  intents: string[];
  whitelist: string[];
  legalAck: boolean;
}

export default function AutopilotMaturityCard({
  maturity,
  intents,
  whitelist,
  legalAck,
}: AutopilotMaturityCardProps) {
  const requestPromotion = useRequestAutopilotPromotion();

  const handleRequest = (coreKey: string, target: AutopilotMode) => {
    requestPromotion.mutate(
      { core_key: coreKey as AutopilotCoreKey, target_mode: target },
      {
        onSuccess: () =>
          toast.success("Promotion angefragt — UseEasy prüft die Freischaltung."),
        onError: (e: unknown) =>
          toast.error(
            "Anfrage fehlgeschlagen: " + (e instanceof Error ? e.message : String(e))
          ),
      }
    );
  };

  return (
    <div className="glass-card p-6 space-y-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">Autonomie-Stufen & Fortschritt</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Jeder Antwort-Typ steigt stufenweise auf: Im <span className="font-medium">Schatten-Modus</span> beobachtet
        UseEasy nur. Erst wenn alle drei Kriterien unten erfüllt sind, kann die nächste Stufe freigeschaltet
        werden — die Freischaltung selbst prüft und bestätigt UseEasy.
      </p>

      <div className="space-y-5">
        {intents.map((ck) => {
          const row = maturity.find((m) => m.core_key === ck) ?? null;
          const enabled = whitelist.includes(ck);
          const info = maturityStatus(row);
          const gates = computeGates(row);
          const target = nextMode(row?.mode);
          const canRequest =
            !!row && row.promotion_ready && !row.promotion_requested && target !== null;
          const autonomousBlocked = target === "autonomous" && !legalAck;

          return (
            <div key={ck} className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{CORE_KEY_LABELS[ck] || ck}</span>
                  {!enabled && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-muted-foreground">
                          nicht aktiviert
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[240px]">
                        <p className="text-xs">
                          Dieser Antwort-Typ ist oben nicht freigeschaltet — es werden keine
                          neuen Beobachtungen gesammelt.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {statusBadge(info)}
              </div>

              <ModeStepper mode={row?.mode} />

              {info.detail && <p className="text-xs text-muted-foreground">{info.detail}</p>}

              <div className="grid gap-2.5 sm:grid-cols-3">
                {gates.map((g) => (
                  <div key={g.key} className="rounded-lg border border-border/60 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {gateDot(g.status)}
                        <span className="text-xs font-medium truncate">{g.label}</span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[260px]">
                          <p className="text-xs">{GATE_TOOLTIPS[g.key]}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold">{g.valueText}</span>
                      <span className="text-[11px] text-muted-foreground">{g.targetText}</span>
                    </div>
                    {g.key === "samples" && <Progress value={g.pct} className="h-1.5" />}
                  </div>
                ))}
              </div>

              {canRequest && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={requestPromotion.isPending || autonomousBlocked}
                    onClick={() => target && handleRequest(ck, target)}
                  >
                    {requestPromotion.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : null}
                    Promotion zu „{target ? MODE_SHORT_LABELS[target] : ""}" anfragen
                  </Button>
                  {autonomousBlocked && (
                    <span className="text-xs text-muted-foreground">
                      Dafür zuerst unten die Rechtsgrundlage bestätigen.
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
