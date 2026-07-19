import { Construction } from "lucide-react";

/** Ehrlicher Platzhalter: sagt, was hier stehen wird und wann. Kein leerer Screen. */
export default function RiskPlaceholder({
  title, day, bullets,
}: { title: string; day: string; bullets: string[] }) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <div className="mt-4 rounded-2xl border border-border bg-card/40 p-6">
        <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border">
          <Construction className="w-3 h-3" /> {day}
        </span>
        <p className="mt-3 text-sm text-muted-foreground">Dieser Bereich wird folgendes enthalten:</p>
        <ul className="mt-2 space-y-1.5">
          {bullets.map((b) => (
            <li key={b} className="text-sm text-foreground/80 flex gap-2">
              <span className="text-muted-foreground/50 shrink-0">·</span>{b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
