import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Check, ArrowRight, ArrowLeft, Loader2, Wand2, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useCreateJanaBriefing } from "@/hooks/use-api";
import type { JanaKnowledgeFact } from "@/lib/api-client";
import { getBriefingQuestions, domainLabel, type BriefingQuestion } from "@/data/briefing-questions";

// ---------------------------------------------------------------------------
// B3.1 Briefing-Wizard: gefuehrtes Unternehmens-Briefing (eine Frage pro Screen).
// Antworten -> Server-Destillation (Haiku) -> bestaetigte Jana-Fakten.
// Bereits beantwortete Fragen sind vorbefuellt; nur Neues/Geaendertes wird
// gespeichert (kein unnoetiges Neu-Destillieren). Jede Frage ist ueberspringbar.
// ---------------------------------------------------------------------------

// Muss zu knowledge_engine.factKeyForBriefing (Backend) passen: briefing_<slug(id)>.
function briefingKey(id: string): string {
  const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return `briefing_${slug}`;
}

type Phase = "intro" | "questions" | "done";

export default function JanaBriefingWizard({
  open,
  onOpenChange,
  domain,
  facts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain?: string | null;
  facts: JanaKnowledgeFact[];
}) {
  const questions = useMemo(() => getBriefingQuestions(domain), [domain]);
  const createBriefing = useCreateJanaBriefing();

  // Vorbelegung: bestehender Briefing-Satz je Frage (fact_text).
  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const q of questions) {
      const f = facts.find((x) => x.fact_key === briefingKey(q.id));
      if (f) map[q.id] = f.fact_text;
    }
    return map;
  }, [questions, facts]);

  const [phase, setPhase] = useState<Phase>("intro");
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [savedFacts, setSavedFacts] = useState<JanaKnowledgeFact[]>([]);

  const answeredCount = questions.filter((q) => valueFor(q).trim().length > 0).length;

  function valueFor(q: BriefingQuestion): string {
    return answers[q.id] !== undefined ? answers[q.id] : (initial[q.id] ?? "");
  }

  function reset() {
    setPhase("intro");
    setIdx(0);
    setAnswers({});
    setSavedFacts([]);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function setAnswer(id: string, text: string) {
    setAnswers((prev) => ({ ...prev, [id]: text }));
  }

  function goNext() {
    if (idx < questions.length - 1) setIdx(idx + 1);
    else void handleSubmit();
  }

  async function handleSubmit() {
    // Nur NEUE oder GEAENDERTE Antworten senden (kein unnoetiges Neu-Destillieren).
    const payload = questions
      .map((q) => {
        const val = valueFor(q).trim();
        const wasChanged = answers[q.id] !== undefined && val !== (initial[q.id] ?? "").trim();
        const isNew = !(q.id in initial) && val.length > 0;
        return { q, val, send: val.length > 0 && (wasChanged || isNew) };
      })
      .filter((x) => x.send)
      .map((x) => ({
        question_id: x.q.id,
        question: x.q.question,
        answer: x.val,
        category: x.q.category,
      }));

    if (payload.length === 0) {
      toast.info("Es gibt nichts Neues zu speichern.");
      setPhase("done");
      setSavedFacts([]);
      return;
    }

    try {
      const res = await createBriefing.mutateAsync({ briefing_answers: payload });
      setSavedFacts(res.created ?? []);
      setPhase("done");
      toast.success(
        (res.count ?? 0) > 0
          ? `Jana hat ${res.count} ${res.count === 1 ? "Eintrag" : "Einträge"} gelernt.`
          : "Briefing gespeichert.",
      );
    } catch (e) {
      toast.error((e as Error).message || "Speichern fehlgeschlagen");
    }
  }

  const dLabel = domainLabel(domain);
  const current = questions[idx];
  const progress = Math.round(((idx + 1) / questions.length) * 100);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {phase === "intro" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-primary" />
                Jana in wenigen Minuten briefen
              </DialogTitle>
              <DialogDescription>
                {questions.length} kurze Fragen{dLabel ? ` (${dLabel})` : ""} zu Produkt, Prozessen,
                Reaktionszeiten, Regeln und Team. Aus deinen Antworten macht Jana klare Regeln, die
                in ihre Antwortentwürfe einfließen. Jede Frage ist überspringbar.
              </DialogDescription>
            </DialogHeader>
            {answeredCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {answeredCount} von {questions.length} Fragen sind bereits beantwortet und vorausgefüllt,
                du kannst sie anpassen.
              </p>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>Später</Button>
              <Button onClick={() => { setPhase("questions"); setIdx(0); }}>
                <Sparkles className="w-4 h-4" />
                Los geht&apos;s
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === "questions" && current && (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  Frage {idx + 1} von {questions.length}
                </span>
                <Badge variant="secondary" className="font-normal">{categoryLabel(current.category)}</Badge>
              </div>
              <Progress value={progress} className="h-1.5 mt-2" />
              <DialogTitle className="text-base pt-3">{current.question}</DialogTitle>
            </DialogHeader>

            <div className="space-y-2">
              <Textarea
                autoFocus
                rows={4}
                maxLength={1000}
                placeholder={current.placeholder}
                value={valueFor(current)}
                onChange={(e) => setAnswer(current.id, e.target.value)}
              />
              {initial[current.id] !== undefined && answers[current.id] === undefined && (
                <p className="text-[11px] text-muted-foreground">Bereits erfasst, du kannst es anpassen.</p>
              )}
            </div>

            <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={idx === 0}
                onClick={() => setIdx(Math.max(0, idx - 1))}
              >
                <ArrowLeft className="w-4 h-4" />
                Zurück
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={goNext}>Überspringen</Button>
                <Button size="sm" disabled={createBriefing.isPending} onClick={goNext}>
                  {createBriefing.isPending && idx === questions.length - 1 ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : idx === questions.length - 1 ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  {idx === questions.length - 1 ? "Fertig & speichern" : "Weiter"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {phase === "done" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Briefing gespeichert
              </DialogTitle>
              <DialogDescription>
                {savedFacts.length > 0
                  ? "Das hat Jana aus deinen Antworten gelernt. Du kannst jeden Eintrag im Wissensmodell weiter anpassen."
                  : "Es gab nichts Neues zu speichern. Deine bereits erfassten Einträge bleiben bestehen."}
              </DialogDescription>
            </DialogHeader>

            {savedFacts.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {savedFacts.map((f) => (
                  <div key={f.id} className="rounded-md border bg-muted/30 p-3 space-y-1">
                    <Badge variant="secondary" className="font-normal">{categoryLabel(f.category)}</Badge>
                    <p className="text-sm">{f.fact_text}</p>
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Fertig</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  product: "Produkt",
  process: "Prozess",
  sla: "Reaktionszeiten",
  policy: "Regeln",
  team: "Team",
  style: "Stil & Ton",
};
function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}
