// -----------------------------------------------------------------------------
// CoPilotScriptsTab.tsx — Skripte und Einwaende fuer die Co-Piloten (v4.192.0)
//
// Warum es das gibt: Skripte lagen bisher NUR im Cockpit des jeweiligen
// Vertrieblers (governance.copilot_rep_config). Der Betreiber konnte weder
// zentral etwas ausspielen noch sehen, womit seine Leute tatsaechlich
// telefonieren. Diese Seite macht beides sichtbar und steuerbar.
//
// Zwei Bereiche:
//   1. Deine Bibliothek  — JSON oder PDF hochladen, benennen, zuweisen.
//   2. Bei den Vertrieblern — was jeder wirklich geladen hat, inklusive der
//      Skripte, die er SELBST im Cockpit angelegt hat (Badge "selbst angelegt").
//
// PDF-Weg: Text wird im Browser aus der Datei geholt (doc-extract/pdfjs, kein
// Upload der Datei), das Backend laesst daraus Phasen bauen, und erst nach
// einer Vorschau wandert das Ergebnis in die Bibliothek. Nichts wird still
// gespeichert.
//
// Wichtig fuer die Bedienung: Ein Cockpit, das gerade OFFEN ist, schreibt beim
// naechsten Klick seinen eigenen Stand zurueck. Deshalb der Hinweis nach dem
// Zuweisen, dass der Vertriebler den Tab neu laden muss.
// -----------------------------------------------------------------------------
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchScriptLibrary, saveScriptLibrary, fetchScriptOverview, assignScripts, parseScriptText,
  type LibraryScript, type LibraryObjectionSet, type ScriptPhase,
  type ScriptOverviewRep,
} from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import { extractFileText } from "@/lib/doc-extract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Upload, FileJson, FileText, Trash2, Pencil, Download, Users, Loader2,
  CheckCircle2, AlertTriangle, Link2Off, MessageSquareWarning, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

type Kind = "script" | "objections";

const LIB_KEY = ["copilot", "script-library"] as const;
const OVERVIEW_KEY = ["copilot", "script-overview"] as const;

