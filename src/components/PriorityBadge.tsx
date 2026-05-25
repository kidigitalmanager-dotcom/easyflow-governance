import { cn } from "@/lib/utils";

interface PriorityBadgeProps {
  priority: "P0" | "P1" | "P2" | "P3";
  showLabel?: boolean;
  labelOverride?: string;
  className?: string;
}

const priorityConfig = {
  P0: { label: "Sofort handeln", color: "bg-p0/15 text-p0 border-p0/30" },
  P1: { label: "Zeitkritisch", color: "bg-p1/15 text-p1 border-p1/30" },
  P2: { label: "Antwort empfohlen", color: "bg-p2/15 text-p2 border-p2/30" },
  P3: { label: "Kein Handlungsbedarf", color: "bg-p3/15 text-p3 border-p3/30" },
};

export function PriorityBadge({ priority, showLabel = false, labelOverride, className }: PriorityBadgeProps) {
  const config = priorityConfig[priority];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", config.color, className)}>
      {priority}
      {showLabel && <span className="hidden sm:inline">· {labelOverride ?? config.label}</span>}
    </span>
  );
}
