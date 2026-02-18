import { useState } from "react";
import { Lock } from "lucide-react";
import { RequestChangeModal } from "./RequestChangeModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  children: React.ReactNode;
  category?: string;
}

export function LockedControl({ children, category }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <TooltipProvider>
      <div className="relative">
        <div className="opacity-50 pointer-events-none select-none">
          {children}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/40 rounded-lg backdrop-blur-[1px]">
          <Tooltip>
            <TooltipTrigger asChild>
              <Lock className="w-5 h-5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>Änderung nur per Ticket/Upgrade</TooltipContent>
          </Tooltip>
          <p className="text-xs text-muted-foreground text-center max-w-[220px]">
            Diese Einstellung ist in deinem Plan gesperrt.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="px-3 py-1.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            Änderung anfragen
          </button>
        </div>
        <RequestChangeModal open={modalOpen} onClose={() => setModalOpen(false)} defaultCategory={category} />
      </div>
    </TooltipProvider>
  );
}
