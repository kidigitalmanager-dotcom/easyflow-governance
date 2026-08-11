import { useAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";
import logo from "@/assets/useeasy-logo.jpg";

// v4.132.0 — Schlankes Mitarbeiter-Frontend (Muster InvestorLayout):
// KEIN Zugriff auf Operator-Console/Konfiguration.
// Mobil-first: kompakter Header, volle Breite fuer Daumen-Bedienung.
//
// Schnitt B4a (11.08.2026): der Mitarbeiter ist nicht mehr nur der
// Zeiterfasser. Ein Vertriebler arbeitet hier an seinen Faellen, legt Termine
// an und liest seinen Anrufverlauf (Leon-Entscheid 11.08.: volle
// Arbeitsflaeche, damit er nicht zwischen zwei Oberflaechen wechseln muss).
// Deshalb wandert der feste "Zeiterfassung"-Aufkleber aus dem Kopf heraus und
// wird zu `bereich`, und der Kopf traegt eine Leiste `nav`.
// Die Breite waechst von max-w-3xl auf max-w-6xl: die Fall-Liste ist eine
// Tabelle mit sieben Spalten und war in 3xl nicht lesbar. Auf dem Telefon
// aendert das nichts, dort begrenzt ohnehin der Bildschirm.
export function EmployeeLayout({
  children,
  displayName,
  bereich,
  nav,
}: {
  children: React.ReactNode;
  displayName?: string | null;
  bereich?: React.ReactNode;
  nav?: React.ReactNode;
}) {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-sidebar-border bg-sidebar sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={logo} alt="UseEasy" className="w-7 h-7 rounded-lg shrink-0" />
            <span className="text-sm font-semibold text-foreground shrink-0">
              Use<span className="text-primary">Easy</span>
            </span>
            {bereich}
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-muted-foreground/70 truncate hidden sm:inline">
              {displayName || user?.email || ""}
            </span>
            <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors shrink-0">
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>
        {nav}
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-5">{children}</div>
      </main>
    </div>
  );
}
