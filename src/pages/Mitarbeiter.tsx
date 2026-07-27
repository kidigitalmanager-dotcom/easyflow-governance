import { Link } from "react-router-dom";
import { FileSpreadsheet } from "lucide-react";
import { TeamTab } from "@/components/TeamTab";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ue/primitives";

/**
 * Umbau 2026-07-27 (Leon): Mitarbeiter raus aus Einstellungen, eigener
 * Seitenleisten-Punkt. Inhalt ist der bewaehrte TeamTab (Logins, Rollen,
 * Stundensaetze); die Abrechnung (Zeiterfassung) liegt als Schwester-Punkt
 * in derselben Nav-Gruppe.
 *
 * Redesign 27.07.2026: handgebauter <h1> raus, PageHeader rein. Breite und
 * Polsterung setzt AppLayout — die Seite bringt nur noch `space-y-6` mit.
 * Der Inhalt (TeamTab) rendert bereits in `glass-card` und bleibt unberuehrt.
 */
export default function Mitarbeiter() {
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Team"
        title="Mitarbeiter"
        subtitle="Logins, Rollen und Stundensätze deines Teams. Die erfassten Zeiten findest du unter Abrechnung."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/zeiterfassung">
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Zur Abrechnung
            </Link>
          </Button>
        }
      />
      <TeamTab />
    </div>
  );
}
