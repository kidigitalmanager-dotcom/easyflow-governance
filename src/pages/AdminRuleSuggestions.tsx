import { useMe } from "@/hooks/use-api";
import { ShieldAlert, Lightbulb } from "lucide-react";

// v4.23.0 (Stufe 3B-0): Platzhalter. Stufe 3B füllt diese Seite mit der
// Vorschlags-Queue (aus classification_corrections aggregierte Muster +
// Freigeben/Ablehnen). Hier nur Gate + Hinweis.
export default function AdminRuleSuggestions() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <div className="text-sm text-muted-foreground">Lädt …</div>;
  if (!me?.user?.is_super_admin) {
    return (
      <div className="max-w-lg flex items-center gap-2 text-destructive">
        <ShieldAlert className="w-5 h-5" />
        <h1 className="text-lg font-semibold">Kein Zugriff</h1>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Regel-Vorschläge</h1>
        <p className="text-sm text-muted-foreground">Aus Nutzer-Korrekturen abgeleitete Muster zur Freigabe als feste Regeln.</p>
      </div>
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
        <Lightbulb className="w-6 h-6 text-muted-foreground mx-auto" />
        <p className="mt-2 text-sm text-muted-foreground">
          Noch keine Vorschläge. Sobald sich Korrekturen eines Musters häufen, erscheinen sie hier
          (kommt mit Stufe 3B: Aggregation aus classification_corrections + Freigabe → Pack-Regel).
        </p>
      </div>
    </div>
  );
}
