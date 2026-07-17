import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { JanaChat } from "@/components/capital/JanaChat";

/**
 * Redesign 07.07.2026: Jana als schwebender Begleiter auf JEDER Seite,
 * statt versteckt als Unterpunkt im /signale-Subnav.
 * Reuse der bestehenden JanaChat-Komponente (Tenant-Modus, read-only, belegt).
 * Der Chat wird erst beim Oeffnen gemountet (keine Fetches vorher).
 */
export function JanaFab() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <div className="w-[400px] max-w-[calc(100vw-3rem)] max-h-[min(72vh,640px)] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border sticky top-0 bg-card z-10">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Jana fragen</span>
            <span className="ml-auto text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">read-only · belegt</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Jana schließen"
              className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3">
            <JanaChat />
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Jana schließen" : "Jana fragen"}
        className="w-[52px] h-[52px] rounded-full grid place-items-center text-primary-foreground shadow-[0_8px_28px_hsl(160_84%_39%/0.35)] transition-transform hover:scale-105"
        style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--emerald-dark)))" }}
      >
        <Sparkles className="w-5 h-5" />
      </button>
    </div>
  );
}
