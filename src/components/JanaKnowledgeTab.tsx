import { useState } from "react";
import { toast } from "sonner";
import { Brain, Check, X, Pencil, Plus, Loader2, Sparkles, BookOpen, Users, Timer, Scale, Package, Feather, Wand2, FileText, Globe, ChevronDown, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useJanaKnowledge, useCreateJanaKnowledge, usePatchJanaKnowledge, useMe, useTenantSetupSelf } from "@/hooks/use-api";
import type { JanaKnowledgeCategory, JanaKnowledgeFact } from "@/lib/api-client";
import JanaBriefingWizard from "@/components/JanaBriefingWizard";
import { Checkbox } from "@/components/ui/checkbox";
import {
  gruppiere, istUngeprueft, angabenZahl, auswahl, sammelMeldung,
  type WissensGruppe,
} from "@/lib/wissen-gruppierung";

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

// Briefing C, Baustein 4: die Herkunft "Website" wird beim Namen genannt.
//
// Bewusst wird auf evidence.kind geprueft und NICHT auf fact.source: Fakten, die
// vor Migration v1.45 geschrieben wurden, tragen noch source="learned", obwohl
// sie aus der Website stammen. Die Wahrheit steht immer in evidence.
function isWebsiteFact(fact: JanaKnowledgeFact): boolean {
  return fact.evidence?.kind === "website_scan";
}

// "https://firma.de/versand-und-lieferung" -> "Versand und Lieferung"
function pageLabel(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).pop();
    if (!seg) return "Startseite";
    const name = decodeURIComponent(seg).replace(/\.(html?|php|aspx?)$/i, "").replace(/[-_]+/g, " ").trim();
    if (!name) return "Startseite";
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return null;
  }
}