function Badge({ tone, children }: { tone: "lib" | "own" | "active" | "warn"; children: ReactNode }) {
  const cls = {
    lib: "text-primary bg-primary/10 border-primary/20",
    own: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    active: "text-green-500 bg-green-500/10 border-green-500/20",
    warn: "text-destructive bg-destructive/10 border-destructive/20",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded-full border ${cls}`}>
      {children}
    </span>
  );
}

/**
 * Langes Dokument in Abschnitte schneiden.
 *
 * 🔴 Warum: leads-sync hat 30 s Lambda-Timeout und das API-Gateway schneidet dort
 * ebenfalls ab. Ein einzelner Aufruf ueber ein 11-Seiten-PDF lief am 05.08. genau
 * hinein — im Browser kam ein nackter 503 an. Zwei kurze Aufrufe sind schneller
 * als einer langer und liefern eine benennbare Fehlerursache.
 * Geschnitten wird an Absatzgrenzen, damit keine Phase mittendrin zerreisst.
 */
const PARSE_CHUNK_CHARS = 5000;
const PARSE_MIN_CHARS = 1200;
function splitForParse(text: string): string[] {
  const t = text.trim();
  if (t.length <= PARSE_CHUNK_CHARS) return [t];
  const paras = t.split(/\n\s*\n/);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && (cur.length + p.length + 2) > PARSE_CHUNK_CHARS) { out.push(cur); cur = p; }
    else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur.trim()) out.push(cur);
  return out.length ? out : [t.slice(0, PARSE_CHUNK_CHARS)];
}

/**
 * Ein Abschnitt kann trotz passender Laenge in den Abbruch laufen: die Dauer haengt
 * an der AUSGABE, und dichte Dialogseiten erzeugen viel mehr Ausgabe als eine Tabelle.
 * Gemessen 05.08.: drei gleich grosse Abschnitte, einer in 14 s durch, zwei im Abbruch.
 * Deshalb halbieren wir einen abgebrochenen Abschnitt und versuchen es erneut, bis
 * PARSE_MIN_CHARS erreicht ist. Erst dann ist es ein echter Fehler.
 */
async function parseAdaptive(
  chunk: string, name: string, onNote: (s: string) => void,
): Promise<ScriptPhase[]> {
  try {
    const r = await parseScriptText(chunk, name, 0, 1);
    return r.phases ?? [];
  } catch (e) {
    const timedOut = e instanceof ApiError && (e.message === "ai_timeout" || e.status === 504);
    if (!timedOut || chunk.length <= PARSE_MIN_CHARS) throw e;
    onNote("Abschnitt war zu dicht, wird feiner geteilt…");
    const mid = chunk.lastIndexOf("\n\n", Math.floor(chunk.length / 2)) + 2 || Math.floor(chunk.length / 2);
    const a = chunk.slice(0, mid);
    const b = chunk.slice(mid);
    const left = await parseAdaptive(a, name, onNote);
    const right = await parseAdaptive(b, name, onNote);
    return [...left, ...right];
  }
}

/** Erkennt, ob eine hochgeladene JSON-Datei ein Skript oder ein Einwand-Satz ist. */
function sniffKind(rows: unknown): Kind | null {
  if (!Array.isArray(rows) || !rows.length) return null;
  const first = rows[0] as Record<string, unknown>;
  if (!first || typeof first !== "object") return null;
  if ("response" in first || "hotkey" in first) return "objections";
  if ("text" in first || "goal" in first || "next" in first) return "script";
  return null;
}

export default function CoPilotScriptsTab() {
  const qc = useQueryClient();
  const libQ = useQuery({ queryKey: LIB_KEY, queryFn: fetchScriptLibrary, retry: false });
  const ovQ = useQuery({ queryKey: OVERVIEW_KEY, queryFn: fetchScriptOverview, retry: false });

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string>("");
  const [renameTarget, setRenameTarget] = useState<{ kind: Kind; id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: Kind; id: string; name: string } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignScriptIds, setAssignScriptIds] = useState<string[]>([]);
  const [assignObjIds, setAssignObjIds] = useState<string[]>([]);
  const [assignReps, setAssignReps] = useState<string[]>([]);
  const [activate, setActivate] = useState(false);
  const [preview, setPreview] = useState<{ name: string; phases: ScriptPhase[]; file: string } | null>(null);

  const saveMut = useMutation({
    mutationFn: saveScriptLibrary,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: LIB_KEY }); void qc.invalidateQueries({ queryKey: OVERVIEW_KEY }); },
  });
  const assignMut = useMutation({ mutationFn: assignScripts });

  const notConnected =
    libQ.error instanceof ApiError &&
    ["no_copilot_tenant_for_email", "console_auth_not_configured", "tenant_inactive", "no_session", "invalid_or_expired_session"].includes(libQ.error.message);

  const scripts = libQ.data?.scripts.library ?? [];
  const objSets = libQ.data?.objections.library ?? [];
  const reps = ovQ.data?.reps ?? [];

  // Wie oft ist ein Bibliotheks-Eintrag bei Vertrieblern im Einsatz?
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    reps.forEach((r) => {
      r.scripts.forEach((s) => { if (s.from_library) m.set(s.id, (m.get(s.id) ?? 0) + 1); });
      r.objections.forEach((o) => { if (o.from_library) m.set(o.id, (m.get(o.id) ?? 0) + 1); });
    });
    return m;
  }, [reps]);

  // ── Upload ────────────────────────────────────────────────────────────────
  const onPickFile = async (file: File | null) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith(".json")) {
        setBusy("Datei wird gelesen…");
        const raw = JSON.parse(await file.text());
        const rows = Array.isArray(raw) ? raw : (raw.phases ?? raw.objections ?? raw.library ?? null);
        const kind = sniffKind(rows);
        if (!kind) throw new Error("Die Datei sieht weder nach Skript-Phasen noch nach Einwänden aus.");
        const name = file.name.replace(/\.json$/i, "");
        if (kind === "script") {
          await saveMut.mutateAsync({ add_script: { name, phases: rows, source_file: file.name } });
          toast.success(`Skript „${name}" in die Bibliothek gelegt.`);
        } else {
          await saveMut.mutateAsync({ add_objections: { name, objections: rows, source_file: file.name } });
          toast.success(`Einwand-Satz „${name}" in die Bibliothek gelegt.`);
        }
      } else if (lower.endsWith(".pdf")) {
        setBusy("PDF wird gelesen…");
        const ex = await extractFileText(file);
        if (!ex.text || ex.text.trim().length < 200) {
          throw new Error("Aus dem PDF kam kaum Text. Ist es ein Scan? Dann bitte als JSON hochladen.");
        }
        const chunks = splitForParse(ex.text);
        const baseName = file.name.replace(/\.pdf$/i, "");
        const collected: ScriptPhase[] = [];
        for (let i = 0; i < chunks.length; i++) {
          setBusy(chunks.length > 1
            ? `KI zerlegt Abschnitt ${i + 1} von ${chunks.length}…`
            : "KI zerlegt das Skript in Phasen…");
          const got = await parseAdaptive(chunks[i], baseName, (note) =>
            setBusy(`Abschnitt ${i + 1} von ${chunks.length}: ${note}`));
          collected.push(...got);
        }
        if (!collected.length) throw new Error("Es kamen keine Phasen zurück.");
        // IDs ueber alle Abschnitte hinweg eindeutig halten.
        const phases = collected.map((p, i) => ({ ...p, id: `phase_${i}` }));
        setPreview({ name: baseName, phases, file: file.name });
      } else {
        throw new Error("Bitte eine .json- oder .pdf-Datei wählen.");
      }
    } catch (e) {
      const msg = e instanceof ApiError
        ? (e.message === "ai_timeout" ? "Die Umwandlung hat zu lange gedauert. Versuch es nochmal — oder lade das Skript als JSON hoch."
          : e.message === "ai_unavailable" ? "Die KI-Umwandlung ist gerade nicht erreichbar. Du kannst das Skript als JSON hochladen."
          : e.message === "parse_failed" ? "Aus dem PDF ließen sich keine Phasen bilden. Bitte als JSON hochladen."
          : e.message)
        : (e instanceof Error ? e.message : "Unbekannter Fehler");
      toast.error(msg);
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const savePreview = async () => {
    if (!preview) return;
    await saveMut.mutateAsync({
      add_script: { name: preview.name, phases: preview.phases, source: "pdf_import", source_file: preview.file },
    });
    toast.success(`Skript „${preview.name}" gespeichert.`);
    setPreview(null);
  };

  const download = (kind: Kind, entry: LibraryScript | LibraryObjectionSet) => {
    const payload = kind === "script" ? (entry as LibraryScript).phases : (entry as LibraryObjectionSet).objections;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${entry.name.replace(/[^\w\-]+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openAssign = (kind: Kind, id: string) => {
    setAssignScriptIds(kind === "script" ? [id] : []);
    setAssignObjIds(kind === "objections" ? [id] : []);
    setAssignReps([]);
    setActivate(false);
    setAssignOpen(true);
  };

  const doAssign = async () => {
    if (!assignReps.length) { toast.error("Bitte mindestens einen Vertriebler wählen."); return; }
    try {
      const res = await assignMut.mutateAsync({
        rep_ids: assignReps,
        script_ids: assignScriptIds,
        objection_ids: assignObjIds,
        activate,
      });
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length) toast.error(`${failed.length} Zuweisung(en) fehlgeschlagen.`);
      else if (activate) toast.success(`Zugewiesen und aktiv gesetzt bei ${res.results.length} Vertriebler(n). Wer sein Cockpit gerade offen hat, muss die Seite neu laden.`);
      else toast.success(`Zur Auswahl von ${res.results.length} Vertriebler(n) hinzugefügt.`);
      setAssignOpen(false);
      void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zuweisen fehlgeschlagen");
    }
  };

  // ── Zustaende ─────────────────────────────────────────────────────────────
  if (libQ.isLoading || ovQ.isLoading) {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-32 w-full" /></div>;
  }
  if (notConnected) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
        <Link2Off className="w-8 h-8 mx-auto text-muted-foreground" />
        <h3 className="font-semibold">Kein Co-Pilot-Workspace verknüpft</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Skripte hängen am Co-Pilot-Workspace. Sobald deine Login-E-Mail damit verknüpft ist, erscheint hier die Bibliothek.
        </p>
      </div>
    );
  }
  if (libQ.error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        Fehler beim Laden: {libQ.error instanceof Error ? libQ.error.message : "Unbekannt"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Bibliothek ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 p-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-[14px]">Deine Bibliothek</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5 max-w-xl">
              Skripte und Einwand-Sätze, die du zentral pflegst. Eine Datei einmal hochladen, dann per Häkchen an
              mehrere Vertriebler geben. JSON wird direkt übernommen, aus einem PDF baut die KI die Phasen und
              zeigt sie dir vor dem Speichern.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".json,.pdf"
              className="hidden"
              onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
            />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
              {busy || "Skript oder Einwände hochladen"}
            </Button>
          </div>
        </div>

        {!scripts.length && !objSets.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Noch nichts in der Bibliothek. Lade eine JSON-Datei mit Phasen oder ein Skript-PDF hoch.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {scripts.map((s) => (
              <LibraryRow
                key={s.id}
                icon={<FileJson className="w-4 h-4 text-primary shrink-0" />}
                title={s.name}
                sub={`${s.phases.length} Phasen${s.meta?.source === "pdf_import" ? " · aus PDF" : ""}${s.meta?.source_file ? ` · ${s.meta.source_file}` : ""}`}
                usedBy={usage.get(s.id) ?? 0}
                onAssign={() => openAssign("script", s.id)}
                onRename={() => setRenameTarget({ kind: "script", id: s.id, name: s.name })}
                onDelete={() => setDeleteTarget({ kind: "script", id: s.id, name: s.name })}
                onDownload={() => download("script", s)}
              />
            ))}
            {objSets.map((o) => (
              <LibraryRow
                key={o.id}
                icon={<MessageSquareWarning className="w-4 h-4 text-amber-500 shrink-0" />}
                title={o.name}
                sub={`${o.objections.length} Einwände${o.script_id ? " · an ein Skript gebunden" : ""}`}
                usedBy={usage.get(o.id) ?? 0}
                onAssign={() => openAssign("objections", o.id)}
                onRename={() => setRenameTarget({ kind: "objections", id: o.id, name: o.name })}
                onDelete={() => setDeleteTarget({ kind: "objections", id: o.id, name: o.name })}
                onDownload={() => download("objections", o)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Bei den Vertrieblern ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-[14px]">Bei den Vertrieblern</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5 max-w-xl">
            Was jeder Co-Pilot wirklich geladen hat. Was der Vertriebler selbst im Cockpit angelegt hat, ist als
            „selbst angelegt" markiert — genau das siehst du sonst nirgends.
          </p>
        </div>
        {ovQ.error ? (
          <div className="p-4 text-sm text-destructive">Übersicht nicht abrufbar.</div>
        ) : !reps.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Noch keine Vertriebler angelegt.</div>
        ) : (
          <div className="divide-y divide-border">
            {reps.map((rep) => <RepBlock key={rep.client_id} rep={rep} />)}
          </div>
        )}
      </section>

      {/* ── PDF-Vorschau ─────────────────────────────────────────────────── */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Aus dem PDF gebaut
            </DialogTitle>
            <DialogDescription>
              Prüf die Phasen, bevor sie in die Bibliothek gehen. Der Sprechtext sollte wörtlich aus deinem PDF stammen.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pv-name">Name</Label>
                <Input id="pv-name" value={preview.name} onChange={(e) => setPreview({ ...preview, name: e.target.value })} />
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {preview.phases.map((p, i) => (
                  <div key={p.id || i} className="p-3">
                    <p className="text-[12px] font-semibold text-foreground">{i}. {p.label}</p>
                    <p className="text-[12px] text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4">{p.text}</p>
                    {p.goal && <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-2">Regie: {p.goal}</p>}
                  </div>
                ))}
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                {preview.phases.length} Phasen. Feinschliff geht danach im Cockpit-Skript-Editor.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Verwerfen</Button>
            <Button onClick={() => void savePreview()} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              In die Bibliothek
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Zuweisen ─────────────────────────────────────────────────────── */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>An Vertriebler geben</DialogTitle>
            <DialogDescription>
              Der Eintrag landet in der Auswahl des Co-Piloten. Bestehende Skripte des Vertrieblers bleiben erhalten.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {reps.map((r) => (
                <label key={r.client_id} className="flex items-center gap-2.5 p-2.5 cursor-pointer hover:bg-muted/40">
                  <Checkbox
                    checked={assignReps.includes(r.client_id)}
                    onCheckedChange={(c) =>
                      setAssignReps((prev) => (c ? [...prev, r.client_id] : prev.filter((x) => x !== r.client_id)))
                    }
                  />
                  <span className="text-[13px]">{r.display_name}</span>
                  <span className="text-[11px] text-muted-foreground ml-auto font-mono">{r.client_id}</span>
                </label>
              ))}
            </div>
            <label className="flex items-start gap-2.5 rounded-lg border border-border p-3 cursor-pointer">
              <Checkbox checked={activate} onCheckedChange={(c) => setActivate(!!c)} className="mt-0.5" />
              <span className="text-[12.5px]">
                <span className="font-medium">Sofort als aktives Skript setzen</span>
                <span className="block text-muted-foreground mt-0.5">
                  Ohne Häkchen taucht es nur in der Auswahl auf und der Vertriebler schaltet selbst um. Mit Häkchen
                  telefoniert er ab dem nächsten Laden damit — ein offenes Cockpit muss dafür neu geladen werden.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Abbrechen</Button>
            <Button onClick={() => void doAssign()} disabled={assignMut.isPending}>
              {assignMut.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              <Users className="w-4 h-4 mr-1.5" /> Zuweisen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Umbenennen ───────────────────────────────────────────────────── */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => { if (!o) setRenameTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Umbenennen</DialogTitle></DialogHeader>
          {renameTarget && (
            <Input
              value={renameTarget.name}
              onChange={(e) => setRenameTarget({ ...renameTarget, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") void doRename(); }}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Abbrechen</Button>
            <Button onClick={() => void doRename()} disabled={saveMut.isPending}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Loeschen ─────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>„{deleteTarget?.name}" aus der Bibliothek löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Nur aus deiner Bibliothek. Vertriebler, die den Eintrag schon haben, behalten ihn — sonst würde
              jemand mitten im Telefonieren sein Skript verlieren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doDelete()}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  async function doRename() {
    if (!renameTarget || !renameTarget.name.trim()) return;
    await saveMut.mutateAsync({ rename: { kind: renameTarget.kind, id: renameTarget.id, name: renameTarget.name.trim() } });
    toast.success("Umbenannt.");
    setRenameTarget(null);
  }
  async function doDelete() {
    if (!deleteTarget) return;
    await saveMut.mutateAsync(
      deleteTarget.kind === "script"
        ? { delete_script_id: deleteTarget.id }
        : { delete_objection_id: deleteTarget.id },
    );
    toast.success("Aus der Bibliothek entfernt.");
    setDeleteTarget(null);
  }
}

// ── Bausteine ───────────────────────────────────────────────────────────────

function LibraryRow(props: {
  icon: ReactNode; title: string; sub: string; usedBy: number;
  onAssign: () => void; onRename: () => void; onDelete: () => void; onDownload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-3.5">
      {props.icon}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium truncate">{props.title}</p>
        <p className="text-[11.5px] text-muted-foreground truncate">{props.sub}</p>
      </div>
      <span className="text-[11.5px] text-muted-foreground">
        {props.usedBy > 0 ? `bei ${props.usedBy} Vertriebler${props.usedBy === 1 ? "" : "n"}` : "noch nicht zugewiesen"}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={props.onAssign}>
          <Users className="w-3.5 h-3.5 mr-1" /> Zuweisen
        </Button>
        <Button size="icon" variant="ghost" onClick={props.onDownload} title="Als JSON herunterladen">
          <Download className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={props.onRename} title="Umbenennen">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={props.onDelete} title="Löschen">
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function RepBlock({ rep }: { rep: ScriptOverviewRep }) {
  const own = rep.scripts.filter((s) => !s.from_library).length;
  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-medium">{rep.display_name}</p>
        <span className="text-[11px] text-muted-foreground font-mono">{rep.client_id}</span>
        {own > 0 && <Badge tone="own">{own} selbst angelegt</Badge>}
        {!rep.has_config && <span className="text-[11.5px] text-muted-foreground">— noch nichts geladen</span>}
      </div>

      {rep.scripts.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rep.scripts.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 text-[12px]">
              <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium">{s.name}</span>
              <span className="text-muted-foreground">{s.phases} Phasen</span>
              {s.id === rep.active_script_id && <Badge tone="active"><CheckCircle2 className="w-3 h-3" /> aktiv</Badge>}
              {s.from_library ? <Badge tone="lib">aus deiner Bibliothek</Badge> : <Badge tone="own">selbst angelegt</Badge>}
              {s.empty_phases > 0 && (
                <Badge tone="warn"><AlertTriangle className="w-3 h-3" /> {s.empty_phases} leere Phase{s.empty_phases === 1 ? "" : "n"}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      {rep.objections.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rep.objections.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 text-[12px]">
              <MessageSquareWarning className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium">{o.name}</span>
              <span className="text-muted-foreground">{o.count} Einwände</span>
              {o.id === rep.active_objection_id && <Badge tone="active"><CheckCircle2 className="w-3 h-3" /> aktiv</Badge>}
              {o.from_library ? <Badge tone="lib">aus deiner Bibliothek</Badge> : <Badge tone="own">selbst angelegt</Badge>}
            </li>
          ))}
        </ul>
      )}

      {rep.updated_at && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          zuletzt geändert {new Date(rep.updated_at).toLocaleString("de-DE")}
          {rep.updated_by ? ` von ${rep.updated_by}` : ""}
        </p>
      )}
    </div>
  );
}
