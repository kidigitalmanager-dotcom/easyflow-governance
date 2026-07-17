import { AlertTriangle } from "lucide-react";
import { RiskShieldCard } from "@/components/capital/RiskShieldCard";
import { ComplianceRadarCard } from "@/components/capital/ComplianceRadarCard";

/**
 * Redesign 07.07.2026: Alles, was warnt, an einem Ort.
 * Reine Komposition bestehender, self-contained Karten (Risk Shield + Compliance-Radar).
 * Die Karten leben zusaetzlich weiter auf /signale (nichts faellt weg).
 */
export default function Fruehwarnung() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-p1" />
          Frühwarnung
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alles, was warnt, an einem Ort: Partner-Watchlist und eigene Rechts- und Compliance-Lage.
          Eine Ampel-Sprache: Bestätigt · Beobachtung · Stabil.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2 items-start">
        <RiskShieldCard />
        <ComplianceRadarCard />
      </div>

      <p className="text-xs text-muted-foreground">
        Bewertung nur aus öffentlichen Signalen bzw. dem eigenen Postfach. Keine Rechtsberatung.
        Investoren sehen ausschließlich aggregierte Indizes, nie Einzel-Signale.
      </p>
    </div>
  );
}
