import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 2026-07-27 — Einheitlicher Fehlerzustand fuer Daten-Karten.
 *
 * Hintergrund: Bis heute zeigten alle Buchhaltungs-Seiten bei einem API-Fehler
 * ihren Leer-Zustand ("Noch keine offenen Forderungen.") — eine falsche
 * Entwarnung, gerade dort, wo es um Geld geht. Diese Komponente ersetzt in den
 * Karten den Leer-Zustand, sobald die Query fehlgeschlagen ist.
 */
export function QueryErrorNotice({
  label = "Daten konnten nicht geladen werden.",
  onRetry,
  retrying,
}: {
  label?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0">{label} Die Anzeige ist unvollständig — das ist ein Verbindungs- oder Serverproblem, kein leerer Bestand.</span>
      {onRetry && (
        <Button variant="outline" size="sm" className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={onRetry} disabled={retrying}>
          <RotateCw className={`h-3.5 w-3.5 mr-1 ${retrying ? "animate-spin" : ""}`} /> Neu laden
        </Button>
      )}
    </div>
  );
}
