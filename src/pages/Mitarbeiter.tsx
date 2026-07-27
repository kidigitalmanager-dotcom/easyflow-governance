import { Link } from "react-router-dom";
import { Users, FileSpreadsheet } from "lucide-react";
import { TeamTab } from "@/components/TeamTab";
import { Button } from "@/components/ui/button";

/**
 * Umbau 2026-07-27 (Leon): Mitarbeiter raus aus Einstellungen, eigener
 * Seitenleisten-Punkt. Inhalt ist der bewaehrte TeamTab (Logins, Rollen,
 * Stundensaetze); die Abrechnung (Zeiterfassung) liegt als Schwester-Punkt
 * in derselben Nav-Gruppe.
 */
export default function Mitarbeiter() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6" /> Mitarbeiter
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Logins, Rollen und Stundensätze deines Teams. Die erfassten Zeiten findest du unter Abrechnung.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/zeiterfassung"><FileSpreadsheet className="h-4 w-4 mr-1" /> Zur Abrechnung</Link>
        </Button>
      </div>
      <TeamTab />
    </div>
  );
}
