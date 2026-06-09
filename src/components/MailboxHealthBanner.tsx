// v4.55: Klickbare Postfach-Health-Ampel. Liest `mailbox_health` aus GET /v1/dashboard/me
// (Backend v4.55.0: Poller schreibt last_poll_success_at/last_poll_error pro Tick).
// Rendert NUR, wenn ein Postfach 'stale' (kein Poll-Erfolg seit >=15 min) oder 'error'
// (letzter Tick fehlgeschlagen, z. B. token_refresh_failed) ist — also genau dann,
// wenn die Klassifikation für diesen Tenant STILL gestorben wäre (Gmail-Billing-
// Blackout 06.06., Token-Rotation 06.06.). Im Normalfall: unsichtbar.
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useMe } from "@/hooks/use-api";
import type { MailboxHealth } from "@/lib/api-client";
import { cn } from "@/lib/utils";

function fmtAge(iso: string | null | undefined): string {
  if (!iso) return "noch nie";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `vor ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `vor ${h} h`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

const PROVIDER_LABEL: Record<string, string> = { gmail: "Gmail", outlook: "Outlook" };

export function MailboxHealthBanner() {
  const { data: me } = useMe();
  const health = (me?.mailbox_health ?? []) as MailboxHealth[];
  const problems = health.filter((h) => h.status === "error" || h.status === "stale");
  if (problems.length === 0) return null;

  const anyError = problems.some((p) => p.status === "error");

  return (
    <div
      role="alert"
      className={cn(
        "mx-8 mt-4 rounded-lg border px-4 py-3 text-sm",
        anyError
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-amber-400/50 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">
            {problems.length === 1
              ? "Ein Postfach wird gerade nicht verarbeitet"
              : `${problems.length} Postfächer werden gerade nicht verarbeitet`}
          </p>
          {problems.map((p) => (
            <p key={`${p.provider}:${p.email ?? ""}`} className="text-[13px] leading-relaxed opacity-90">
              <strong>{PROVIDER_LABEL[p.provider] ?? p.provider}</strong>
              {p.email ? ` (${p.email})` : ""} —{" "}
              {p.status === "error"
                ? `Fehler beim letzten Abruf: ${p.last_error || "unbekannt"}`
                : `kein erfolgreicher Abruf seit ${fmtAge(p.last_success_at)}`}
              . Eingehende E-Mails werden evtl. nicht klassifiziert.
            </p>
          ))}
          <Link
            to="/einstellungen?tab=integrations"
            className="inline-block text-[13px] font-semibold underline underline-offset-2"
          >
            → Postfach prüfen / neu verbinden
          </Link>
        </div>
      </div>
    </div>
  );
}

export default MailboxHealthBanner;
