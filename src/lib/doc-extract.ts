// ---------------------------------------------------------------------------
// B3.1 Dokument-Import: Text-Extraktion im BROWSER (PDF + Excel + Text).
//
// Der extrahierte Text geht ueber den bestehenden Endpoint /v1/knowledge/upload
// in die Wissensbasis. Die Datei selbst verlaesst den Browser NIE, nur der
// reine Text (DSGVO-schlank). PDF via pdfjs-dist, Excel via SheetJS/xlsx
// (Sheets -> Markdown-Tabellen). Beide werden dynamisch geladen (Code-Splitting),
// damit die Haupt-App schlank bleibt.
// ---------------------------------------------------------------------------

export type ExtractKind = "text" | "pdf" | "excel";

export interface ExtractResult {
  text: string;
  warnings: string[];
  kind: ExtractKind;
  pages?: number;
  sheets?: number;
  chars: number;
}

export const MAX_EXTRACT_CHARS = 100_000;
export const CHUNK_SIZE = 2000; // Backend chunkt content_text in ~2000er-Bloecke.

const TEXT_RE = /\.(txt|md|csv|json)$/i;
const PDF_RE = /\.pdf$/i;
const XLS_RE = /\.(xlsx|xlsm|xls)$/i;

export function isSupportedFile(name: string): boolean {
  return TEXT_RE.test(name) || PDF_RE.test(name) || XLS_RE.test(name);
}

export function estimateChunks(chars: number): number {
  return Math.max(1, Math.ceil(chars / CHUNK_SIZE));
}

function finalize(kind: ExtractKind, rawText: string, warnings: string[], extra: Partial<ExtractResult> = {}): ExtractResult {
  let t = String(rawText || "").replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  const w = [...warnings];
  if (t.length > MAX_EXTRACT_CHARS) {
    t = t.slice(0, MAX_EXTRACT_CHARS).trim();
    w.push(`Der Text wurde auf ${MAX_EXTRACT_CHARS.toLocaleString("de-DE")} Zeichen gekürzt.`);
  }
  return { text: t, warnings: w, kind, chars: t.length, ...extra };
}

export async function extractFileText(file: File): Promise<ExtractResult> {
  const name = file.name || "";
  if (TEXT_RE.test(name)) {
    return finalize("text", await file.text(), []);
  }
  if (PDF_RE.test(name)) {
    return extractPdf(file);
  }
  if (XLS_RE.test(name)) {
    return extractExcel(file);
  }
  // Unbekannter Typ: bestmoeglich als Text lesen.
  return finalize("text", await file.text(), ["Unbekannter Dateityp, als reiner Text eingelesen."]);
}

// ── PDF (pdfjs-dist) ────────────────────────────────────────────────────────

async function extractPdf(file: File): Promise<ExtractResult> {
  const pdfjs = await import("pdfjs-dist");
  // Worker als gebuendeltes Asset (Vite ?url). Fehlerhafte Worker-Ladung faellt
  // in pdfjs auf den Haupt-Thread zurueck, wir fangen echte Fehler unten ab.
  try {
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    /* Worker-URL nicht aufloesbar -> pdfjs nutzt einen Fake-Worker (Haupt-Thread). */
  }

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  let joinedLen = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => (typeof (it as { str?: unknown }).str === "string" ? (it as { str: string }).str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) {
      parts.push(line);
      joinedLen += line.length + 2;
    }
    if (joinedLen > MAX_EXTRACT_CHARS) break;
  }
  const text = parts.join("\n\n");
  const warnings: string[] = [];
  if (text.trim().length < 20) {
    warnings.push(
      "Aus diesem PDF ließ sich kaum Text lesen. Es ist vermutlich ein Scan (Bild ohne Textebene). Bitte lade ein PDF mit echter Textebene hoch oder füge den Text direkt ein. (Automatische Texterkennung/OCR ist noch nicht verfügbar.)",
    );
  }
  return finalize("pdf", text, warnings, { pages: doc.numPages });
}

// ── Excel (SheetJS/xlsx) -> Markdown-Tabellen ───────────────────────────────

async function extractExcel(file: File): Promise<ExtractResult> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const parts: string[] = [];
  let joinedLen = 0;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
    if (!rows.length) continue;
    const md = rowsToMarkdown(rows);
    if (!md) continue;
    const block = `## Tabellenblatt: ${sheetName}\n\n${md}`;
    parts.push(block);
    joinedLen += block.length + 2;
    if (joinedLen > MAX_EXTRACT_CHARS) break;
  }
  const text = parts.join("\n\n");
  const warnings = [
    "Die Excel-Liste wurde als Wissenstext eingelesen, damit Jana den Inhalt versteht. Für automatische Zeilen-Aktualisierungen in deiner Excel nutze stattdessen den Excel-Live-Sync (eigener Bereich).",
  ];
  if (text.trim().length < 20) {
    warnings.push("Aus dieser Datei ließ sich kaum Text lesen. Bitte prüfe die Datei oder füge den Inhalt direkt ein.");
  }
  return finalize("excel", text, warnings, { sheets: wb.SheetNames.length });
}

const MAX_TABLE_ROWS = 500;

function rowsToMarkdown(rows: unknown[][]): string {
  const clean = rows.map((r) =>
    (Array.isArray(r) ? r : [r]).map((c) => String(c ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim()),
  );
  const width = Math.max(1, ...clean.map((r) => r.length));
  const norm = clean
    .map((r) => {
      const c = [...r];
      while (c.length < width) c.push("");
      return c;
    })
    .filter((r) => r.some((c) => c.length > 0))
    .slice(0, MAX_TABLE_ROWS);
  if (!norm.length) return "";
  const header = norm[0];
  const body = norm.slice(1);
  const line = (r: string[]) => "| " + r.join(" | ") + " |";
  const sep = "| " + header.map(() => "---").join(" | ") + " |";
  return [line(header), sep, ...body.map(line)].join("\n");
}
