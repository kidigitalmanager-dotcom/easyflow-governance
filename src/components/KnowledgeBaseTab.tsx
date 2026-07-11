import { useState, useRef } from "react";
import {
  useKnowledge,
  useKnowledgeUpload,
  useKnowledgeCrawl,
  useKnowledgeDelete,
  useKnowledgeSearch,
} from "@/hooks/use-api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Globe,
  FileText,
  FileSpreadsheet,
  Shield,
  Trash2,
  Upload,
  Link,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  Search,
  Sparkles,
} from "lucide-react";
import type { KnowledgeUpload } from "@/lib/api-client";
import { extractFileText, estimateChunks } from "@/lib/doc-extract";

// ── Helpers ──────────────────────────────────────────────

const SOURCE_TYPE_META: Record<
  string,
  { label: string; icon: typeof Globe; color: string }
> = {
  website: { label: "Website", icon: Globe, color: "text-blue-400" },
  document: { label: "Dokument", icon: FileText, color: "text-emerald-400" },
  legal: { label: "Rechtliches", icon: Shield, color: "text-amber-400" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "done")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle2 className="w-3 h-3" /> Fertig
      </span>
    );
  if (status === "processing")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Verarbeitung
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-400">
      <AlertTriangle className="w-3 h-3" /> Fehler
    </span>
  );
}

// Datei-Text-Extraktion (Text/PDF/Excel) lebt in @/lib/doc-extract
// (client-seitig; die Datei verlaesst den Browser nur als extrahierter Text).

// ── Component ────────────────────────────────────────────

