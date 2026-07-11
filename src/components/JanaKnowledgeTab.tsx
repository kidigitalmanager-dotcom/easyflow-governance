import { useState } from "react";
import { toast } from "sonner";
import { Brain, Check, X, Pencil, Plus, Loader2, Sparkles, BookOpen, Users, Timer, Scale, Package, Feather, Wand2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useJanaKnowledge, useCreateJanaKnowledge, usePatchJanaKnowledge, useMe } from "@/hooks/use-api";
import type { JanaKnowledgeCategory, JanaKnowledgeFact } from "@/lib/api-client";
import JanaBriefingWizard from "@/components/JanaBriefingWizard";

// ---------------------------------------------------------------------------
// B3 Jana-Wissen: Tenant-Wissensmodell mit Confirm-Loop (memory-engine v1.5.0).
//
// Drei Bereiche: (1) offene Vorschläge (Jana hat gelernt ... stimmt das?),
// (2) bestätigtes Wissen (editierbar, deaktivierbar), (3) Vorlagen-Formular
// (Kategorie + EIN Satz). BEWUSST kein Freitext-Regel-Editor und kein Builder
// (Plug-and-Play-Regel): ein Satz + feste Kategorien, mehr nicht.
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<JanaKnowledgeCategory, { label: string; icon: typeof Package }> = {
  product: { label: "Produkt", icon: Package },
  process: { label: "Prozess", icon: BookOpen },
  sla: { label: "Reaktionszeiten", icon: Timer },
  policy: { label: "Regeln", icon: Scale },
  team: { label: "Team", icon: Users },
  style: { label: "Stil & Ton", icon: Feather },
};

function categoryMeta(cat: string) {
  return CATEGORY_META[cat as JanaKnowledgeCategory] ?? { label: cat, icon: BookOpen };
}

function evidenceLine(fact: JanaKnowledgeFact): string {
  if (fact.source === "manual") return "Manuell hinzugefügt";
  if (fact.source === "briefing") return "Aus dem Unternehmens-Briefing";
  const ev = fact.evidence;
  if (ev?.kind === "correction_cluster") {
    const n = ev.count ?? ev.correction_ids?.length ?? 0;
    return `Gelernt aus ${n} Label-Korrekturen in eurem Postfach`;
  }
  if (ev?.kind === "entity_focus") {
    return `Gelernt aus ${ev.label_total ?? "mehreren"} wiederkehrenden Vorgängen`;
  }
  if (ev?.kind === "kb_extract") {
    return ev.title ? `Aus dem Dokument „${ev.title}“` : "Aus einem hochgeladenen Dokument";
  }
  return "Von Jana gelernt";
}

function CategoryBadge({ category }: { category: string }) {
  const meta = categoryMeta(category);
  const Icon = meta.icon;
  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      <Icon className="w-3 h-3" />
      {meta.label}
    </Badge>
  );
}

function FactEditor({
  initial, onSave, onCancel, saving, saveLabel,
}: { initial: string; onSave: (text: string) => void; onCancel: () => void; saving: boolean; saveLabel: string }) {
  const [text, setText] = useState(initial);
  const valid = text.trim().length >= 10 && text.trim().length <= 280;
  return (
    <div className="space-y-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={280} />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!valid || saving} onClick={() => onSave(text.trim())}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {saveLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Abbrechen</Button>
        <span className="text-xs text-muted-foreground ml-auto">{text.trim().length}/280</span>
      </div>
    </div>
  );
}

