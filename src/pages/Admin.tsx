import { Link } from "react-router-dom";
import { useMe } from "@/hooks/use-api";
import { ShieldAlert, Sparkles, Lightbulb, PhoneCall, TrendingUp, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { PageHeader } from "@/components/ue/primitives";

// v4.23.0 (Stufe 3B-0): Super-Admin-Index. Nur fuer Super-Admins (Backend /me
// is_super_admin + Nav-Gate). Kunden sehen weder Nav-Eintrag noch diese Seite.
// Defense-in-Depth: clientseitiger Gate hier + Backend-403 an den Admin-Endpoints.
//
// Redesign 27.07.2026: Seitenkopf ueber PageHeader, Kacheln auf Tokens. Das Gate
// selbst bleibt unveraendert scharf — nur die Huelle ist neu.
export default function Admin() {
  const meQ = useMe();
  const me = meQ.data;

  if (meQ.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[var(--radius)]" />
          ))}
        </div>
      </div>
    );
  }

  // Fehler ist NICHT dasselbe wie "kein Zugriff": bei einem /me-Fehler waere
  // "Kein Zugriff" eine falsche Aussage. Der Gate bleibt trotzdem zu — hier
  // erscheint nur die Fehlermeldung mit Retry, niemals Admin-Inhalt.
  if (meQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="Super-Admin" title="Admin" />
        <QueryErrorNotice
          label="Deine Berechtigung konnte nicht geprüft werden."
          onRetry={() => meQ.refetch()}
          retrying={meQ.isFetching}
        />
      </div>
    );
  }

  if (!me?.user?.is_super_admin) {
    return (
      <div className="max-w-lg space-y-2">
        <div className="flex items-center gap-2 text-danger">
          <ShieldAlert className="w-5 h-5" />
          <h1 className="text-lg font-semibold">Kein Zugriff</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Dieser Bereich ist nur für Super-Admins.
        </p>
      </div>
    );
  }

  // Literale Klassennamen — Tailwind scannt den Quelltext, ein zusammengebautes
  // `stagger-${i}` waere im Build nicht enthalten.
  const STAGGER = ["stagger-1", "stagger-2", "stagger-3", "stagger-4"];
  const tools = [
    { to: "/admin/tenant-setup", icon: PhoneCall, title: "Tenant-Setup", desc: "Kunden visuell verwalten & einrichten — ohne SQL: Status, Tarif, Branche, Postfach, Telefonie, DSGVO, Assistenz & Feature-Flags." },
    { to: "/admin/rule-suggestions", icon: Lightbulb, title: "Regel-Vorschläge", desc: "Aus Nutzer-Korrekturen aggregierte Muster prüfen und als feste Regeln freigeben." },
    { to: "/admin/autopilot/promotion", icon: Sparkles, title: "Autopilot-Promotion", desc: "Reifegate-Anfragen prüfen und Autopilot-Modus pro Tenant freigeben." },
    { to: "/admin/onboarding", icon: TrendingUp, title: "Onboarding-Funnel", desc: "Self-Serve-Käufer im Blick: gekauft → Link verschickt → verbunden, plus hängende Käufer (gekauft, nicht verbunden)." },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Super-Admin"
        title="Admin"
        subtitle="Werkzeuge für den Betrieb — nur für dich sichtbar, jeder Endpoint prüft zusätzlich serverseitig."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((t, i) => (
          <Link
            key={t.to}
            to={t.to}
            className={`ue-card-raised group block p-4 transition-colors hover:border-primary/40 animate-fade-up ${STAGGER[i] ?? ""}`}
          >
            <div className="flex items-center gap-2 text-foreground">
              <t.icon className="w-[18px] h-[18px] text-primary" />
              <span className="text-[13.5px] font-semibold">{t.title}</span>
              <ChevronRight className="ml-auto w-4 h-4 text-tx-weak transition-colors group-hover:text-primary" />
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
