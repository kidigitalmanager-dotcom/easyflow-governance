import { FoerderRadarCard } from "@/components/capital/FoerderRadarCard";
import { UpsellSuggestionCard } from "@/components/capital/UpsellSuggestionCard";
import { PageHeader } from "@/components/ue/primitives";

/**
 * Redesign 07.07.2026: Chancen getrennt von Warnungen.
 * Foerder-Radar (latentes Kapital) + belegte Vorschlaege von Jana in einer positiven Heimat.
 * Reine Komposition bestehender, self-contained Karten.
 *
 * Redesign 27.07.2026: PageHeader statt handgebautem Titel. Beide Karten bringen
 * Huelle, Lade- und Fehlerzustand selbst mit und rendern nur mit Daten — sie
 * werden deshalb NICHT zusaetzlich in eine SectionCard gewickelt, und die Seite
 * erfindet auch keinen Leer-Zustand fuer sie.
 */
export default function Chancen() {
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Chancen"
        title="Was noch in deinen Zahlen steckt"
        subtitle="Latentes Kapital und Vorschläge, die sich aus deinen Signalen ergeben. Alles belegt, nichts erfunden, jeder Vorschlag abbestellbar."
      />

      {/* Bewusst ohne Wrapper-<div>: UpsellSuggestionCard rendert null, wenn es
          keinen belegten Vorschlag gibt. Ein leerer Wrapper wuerde durch
          space-y-6 trotzdem eine Luecke reissen. */}
      <UpsellSuggestionCard />
      <FoerderRadarCard />
    </div>
  );
}
