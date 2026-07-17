import { Sparkles } from "lucide-react";
import { FoerderRadarCard } from "@/components/capital/FoerderRadarCard";
import { UpsellSuggestionCard } from "@/components/capital/UpsellSuggestionCard";

/**
 * Redesign 07.07.2026: Chancen getrennt von Warnungen.
 * Foerder-Radar (latentes Kapital) + belegte Vorschlaege von Jana in einer positiven Heimat.
 * Reine Komposition bestehender, self-contained Karten.
 */
export default function Chancen() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Chancen
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Latentes Kapital und Vorschläge, die sich aus deinen Signalen ergeben.
          Alles belegt, nichts erfunden, jeder Vorschlag abbestellbar.
        </p>
      </div>

      <UpsellSuggestionCard />
      <FoerderRadarCard />
    </div>
  );
}
