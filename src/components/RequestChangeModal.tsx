import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["Domains", "Approval-Regeln", "Mailboxen", "Playbooks", "Plan"];
const CHANGE_TYPES = ["Hinzufügen", "Entfernen", "Anpassung"];
const URGENCIES = ["Normal", "Hoch", "Kritisch"];

interface Props {
  open: boolean;
  onClose: () => void;
  defaultCategory?: string;
}

export function RequestChangeModal({ open, onClose, defaultCategory }: Props) {
  const [category, setCategory] = useState(defaultCategory || CATEGORIES[0]);
  const [changeType, setChangeType] = useState(CHANGE_TYPES[0]);
  const [urgency, setUrgency] = useState(URGENCIES[0]);

  if (!open) return null;

  const handleSubmit = () => {
    toast.success("Anfrage gesendet", {
      description: `${category} · ${changeType} · Dringlichkeit: ${urgency}`,
    });
    onClose();
  };

  const selectClass =
    "w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Änderung anfragen</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Kategorie</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Änderungstyp</label>
            <select value={changeType} onChange={(e) => setChangeType(e.target.value)} className={selectClass}>
              {CHANGE_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Dringlichkeit</label>
            <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className={selectClass}>
              {URGENCIES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-md text-sm font-medium border border-border text-muted-foreground hover:bg-muted/30 transition-colors">
            Abbrechen
          </button>
          <button onClick={handleSubmit} className="flex-1 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            Anfrage senden
          </button>
        </div>
      </div>
    </div>
  );
}
