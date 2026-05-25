import { cn } from "@/lib/utils";
import { Reply, Zap, BellOff, type LucideIcon } from "lucide-react";
import { type ResponseType, responseTypeLabel } from "@/data/humanize";

// v4.18.8: Antwort-Typ-Badge (reply | action | info) — gespeist aus dem
// Backend-Feld response_type. Reine Präsentation, eigene Farbe je Typ.
const CONFIG: Record<ResponseType, { color: string; Icon: LucideIcon }> = {
  reply: { color: "bg-primary/10 text-primary border-primary/20", Icon: Reply },
  action: { color: "bg-p1/15 text-p1 border-p1/30", Icon: Zap },
  info: { color: "bg-p3/15 text-p3 border-p3/30", Icon: BellOff },
};

export function ResponseTypeBadge({ type, className }: { type: ResponseType; className?: string }) {
  const cfg = CONFIG[type] ?? CONFIG.reply;
  const Icon = cfg.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border",
        cfg.color,
        className,
      )}
      title="Empfohlene Reaktion auf diese E-Mail"
    >
      <Icon className="h-3 w-3" />
      {responseTypeLabel(type)}
    </span>
  );
}
