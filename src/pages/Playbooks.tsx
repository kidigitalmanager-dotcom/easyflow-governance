import { useState } from "react";
import { PLAYBOOKS, MAILBOXES, MAILBOX_PLAYBOOK_ASSIGNMENTS } from "@/data/mock-data";
import { getCurrentPlan, currentPlan } from "@/data/plan";
import { PriorityBadge } from "@/components/PriorityBadge";
import { Lock, Check, ArrowRightLeft } from "lucide-react";

type PlaybookStatus = "aktiv" | "verfügbar" | "gesperrt";

export default function Playbooks() {
  const plan = getCurrentPlan();
  const [selectedMailbox, setSelectedMailbox] = useState(MAILBOXES[0]);
  const [assignments, setAssignments] = useState(MAILBOX_PLAYBOOK_ASSIGNMENTS);
  const [switchModal, setSwitchModal] = useState<{ playbookId: string } | null>(null);

  // Count active playbooks across all mailboxes
  const activePlaybookIds = new Set(Object.values(assignments).filter(Boolean));
  const activeCount = activePlaybookIds.size;

  const getStatus = (playbookId: string): PlaybookStatus => {
    if (assignments[selectedMailbox] === playbookId) return "aktiv";
    // Check if adding this would exceed limit
    const wouldBeNew = !activePlaybookIds.has(playbookId);
    if (wouldBeNew && activeCount >= plan.includedPlaybooks) return "gesperrt";
    return "verfügbar";
  };

  const handleSwitch = (playbookId: string) => {
    const status = getStatus(playbookId);
    if (status === "gesperrt") return;
    if (status === "aktiv") return;
    setSwitchModal({ playbookId });
  };

  const confirmSwitch = () => {
    if (!switchModal) return;
    setAssignments(prev => ({ ...prev, [selectedMailbox]: switchModal.playbookId }));
    setSwitchModal(null);
  };

  const statusBadge = (status: PlaybookStatus) => {
    switch (status) {
      case "aktiv":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/30"><Check className="w-3 h-3" /> aktiv</span>;
      case "verfügbar":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted/50 text-muted-foreground border border-border">verfügbar</span>;
      case "gesperrt":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20"><Lock className="w-3 h-3" /> gesperrt</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Playbooks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Branchen-Playbooks für deine Mailboxen. {activeCount} / {plan.includedPlaybooks} aktiv.
        </p>
      </div>

      {/* Mailbox selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Mailbox:</span>
        <div className="flex gap-2">
          {MAILBOXES.map((mb) => (
            <button
              key={mb}
              onClick={() => setSelectedMailbox(mb)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                selectedMailbox === mb
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground border border-border hover:bg-muted/30"
              }`}
            >
              {mb}
            </button>
          ))}
        </div>
      </div>

      {/* Playbook grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PLAYBOOKS.map((pb) => {
          const status = getStatus(pb.id);
          return (
            <div
              key={pb.id}
              className={`glass-card p-5 transition-all duration-200 ${
                status === "gesperrt" ? "opacity-50" : ""
              } ${status === "aktiv" ? "border-primary/30" : ""}`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold">{pb.name}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50 border border-border">{pb.version}</span>
                  {statusBadge(status)}
                </div>
              </div>

              <ul className="space-y-1 mb-3">
                {pb.useCases.map((uc, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span> {uc}
                  </li>
                ))}
              </ul>

              <p className="text-xs text-muted-foreground mb-4">{pb.priorityExplainer}</p>

              {status === "gesperrt" ? (
                <button className="w-full px-3 py-2 rounded-md text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
                  Plan upgraden
                </button>
              ) : status === "verfügbar" ? (
                <button
                  onClick={() => handleSwitch(pb.id)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Aktivieren
                </button>
              ) : (
                <div className="text-center text-xs text-primary font-medium py-2">
                  Aktives Playbook für {selectedMailbox}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Switch Modal */}
      {switchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="glass-card p-6 max-w-md w-full mx-4 space-y-4">
            <h2 className="text-lg font-semibold">Playbook wechseln?</h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Du änderst das aktive Branchen-Playbook für diese Mailbox.</p>
              <p>Das kann Prioritäten (P0–P3) und Empfehlungen beeinflussen.</p>
              <p>Der Wechsel wird versioniert und im Audit protokolliert.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setSwitchModal(null)}
                className="flex-1 px-4 py-2 rounded-md text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={confirmSwitch}
                className="flex-1 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Wechsel bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
