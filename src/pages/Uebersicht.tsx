import { Clock, Mail, CheckCircle, AlertTriangle, TrendingUp, ChevronRight } from "lucide-react";
import { PriorityBadge } from "@/components/PriorityBadge";
import { REVIEW_QUEUE } from "@/data/mock-data";
import { Link } from "react-router-dom";

const kpis = [
  { label: "Zeit gespart / Woche", value: "14,2 Std.", icon: Clock, trend: "+18%" },
  { label: "Verarbeitete E-Mails", value: "1.247", icon: Mail, trend: "+12%" },
  { label: "Entwürfe akzeptiert", value: "87%", icon: CheckCircle, trend: "+3%" },
  { label: "Risiken erkannt", value: "23", icon: AlertTriangle, trend: "−2" },
  { label: "SLA Trend", value: "96,4%", icon: TrendingUp, trend: "+1,1%" },
];

const escalations = [
  { priority: "P0" as const, count: 3, label: "Sofort handeln" },
  { priority: "P1" as const, count: 8, label: "Zeitkritisch" },
];

const topTriggers = [
  "Rückgabefrist läuft bald ab",
  "Bankdatenänderung von externem Absender",
  "SLA-Verletzung in 2 Stunden",
  "Unbeantwortete Anfrage seit 5 Tagen",
];

export default function Uebersicht() {
  const pendingItems = REVIEW_QUEUE.filter(r => r.priority === "P0" || r.priority === "P1").slice(0, 3);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Übersicht</h1>
        <p className="text-sm text-muted-foreground mt-1">Dein UseEasy Dashboard – KPIs, offene Reviews und Eskalationen.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <kpi.icon className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-primary">{kpi.trend}</span>
            </div>
            <p className="text-2xl font-semibold tracking-tight">{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Queue Widget */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Wartet auf Freigabe</h2>
            <Link to="/review" className="text-xs text-primary hover:underline flex items-center gap-1">
              Zur Review Queue <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {pendingItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30 border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.subject}</p>
                  <p className="text-xs text-muted-foreground">{item.sender} · {item.timestamp}</p>
                </div>
                <PriorityBadge priority={item.priority} />
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Escalations */}
          <div className="glass-card p-6">
            <h2 className="text-base font-semibold mb-4">P0/P1 Eskalationen <span className="text-muted-foreground font-normal">(7 Tage)</span></h2>
            <div className="space-y-3">
              {escalations.map((e) => (
                <div key={e.priority} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={e.priority} />
                    <span className="text-sm text-muted-foreground">{e.label}</span>
                  </div>
                  <span className="text-lg font-semibold">{e.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Triggers */}
          <div className="glass-card p-6">
            <h2 className="text-base font-semibold mb-4">Top Trigger</h2>
            <ul className="space-y-2">
              {topTriggers.map((trigger, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-primary mt-0.5">•</span>
                  {trigger}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
