import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sun } from "lucide-react";
import { MorningBriefing } from "./MorningBriefing";
import { useMorningBriefing } from "@/hooks/use-capital";

// Feuert das Morgen-Briefing als Dialog EINMAL pro Tag:
//  - beim ersten Laden der Console an einem neuen Tag ("erster Login des Tages"), und
//  - falls die Session offen bleibt, spätestens um 8:30 Uhr (lokal).
// Dedup via localStorage-Datum (kein Doppel-Feuern am selben Tag).
const LS_KEY = "ue.morningBriefing.lastShown";
const FIRE_HOUR = 8;
const FIRE_MIN = 30;

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function pastFireTime(): boolean {
  const d = new Date();
  return d.getHours() > FIRE_HOUR || (d.getHours() === FIRE_HOUR && d.getMinutes() >= FIRE_MIN);
}
function getLastShown(): string | null {
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}
function setShownToday() {
  try { localStorage.setItem(LS_KEY, localToday()); } catch { /* ignore */ }
}

export function MorningBriefingDialog() {
  const q = useMorningBriefing();
  const [open, setOpen] = useState(false);
  const hasBriefing = !!q.data && !!q.data.has_own_account;

  useEffect(() => {
    if (!hasBriefing) return;
    const maybeFire = () => {
      if (getLastShown() === localToday()) return; // heute schon gefeuert
      setShownToday();
      setOpen(true);
    };
    // Erstes Laden der Console an einem neuen Tag -> sofort feuern.
    maybeFire();
    // Robustheit: bleibt die Session offen und überschreitet 8:30, feuern wir dann.
    const iv = setInterval(() => {
      if (getLastShown() !== localToday() && pastFireTime()) maybeFire();
    }, 60_000);
    return () => clearInterval(iv);
  }, [hasBriefing]);

  if (!hasBriefing) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-1">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sun className="w-4 h-4 text-primary" /> Guten Morgen — dein Briefing für heute
          </DialogTitle>
          <DialogDescription className="sr-only">Deine wichtigsten Signale des Tages, aus deinen eigenen Kennzahlen.</DialogDescription>
        </DialogHeader>
        <div className="px-3 pb-3">
          <MorningBriefing />
        </div>
      </DialogContent>
    </Dialog>
  );
}
