import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert } from "lucide-react";

// v4.122.0 (Spam-Rescue): Audit-Trail-Badges fuer die neuen audit_action-Werte.
// "spam_rescue"        -> Mail lag im Provider-Spam und wurde nach Pruefung
//                         (kein Phishing-Signal) automatisch in den Posteingang
//                         zurueckgeholt (traegt dort "UE/Aus Spam gerettet").
// "spam_phishing_flag" -> Phishing-/Fraud-Signal im Spam erkannt; die Mail
//                         wurde BEWUSST NICHT zurueckgeholt (Phish-Notifier).
// Reine Praesentation und gespeist aus audit_log.action (Backend v4.122.0).
export type SpamRescueAction = "spam_rescue" | "spam_phishing_flag";

const CONFIG: Record<SpamRescueAction, { color: string; label: string; title: string; Icon: typeof ShieldCheck }> = {
  spam_rescue: {
    color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
    label: "Aus Spam gerettet",
    title: "Der Provider hatte diese E-Mail als Spam eingestuft. UseEasy hat sie geprüft (kein Phishing-Signal) und automatisch in den Posteingang zurückgeholt und im Postfach als 'UE/Aus Spam gerettet' markiert.",
    Icon: ShieldCheck,
  },
  spam_phishing_flag: {
    color: "bg-destructive/10 text-destructive border-destructive/25",
    label: "Phishing im Spam abgefangen",
    title: "Im Spam-Ordner wurde ein Phishing-/Betrugs-Signal erkannt. Die E-Mail wurde bewusst NICHT in den Posteingang geholt und bleibt im Spam.",
    Icon: ShieldAlert,
  },
};

export function spamRescueAction(v: unknown): SpamRescueAction | null {
  return v === "spam_rescue" || v === "spam_phishing_flag" ? v : null;
}

export function SpamRescueBadge({ action, className }: { action: SpamRescueAction; className?: string }) {
  const cfg = CONFIG[action];
  const Icon = cfg.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border",
        cfg.color,
        className,
      )}
      title={cfg.title}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
