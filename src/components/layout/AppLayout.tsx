import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, ListChecks, History, BookOpen, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/useeasy-logo.jpg";
import { getCurrentPlan } from "@/data/plan";

const navItems = [
  { to: "/", label: "Übersicht", icon: LayoutDashboard },
  { to: "/review", label: "Review Queue", icon: ListChecks },
  { to: "/audit", label: "Audit Trail", icon: History },
  { to: "/playbooks", label: "Playbooks", icon: BookOpen },
  { to: "/einstellungen", label: "Einstellungen", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const plan = getCurrentPlan();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-sidebar-border">
          <img src={logo} alt="UseEasy" className="w-9 h-9 rounded-lg" />
          <div>
            <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">
              Use<span className="text-primary">Easy</span>
            </span>
            <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
              {plan.name}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <item.icon className="w-[18px] h-[18px]" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-sidebar-border">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            UseEasy erstellt nur Entwürfe.<br />Senden erfolgt immer durch dich.
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