function evidenceLine(fact: JanaKnowledgeFact): string {
  if (isWebsiteFact(fact)) {
    const page = pageLabel(fact.evidence?.source_url as string | undefined);
    return page ? `Auf Ihrer Website gefunden: ${page}` : "Auf Ihrer Website gefunden";
  }
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

// Der woertliche Satz, auf dem ein Website-Fakt beruht, plus der Link auf die
// Unterseite. Das ist der Unterschied zu "Von Jana gelernt": der Kunde kann
// nachsehen, statt zu glauben. Fehlt der Beleg, wird nichts behauptet.
function WebsiteEvidence({ fact }: { fact: JanaKnowledgeFact }) {
  if (!isWebsiteFact(fact)) return null;
  const quote = typeof fact.evidence?.quote === "string" ? fact.evidence.quote.trim() : "";
  const url = typeof fact.evidence?.source_url === "string" ? fact.evidence.source_url : "";
  const safeUrl = /^https?:\/\//i.test(url) ? url : "";
  if (!quote && !safeUrl) return null;
  return (
    <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2 space-y-1">
      {quote && (
        <p className="text-xs italic text-muted-foreground">
          „{quote.length > 240 ? quote.slice(0, 240) + " ..." : quote}"
        </p>
      )}
      {safeUrl && (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline break-all"
        >
          <Globe className="w-3 h-3 shrink-0" />
          {safeUrl}
        </a>
      )}
    </div>
  );
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

// Von der Website uebernommen, aber vom Kunden noch nicht angesehen.
// Seit dem 29.07. gelten Angaben ohne Rechtsfolge sofort. Damit daraus keine
// stille Behauptung wird, sagt die Karte offen, woher der Satz kommt und dass
// ihn noch niemand geprueft hat. Das Zitat steht ohnehin darunter.
function UngeprueftBadge() {
  return (
    <Badge variant="outline" className="gap-1 font-normal border-amber/40 text-muted-foreground">
      <Globe className="w-3 h-3" />
      Von Ihrer Website, noch nicht geprüft
    </Badge>
  );
}

// Eine Karte je Thema statt einer Zeile je Angabe (Paket 2, Weg A).
// Zugeklappt zeigt sie das Thema und die Anzahl, ein Klick auf "Stimmt so"
// nimmt die ganze Gruppe. Wer genauer hinsehen will, klappt auf und kann
// einzelne Angaben abwaehlen oder ablehnen.
function ThemenKarte({
  gruppe, offen, onToggle, abgewaehlt, onAbwahl,
  onGruppeBestaetigen, onEinzeln, editingId, setEditingId, busyId, gruppeBusy,
}: {
  gruppe: WissensGruppe;
  offen: boolean;
  onToggle: () => void;
  abgewaehlt: Set<number>;
  onAbwahl: (id: number, aus: boolean) => void;
  onGruppeBestaetigen: () => void;
  onEinzeln: (body: { id: number; action: "confirm" | "reject" | "update"; fact_text?: string }, okMsg: string) => void;
  editingId: number | null;
  setEditingId: (id: number | null) => void;
  busyId: number | null;
  gruppeBusy: boolean;
}) {
  const gewaehlt = auswahl(gruppe.facts, abgewaehlt).length;
  return (
    <div className="relative overflow-hidden rounded-[var(--radius)] border border-amber/25 bg-amber-surface/70 transition-colors hover:border-amber/45">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-amber/70" />
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 pl-5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={offen}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronDown className={"w-4 h-4 shrink-0 transition-transform " + (offen ? "rotate-180" : "")} />
          <span className="text-sm font-medium">{gruppe.label}</span>
          <span className="text-xs text-muted-foreground">
            {angabenZahl(gruppe.facts.length)} gefunden
          </span>
        </button>
        <Button size="sm" disabled={gewaehlt === 0 || gruppeBusy} onClick={onGruppeBestaetigen} className="shrink-0">
          {gruppeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Stimmt so{gewaehlt !== gruppe.facts.length ? " (" + gewaehlt + ")" : ""}
        </Button>
      </div>

      {offen && (
        <div className="border-t border-amber/20 divide-y divide-amber/15">
          {gruppe.facts.map((fact) => (
            <div key={fact.id} className="p-4 pl-5 space-y-2.5">
              {editingId === fact.id ? (
                <FactEditor
                  initial={fact.fact_text}
                  saving={busyId === fact.id}
                  saveLabel="Bestätigen"
                  onSave={(text) => onEinzeln({ id: fact.id, action: "confirm", fact_text: text }, "Übernommen.")}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={"fakt-" + fact.id}
                      checked={!abgewaehlt.has(fact.id)}
                      onCheckedChange={(v) => onAbwahl(fact.id, v !== true)}
                      className="mt-0.5 shrink-0"
                      aria-label={"Diese Angabe mit bestätigen: " + fact.fact_text}
                    />
                    <label htmlFor={"fakt-" + fact.id} className="text-sm cursor-pointer">
                      {fact.fact_text}
                    </label>
                  </div>
                  <WebsiteEvidence fact={fact} />
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingId(fact.id)}>
                      <Pencil className="w-3.5 h-3.5" />
                      Anpassen
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="text-muted-foreground"
                      disabled={busyId === fact.id}
                      onClick={() => onEinzeln({ id: fact.id, action: "reject" }, "Abgelehnt, Jana schlägt das nicht erneut vor.")}
                    >
                      <X className="w-3.5 h-3.5" />
                      Stimmt nicht
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
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
  // Baustein 5: welche Themen die Website belegt hat (fehlt der Block, aendert sich nichts).
  const { data: setup } = useTenantSetupSelf();
  const [wizardOpen, setWizardOpen] = useState(false);
  // Alles ist vorausgewaehlt; hier stehen nur die AUSNAHMEN (Leon-Entscheid:
  // Sammelklick mit Abwahl). Eine leere Menge heisst also "alles nehmen".
  const [abgewaehlt, setAbgewaehlt] = useState<Set<number>>(new Set());
  const [offeneKarten, setOffeneKarten] = useState<Set<string>>(new Set());
  const [sammelBusy, setSammelBusy] = useState<string | null>(null);

  const runPatch = (body: { id: number; action: "confirm" | "reject" | "update"; fact_text?: string }, okMsg: string) => {
    setBusyId(body.id);
    patchMutation.mutate(body, {
      onSuccess: () => { toast.success(okMsg); setEditingId(null); },
      onError: (e: Error) => toast.error(e.message || "Aktion fehlgeschlagen"),
      onSettled: () => setBusyId(null),
    });
  };

  const setzeAbwahl = (id: number, aus: boolean) => {
    setAbgewaehlt((alt) => {
      const neu = new Set(alt);
      if (aus) neu.add(id); else neu.delete(id);
      return neu;
    });
  };

  const toggleKarte = (key: string) => {
    setOffeneKarten((alt) => {
      const neu = new Set(alt);
      if (neu.has(key)) neu.delete(key); else neu.add(key);
      return neu;
    });
  };

  // Mehrere Angaben auf einmal bestaetigen.
  //
  // Bewusst ueber die bestehende Einzel-Route statt ueber einen neuen
  // Stapel-Endpunkt: nach der Klassen-Trennung sind es typisch rund vier bis
  // acht Angaben, und ein zweiter Lambda-Deploy waere dafuer zu teuer erkauft.
  // Hoechstens vier gleichzeitig, damit die Datenbank nicht unnoetig viele
  // Verbindungen auf einmal bekommt.
  //
  // Ein Teilerfolg wird als Teilerfolg gemeldet. Wer sechs von acht durchbekommt
  // und "alles uebernommen" liest, sucht die uebrigen zwei nie wieder.
  const bestaetigeViele = async (ids: number[], schluessel: string) => {
    if (!ids.length) return;
    setSammelBusy(schluessel);
    let ok = 0, fehler = 0;
    try {
      const rest = ids.slice();
      const arbeiter = Array.from({ length: Math.min(4, rest.length) }, async () => {
        for (;;) {
          const id = rest.shift();
          if (id === undefined) return;
          try { await patchMutation.mutateAsync({ id, action: "confirm" }); ok += 1; }
          catch { fehler += 1; }
        }
      });
      await Promise.all(arbeiter);
    } finally {
      setSammelBusy(null);
    }
    if (fehler === 0) toast.success(sammelMeldung(ok, fehler));
    else if (ok === 0) toast.error(sammelMeldung(ok, fehler));
    else toast.warning(sammelMeldung(ok, fehler));
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
          Dieses Wissen fließt in Janas Antwortentwürfe ein.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Angaben von eurer Website übernimmt Jana direkt, jede mit dem wörtlichen Zitat daneben
          und jederzeit änderbar. Was euch rechtlich bindet, also Widerruf, Lieferung, Zahlung und
          Rechtliches, wartet dagegen auf euren Klick. Was Jana aus euren Korrekturen lernt, ebenso.
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
        websiteCovered={setup?.website_scan?.categories_covered ?? null}
      />

      {/* 2026-07-29 (Frontend-Befund 3): die Karten sahen "cremig gelb-grau" aus.
          Ursache war keine Geschmacksfrage, sondern ein toter Klassenname:
          tailwind laeuft auf darkMode:["class"], die dunkle Palette liegt aber
          in :root und NIEMAND setzt die Klasse `dark` auf <html>. Damit griff
          `dark:bg-amber-950/20` nie, und `bg-amber-50/50` — ein helles Creme —
          lag halbtransparent ueber der dunklen Karte. Jetzt die echten Tokens
          (--amber / --amber-surface) plus ein schmaler Akzentstreifen links,
          damit die Vorschlaege als eigener Block lesbar sind statt als Fleck. */}
      {/* Paket 2, Weg A + Sammelklick (Leon-Entscheid 29.07.).
          Vorher stand hier jede Angabe als eigene Zeile: bei 25 Angaben waren
          das 25 Entscheidungen. Jetzt eine Karte je Thema (im Median 5 statt
          25), darueber ein Sammelklick, und in der Karte laesst sich einzeln
          abwaehlen. Die Hard Line bleibt: nichts gilt ohne einen Klick, der
          Klick ist nur nicht mehr fuenfundzwanzigmal derselbe. */}
      {proposed.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="flex-1 space-y-1">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber" />
                Bitte einmal ansehen ({proposed.length})
              </h3>
              <p className="text-xs text-muted-foreground">
                Diese Angaben binden euch rechtlich oder Jana hat sie aus eurem Postfach gelernt.
                Deshalb fragen wir hier nach. Aufklappen zeigt jede Angabe samt Beleg.
              </p>
            </div>
            <Button
              className="shrink-0"
              disabled={auswahl(proposed, abgewaehlt).length === 0 || sammelBusy !== null}
              onClick={() => bestaetigeViele(auswahl(proposed, abgewaehlt), "alle")}
            >
              {sammelBusy === "alle"
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ShieldCheck className="w-4 h-4" />}
              Passt alles ({auswahl(proposed, abgewaehlt).length})
            </Button>
          </div>

          {gruppiere(proposed).map((g) => (
            <ThemenKarte
              key={g.key}
              gruppe={g}
              offen={offeneKarten.has(g.key)}
              onToggle={() => toggleKarte(g.key)}
              abgewaehlt={abgewaehlt}
              onAbwahl={setzeAbwahl}
              gruppeBusy={sammelBusy === g.key}
              onGruppeBestaetigen={() => bestaetigeViele(auswahl(g.facts, abgewaehlt), g.key)}
              onEinzeln={runPatch}
              editingId={editingId}
              setEditingId={setEditingId}
              busyId={busyId}
            />
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
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={fact.category} />
                  {istUngeprueft(fact) && <UngeprueftBadge />}
                </div>
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
                  <WebsiteEvidence fact={fact} />
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