export default function KnowledgeBaseTab() {
  const { data: kb, isLoading, error } = useKnowledge();
  const uploadMut = useKnowledgeUpload();
  const crawlMut = useKnowledgeCrawl();
  const deleteMut = useKnowledgeDelete();

  // ── Upload Form State ──
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadText, setUploadText] = useState("");
  const [uploadType, setUploadType] = useState<"document" | "legal">("document");
  const fileRef = useRef<HTMLInputElement>(null);
  // B3.1: Datei-Extraktion (PDF/Excel/Text) im Browser
  const [extracting, setExtracting] = useState(false);
  const [extractInfo, setExtractInfo] = useState<{ kind: string; chars: number; chunks: number; warnings: string[] } | null>(null);

  // ── Crawl Form State ──
  const [showCrawlForm, setShowCrawlForm] = useState(false);
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlMaxPages, setCrawlMaxPages] = useState("3");

  // ── Delete Confirm ──
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Wissens-Suche (B5) ──
  const [searchInput, setSearchInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const knowledgeSearch = useKnowledgeSearch(submittedQuery.trim().length > 1, submittedQuery);

  const uploads: KnowledgeUpload[] = kb?.uploads ?? [];
  const totalChunks = kb?.total_chunks ?? 0;
  const totalChars = kb?.total_chars ?? 0;

  // ── Handlers ──

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    setExtractInfo(null);
    try {
      const res = await extractFileText(file);
      setUploadText(res.text);
      if (!uploadTitle.trim()) setUploadTitle(file.name.replace(/\.[^.]+$/, ""));
      // Rechtliche Dokumente automatisch als "legal" vorschlagen bleibt dem Nutzer ueberlassen.
      setExtractInfo({ kind: res.kind, chars: res.chars, chunks: estimateChunks(res.chars), warnings: res.warnings });
    } catch (err) {
      setUploadText("");
      setExtractInfo({ kind: "text", chars: 0, chunks: 0, warnings: [(err as Error).message || "Die Datei konnte nicht gelesen werden."] });
    } finally {
      setExtracting(false);
    }
  }

  async function handleUpload() {
    if (!uploadTitle.trim() || !uploadText.trim()) return;
    try {
      await uploadMut.mutateAsync({
        source_type: uploadType,
        title: uploadTitle.trim(),
        content_text: uploadText.trim(),
      });
      setUploadTitle("");
      setUploadText("");
      setExtractInfo(null);
      setShowUploadForm(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      // error is in uploadMut.error
    }
  }

  async function handleCrawl() {
    const url = crawlUrl.trim();
    if (!url) return;
    try {
      await crawlMut.mutateAsync({
        source_url: url,
        max_pages: Math.min(Math.max(parseInt(crawlMaxPages) || 1, 1), 10),
      });
      setCrawlUrl("");
      setShowCrawlForm(false);
    } catch {
      // error is in crawlMut.error
    }
  }

  async function handleDelete(uploadId: string) {
    try {
      await deleteMut.mutateAsync(uploadId);
      setDeleteConfirm(null);
    } catch {
      // error is in deleteMut.error
    }
  }

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Header + Stats */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">Unternehmenswissen</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {totalChunks} Chunks · {Math.round(totalChars / 1000)}k Zeichen
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Lade Dokumente, AGBs oder Website-Inhalte hoch, damit UseEasy dein Unternehmen
          versteht und bessere Antwort-Entwürfe erstellt.
        </p>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowUploadForm(!showUploadForm);
              setShowCrawlForm(false);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Datei hochladen
          </button>
          <button
            onClick={() => {
              setShowCrawlForm(!showCrawlForm);
              setShowUploadForm(false);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors border border-border"
          >
            <Link className="w-3.5 h-3.5" /> Website importieren
          </button>
        </div>
      </div>

      {/* Wissens-Suche (B5): semantisch + zitat-treu ueber die eigene Wissensbasis */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Was weiß Jana über …?</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Durchsucht deine hochgeladenen Dokumente semantisch. Jeder Treffer nennt
          seine Quelle (Dokument und Abschnitt), damit du jede Aussage nachprüfen kannst.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmittedQuery(searchInput);
          }}
        >
          <input
            type="text"
            placeholder='z.B. "Wie lange ist die Widerrufsfrist?" oder "Ruhezeiten im Haus"'
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1 bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50"
          />
          <button
            type="submit"
            disabled={searchInput.trim().length < 2 || knowledgeSearch.isFetching}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {knowledgeSearch.isFetching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            Suchen
          </button>
        </form>

        {knowledgeSearch.error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Suche fehlgeschlagen, bitte später erneut versuchen.
          </div>
        )}

        {knowledgeSearch.data && knowledgeSearch.data.results.length === 0 && (
          <div className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-md px-3 py-2">
            {knowledgeSearch.data.reason === "no_documents" &&
              "Noch keine Dokumente in der Wissensbasis. Lade unten ein Dokument hoch oder importiere deine Website, dann kann Jana daraus antworten."}
            {knowledgeSearch.data.reason === "not_embedded_yet" &&
              "Deine Dokumente sind gespeichert, die semantische Indexierung läuft im nächtlichen Lauf. Danach ist die Suche aktiv."}
            {knowledgeSearch.data.reason === "migration_missing" &&
              "Die semantische Suche ist für dieses System noch nicht freigeschaltet."}
            {(knowledgeSearch.data.reason === "no_relevant_match" || !knowledgeSearch.data.reason) &&
              "Dazu steht nichts in deinen Dokumenten. Jana behauptet nur, was belegt ist."}
          </div>
        )}

        {knowledgeSearch.data && knowledgeSearch.data.results.length > 0 && (
          <div className="space-y-2">
            {knowledgeSearch.data.results.map((r) => {
              const meta = SOURCE_TYPE_META[r.source_type] ?? SOURCE_TYPE_META.document;
              return (
                <div key={r.id} className="bg-muted/30 border border-border rounded-md px-3 py-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.color}`}>
                      <meta.icon className="w-3 h-3" />
                      Quelle: {r.source_label}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      Relevanz {Math.round(r.score * 100)} %
                    </span>
                  </div>
                  <p className="text-xs text-foreground/90 whitespace-pre-wrap line-clamp-4">{r.text}</p>
                  {r.source_url && (
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-primary hover:underline break-all"
                    >
                      {r.source_url}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload Form */}
      {showUploadForm && (
        <div className="glass-card p-6 space-y-4 border-l-2 border-primary">
          <h3 className="text-sm font-semibold">Dokument hochladen</h3>

          {/* Source Type */}
          <div className="flex gap-2">
            {(["document", "legal"] as const).map((t) => {
              const meta = SOURCE_TYPE_META[t];
              return (
                <button
                  key={t}
                  onClick={() => setUploadType(t)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    uploadType === t
                      ? "bg-primary/20 text-primary border border-primary/40"
                      : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                  }`}
                >
                  <meta.icon className="w-3 h-3" />
                  {meta.label}
                </button>
              );
            })}
          </div>

          {/* Title */}
          <input
            type="text"
            placeholder="Titel (z.B. Stornobedingungen, AGB, FAQ)"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50"
          />

          {/* File or Textarea */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.csv,.pdf,.xlsx,.xlsm,.xls"
                onChange={handleFileSelect}
                disabled={extracting}
                className="block text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80 disabled:opacity-50"
              />
              {extracting && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> Text wird gelesen …
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3 h-3 shrink-0" />
              Unterstützt: Text, PDF und Excel. Die Datei bleibt im Browser, es wird nur der Text übernommen.
            </p>

            {/* Extraktions-Ergebnis: Umfang + Hinweise (Scan-PDF, Excel-Live-Sync-Abgrenzung) */}
            {extractInfo && (
              <div className="space-y-1.5">
                {extractInfo.chars > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {extractInfo.kind === "pdf" ? "PDF" : extractInfo.kind === "excel" ? "Excel" : "Text"} gelesen:{" "}
                    {extractInfo.chars.toLocaleString("de-DE")} Zeichen · ca. {extractInfo.chunks} Abschnitt{extractInfo.chunks === 1 ? "" : "e"}.
                  </p>
                )}
                {extractInfo.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
            <textarea
              rows={6}
              placeholder="Oder füge den Text hier direkt ein…"
              value={uploadText}
              onChange={(e) => setUploadText(e.target.value)}
              className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 resize-y"
            />
          </div>

          {/* Upload Error */}
          {uploadMut.error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {(uploadMut.error as Error).message || "Upload fehlgeschlagen"}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowUploadForm(false)}
              className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleUpload}
              disabled={uploadMut.isPending || !uploadTitle.trim() || !uploadText.trim()}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Hochladen
            </button>
          </div>
        </div>
      )}

      {/* Crawl Form */}
      {showCrawlForm && (
        <div className="glass-card p-6 space-y-4 border-l-2 border-blue-400">
          <h3 className="text-sm font-semibold">Website importieren</h3>
          <p className="text-xs text-muted-foreground">
            UseEasy lädt die Seite und bis zu {crawlMaxPages} verlinkte Unterseiten herunter.
          </p>

          <input
            type="url"
            placeholder="https://example.com/faq"
            value={crawlUrl}
            onChange={(e) => setCrawlUrl(e.target.value)}
            className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50"
          />

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Max. Seiten:</label>
            <input
              type="number"
              min={1}
              max={10}
              value={crawlMaxPages}
              onChange={(e) => setCrawlMaxPages(e.target.value)}
              className="w-16 bg-muted/50 border border-border rounded-md px-2 py-1.5 text-sm text-foreground"
            />
          </div>

          {/* Crawl Error */}
          {crawlMut.error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {(crawlMut.error as Error).message || "Crawl fehlgeschlagen"}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowCrawlForm(false)}
              className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleCrawl}
              disabled={crawlMut.isPending || !crawlUrl.trim()}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {crawlMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Importieren
            </button>
          </div>
        </div>
      )}

      {/* Uploads List */}
      <div className="glass-card p-6 space-y-4">
        <h3 className="text-sm font-semibold">Hochgeladene Inhalte</h3>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Fehler beim Laden: {(error as Error).message}
          </div>
        ) : uploads.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <BookOpen className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Noch kein Unternehmenswissen hinterlegt
            </p>
            <p className="text-xs text-muted-foreground/70">
              Lade Dokumente oder Website-Inhalte hoch, damit UseEasy kontextbezogene
              Antwort-Entwürfe erstellen kann.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {uploads.map((u) => {
              const meta = SOURCE_TYPE_META[u.source_type] ?? SOURCE_TYPE_META.document;
              const Icon = meta.icon;
              const isDeleting = deleteConfirm === u.upload_id;

              return (
                <div
                  key={u.upload_id}
                  className="flex items-center justify-between py-3 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${meta.color}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.title || u.source_url || u.upload_id}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{meta.label}</span>
                        <span>·</span>
                        <span>{u.chunks_created} Chunks</span>
                        <span>·</span>
                        <StatusBadge status={u.status} />
                        {u.source_url && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[200px]">{u.source_url}</span>
                          </>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {formatDate(u.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 ml-3">
                    {isDeleting ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(u.upload_id)}
                          disabled={deleteMut.isPending}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
                        >
                          {deleteMut.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            "Ja, löschen"
                          )}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground"
                        >
                          Nein
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(u.upload_id)}
                        className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        title="Löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Delete Error */}
        {deleteMut.error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Löschen fehlgeschlagen: {(deleteMut.error as Error).message}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="glass-card p-4 space-y-2 border-l-2 border-muted-foreground/20">
        <p className="text-xs text-muted-foreground">
          <strong>Wie funktioniert es?</strong> UseEasy nutzt dein Unternehmenswissen automatisch
          beim Erstellen von Antwort-Entwürfen. Rechtliche Inhalte (AGB, Storno, Datenschutz)
          werden priorisiert. Maximal ~1.000 Tokens werden pro E-Mail als Kontext geladen.
        </p>
        <p className="text-xs text-muted-foreground/70">
          Tipp: Lade zuerst deine wichtigsten rechtlichen Dokumente hoch (AGB, Stornobedingungen),
          dann allgemeine FAQ oder Website-Inhalte.
        </p>
      </div>
    </div>
  );
}