export default function JanaKnowledgeTab() {
  const { data, isLoading, error } = useJanaKnowledge();
  const patchMutation = usePatchJanaKnowledge();
  const createMutation = useCreateJanaKnowledge();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newCategory, setNewCategory] = useState<JanaKnowledgeCategory>("process");
  const [newText, setNewText] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const { data: me } = useMe();
  const [wizardOpen, setWizardOpen] = useState(false);

  const runPatch = (body: { id: number; action: "confirm" | "reject" | "update"; fact_text?: string }, okMsg: string) => {
    setBusyId(body.id);
    patchMutation.mutate(body, {
      onSuccess: () => { toast.success(okMsg); setEditingId(null); },
      onError: (e: Error) => toast.error(e.message || "Aktion fehlgeschlagen"),
      onSettled: () => setBusyId(null),
    });
  };

  const handleCreate = () => {
    const text = newText.trim();
    if (text.length < 10) { toast.error("Bitte einen ganzen Satz eingeben (mind. 10 Zeichen)."); return; }
    createMutation.mutate({ category: newCategory, fact_text: text }, {
      onSuccess: () => { toast.success("Wissen gespeichert — Jana berücksichtigt es ab sofort."); setNewText(""); },
      onError: (e: Error) => toast.error(e.message === "duplicate_fact" ? "Diesen Satz gibt es schon." : (e.message || "Speichern fehlgeschlagen")),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data?.ok) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Das Jana-Wissen ist noch nicht erreichbar. Falls das System gerade frisch eingerichtet wurde,
        fehlt vermutlich noch die Datenbank-Migration (v1.40) — danach erscheint hier das Wissensmodell.
      </div>
    );
  }

  const proposed = data.facts.filter((f) => f.status === "proposed");
  const confirmed = data.facts.filter((f) => f.status === "confirmed");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="w-5 h-5" />
          Jana-Wissen
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Was Jana über euer Unternehmen weiß: Produkte, Prozesse, Reaktionszeiten, Regeln, Team.
          Bestätigtes Wissen fließt in Janas Antwortentwürfe ein. Jana lernt aus euren Korrekturen
          und schlägt neue Einträge vor — nichts wird ohne eure Bestätigung wirksam.
        </p>
      </div>

      {/* B3.1: gefuehrter Briefing-Wizard (prominenter Einstieg) */}
      <section className="rounded-lg border bg-primary/5 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 space-y-1">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-primary" />
              Jana briefen
            </h3>
            <p className="text-xs text-muted-foreground">
              Beantworte in wenigen Minuten die wichtigsten Fragen, damit Jana euer Unternehmen
              versteht. Aus euren Antworten werden direkt bestätigte Regeln.
            </p>
          </div>
          <Button onClick={() => setWizardOpen(true)} className="shrink-0">
            <Wand2 className="w-4 h-4" />
            Briefing starten
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <FileText className="w-3 h-3 shrink-0" />
          <span>
            Schon Unterlagen? Lade PDFs oder Excel-Listen im Bereich{" "}
            <a href="/einstellungen?tab=knowledge" className="text-primary hover:underline">Wissensbasis</a>{" "}
            hoch, Jana schlägt daraus Regeln vor.
          </span>
        </p>
      </section>

      <JanaBriefingWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        domain={me?.user?.domain}
        facts={data.facts}
      />

      {proposed.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Jana hat etwas gelernt — stimmt das? ({proposed.length})
          </h3>
          {proposed.map((fact) => (
            <div key={fact.id} className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <CategoryBadge category={fact.category} />
                <span className="text-xs text-muted-foreground">{evidenceLine(fact)}</span>
              </div>
              {editingId === fact.id ? (
                <FactEditor
                  initial={fact.fact_text}
                  saving={busyId === fact.id}
                  saveLabel="Bestätigen"
                  onSave={(text) => runPatch({ id: fact.id, action: "confirm", fact_text: text }, "Bestätigt — Jana nutzt diese Regel ab sofort.")}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <p className="text-sm">{fact.fact_text}</p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" disabled={busyId === fact.id}
                      onClick={() => runPatch({ id: fact.id, action: "confirm" }, "Bestätigt — Jana nutzt diese Regel ab sofort.")}>
                      {busyId === fact.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Stimmt
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(fact.id)}>
                      <Pencil className="w-3.5 h-3.5" />
                      Anpassen
                    </Button>
                    <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={busyId === fact.id}
                      onClick={() => runPatch({ id: fact.id, action: "reject" }, "Abgelehnt — Jana schlägt das nicht erneut vor.")}>
                      <X className="w-3.5 h-3.5" />
                      Stimmt nicht
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Bestätigtes Wissen ({confirmed.length})</h3>
        {confirmed.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Noch kein bestätigtes Wissen. Füge unten den ersten Eintrag hinzu — zum Beispiel eine
            Regel wie „Bei Retouren über 100 Euro verlangen wir immer Fotos vom Schaden."
          </div>
        ) : (
          confirmed.map((fact) => (
            <div key={fact.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <CategoryBadge category={fact.category} />
                <span className="text-xs text-muted-foreground">{evidenceLine(fact)}</span>
              </div>
              {editingId === fact.id ? (
                <FactEditor
                  initial={fact.fact_text}
                  saving={busyId === fact.id}
                  saveLabel="Speichern"
                  onSave={(text) => runPatch({ id: fact.id, action: "update", fact_text: text }, "Aktualisiert.")}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <p className="text-sm">{fact.fact_text}</p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(fact.id)}>
                      <Pencil className="w-3.5 h-3.5" />
                      Bearbeiten
                    </Button>
                    <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={busyId === fact.id}
                      onClick={() => runPatch({ id: fact.id, action: "reject" }, "Entfernt — Jana nutzt diese Regel nicht mehr.")}>
                      <X className="w-3.5 h-3.5" />
                      Entfernen
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Wissen hinzufügen
        </h3>
        <p className="text-xs text-muted-foreground">
          Ein Satz pro Eintrag. Beispiel: „Reparaturaufträge unter 300 Euro darf der Hausmeister direkt beauftragen."
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={newCategory} onValueChange={(v) => setNewCategory(v as JanaKnowledgeCategory)}>
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Kategorie" />
            </SelectTrigger>
            <SelectContent>
              {(data.categories ?? Object.keys(CATEGORY_META) as JanaKnowledgeCategory[]).map((cat) => (
                <SelectItem key={cat} value={cat}>{categoryMeta(cat).label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Ein präziser Satz ..."
            rows={2}
            maxLength={280}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={createMutation.isPending || newText.trim().length < 10} onClick={handleCreate}>
            {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Speichern
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">{newText.trim().length}/280</span>
        </div>
      </section>
    </div>
  );
}
