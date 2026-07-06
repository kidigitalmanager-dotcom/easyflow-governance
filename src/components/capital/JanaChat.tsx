import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Send, ShieldCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJanaChat } from "@/hooks/use-capital";
import type { CapAccount, JanaCitation } from "@/lib/capital";

type Msg = { role: "user" | "assistant"; content: string; citations?: JanaCitation[]; note?: string };

const STARTERS = [
  "Warum hat sich mein Score verändert?",
  "Was sind meine Top-3-Prioritäten diese Woche?",
  "Welche meiner Datenquellen ist gerade am schwächsten?",
  "Welche Signale sind veraltet?",
];

function citeChip(c: JanaCitation): string {
  const label = c.label || c.key;
  const v = c.value != null ? ` ${Math.round(c.value)}/100` : "";
  const p = c.period ? ` · ${String(c.period).slice(0, 7)}` : "";
  return `${label}${v}${p}`;
}

// Jana-Chat: read-only Q&A ueber die EIGENEN Signale. Jede Antwort belegt ihre
// Aussagen mit KPI + Quelle (Anti-Blackbox). Kein Schreiben, kein Senden.
export function JanaChat({ account }: { account?: CapAccount | null }) {
  const chat = useJanaChat();
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollDown = () => setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 60);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || chat.isPending) return;
    const history = msgs.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    scrollDown();
    chat.mutate(
      { message: q, history },
      {
        onSuccess: (r) => {
          let content = r.answer ?? "";
          let note: string | undefined;
          if (r.has_own_account === false) { content = ""; note = "Jana erklärt deine eigenen Signale, sobald dein Profil Daten liefert."; }
          else if (r.llm_configured === false) { content = ""; note = "Jana-Chat ist noch nicht scharfgeschaltet (LLM-Verbindung fehlt). Die Wochen-Prioritäten funktionieren bereits."; }
          else if (r.llm_error) { content = ""; note = "Jana ist gerade nicht erreichbar. Bitte später erneut versuchen."; }
          else if (!content) { note = "Dazu liegen mir gerade keine belegten Daten vor."; }
          setMsgs((prev) => [...prev, { role: "assistant", content, citations: r.citations ?? [], note }]);
          scrollDown();
        },
        onError: (e) => { setMsgs((prev) => [...prev, { role: "assistant", content: "", note: "Fehler: " + e.message }]); scrollDown(); },
      },
    );
  };

  return (
    <Card className="glass-card border-primary/15">
      <CardContent className="pt-5 pb-4">
        {/* Kopf */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-[18px] h-[18px] text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground leading-tight">Jana fragen</h3>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                Stell Fragen zu deinen Signalen — jede Antwort mit KPI + Quelle belegt.
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border border-border bg-muted text-muted-foreground shrink-0">
            <ShieldCheck className="w-3 h-3" /> read-only
          </span>
        </div>

        {/* Verlauf */}
        <div className="rounded-xl border border-border bg-background/40 p-3 min-h-[220px] max-h-[420px] overflow-y-auto">
          {msgs.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {account?.name ? `Hallo — ich erkläre die Signale von ${account.name}.` : "Hallo — ich erkläre deine Frühwarn-Signale."} Womit soll ich anfangen?
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs text-left px-3 py-1.5 rounded-full border border-border bg-card/60 text-foreground hover:bg-muted/60 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {msgs.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5", m.role === "user" ? "bg-primary/10 border border-primary/20" : "bg-card/70 border border-border")}>
                    {m.content && <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{m.content}</p>}
                    {m.note && (
                      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {m.note}
                      </p>
                    )}
                    {m.citations && m.citations.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2 pt-2 border-t border-border/60">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Belege:</span>
                        {m.citations.map((c) => (
                          <span key={c.type + ":" + c.key} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-border bg-muted/60 text-foreground tabular-nums">
                            {citeChip(c)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chat.isPending && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 bg-card/70 border border-border">
                    <Skeleton className="h-4 w-40" />
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Eingabe */}
        <form
          className="flex items-end gap-2 mt-3"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            rows={1}
            placeholder="Frag Jana etwas zu deinen Signalen…"
            className="flex-1 resize-none rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[42px] max-h-32"
          />
          <Button type="submit" disabled={!input.trim() || chat.isPending} className="h-[42px] px-4 gap-1.5 shrink-0">
            <Send className="w-4 h-4" /> Senden
          </Button>
        </form>
        <p className="text-[11px] text-muted-foreground mt-2">
          Jana liest nur deine aggregierten 0–100-Signale (PII-frei) und schlägt nichts eigenmächtig vor. Keine Sende- oder Schreibaktionen.
        </p>
      </CardContent>
    </Card>
  );
}
