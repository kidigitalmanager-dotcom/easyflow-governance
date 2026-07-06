// Button "Report exportieren (PDF)" — öffnet den druckbaren CapitalReport als
// Overlay. Investoren-Pfad: ohne `data` (liest via Hooks). Eigenreport (/signale):
// mit injected `data` (my-signals) + variant="tenant".
import { useState } from "react";
import { FileText } from "lucide-react";
import { CapitalReport, type CapitalReportData } from "./CapitalReport";
import type { CapAccount } from "@/lib/capital";

export function ReportExportButton({ account, data, variant = "investor", className }: {
  account: CapAccount;
  data?: CapitalReportData;
  variant?: "tenant" | "investor";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border border-primary/40 bg-primary/10 text-primary px-3 py-1.5 transition-colors hover:bg-primary/20 " +
          (className ?? "")
        }
        title="Due-Diligence-Report als PDF exportieren"
      >
        <FileText className="w-3.5 h-3.5" />
        Report exportieren (PDF)
      </button>
      {open && <CapitalReport account={account} data={data} variant={variant} onClose={() => setOpen(false)} />}
    </>
  );
}
