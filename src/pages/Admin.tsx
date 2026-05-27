import { Link } from "react-router-dom";
import { useMe } from "@/hooks/use-api";
import { ShieldAlert, Sparkles, Lightbulb, PhoneCall } from "lucide-react";

// v4.23.0 (Stufe 3B-0): Super-Admin-Index. Nur fuer Super-Admins (Backend /me
// is_super_admin + Nav-Gate). Kunden sehen weder Nav-Eintrag noch diese Seite.
// Defense-in-Depth: clientseitiger Gate hier + Backend-403 an den Admin-Endpoints.
export default function Admin() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <div className="text-sm text-muted-foreground">Lädt …</div>;
  if (!me?.user?.is_super_admin) {
    return (
      <div className="max-w-lg">
        <div className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="w-5 h-5" />
          <h1 className="text-lg font-semibold">Kein Zugriff</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Dieser Bereich ist nur für Super-Admins.
        </p>
      </div>
    );
  }
  const tools = [
    { to: "/admin/tenant-setup", icon: PhoneCall, title: "Tenant-Setup", desc: "Kunden visuell verwalten & einrichten — ohne SQL: Status, Tarif, Branche, Postfach, Telefonie, DSGVO, Assistenz & Feature-Flags." },
    { to: "/admin/rule-suggestions", icon: Lightbulb, title: "Regel-Vorschläge", desc: "Aus Nutzer-Korrekturen aggregierte Muster prüfen und als feste Regeln freigeben." },
    { to: "/admin/autopilot/promotion", icon: Sparkles, title: "Autopilot-Promotion", desc: "Reifegate-Anfragen prüfen und Autopilot-Modus pro Tenant freigeben." },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">Super-Admin-Werkzeuge (nur für dich sichtbar).</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((t) => (
          <Link key={t.to} to={t.to}
            className="block rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors">
            <div className="flex items-center gap-2 text-foreground">
              <t.icon className="w-[18px] h-[18px] text-primary" />
              <span className="font-medium">{t.title}</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground leading-snug">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
