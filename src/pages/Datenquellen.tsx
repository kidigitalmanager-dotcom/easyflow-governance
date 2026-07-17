import { Database, FileSpreadsheet, Plug } from "lucide-react";
import { Link } from "react-router-dom";
import { MailboxReconnectCard } from "@/components/MailboxReconnectCard";
import { CapitalBankConnect } from "@/components/capital/CapitalBankConnect";
import { CapitalAccountingConnect } from "@/components/capital/CapitalAccountingConnect";
import { CapitalStatementUpload } from "@/components/capital/CapitalStatementUpload";
import { CapitalStripeConnect } from "@/components/capital/CapitalStripeConnect";
import { CapitalShopifyConnect } from "@/components/capital/CapitalShopifyConnect";
import { CapitalMetaAdsConnect } from "@/components/capital/CapitalMetaAdsConnect";
import { CapitalTicketingConnect } from "@/components/capital/CapitalTicketingConnect";

/**
 * Redesign 07.07.2026: EIN Ort fuer alles, was Signale liefert.
 * Postfaecher + alle Quellen-Connects zusammengefuehrt; Detail-Zugriff auf
 * Excel Live-Sync und Integrationen bleibt in den Einstellungen erhalten.
 * Reine Komposition bestehender, self-contained Karten.
 */
export default function Datenquellen() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          Datenquellen
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ein Ort für alles, was Signale liefert. Je mehr verbunden ist, desto belastbarer
          werden Gesundheits-Index und Frühwarnung. Es verlassen nur aggregierte 0-100-Werte
          das System, nie Rohdaten. EU-Hosting (Frankfurt), PII-Minimierung vor dem LLM.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Postfächer · Kern-Quelle</h2>
        <MailboxReconnectCard />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Finanzen</h2>
        <div className="grid gap-6 xl:grid-cols-2 items-start">
          <CapitalBankConnect />
          <CapitalAccountingConnect />
        </div>
        <CapitalStatementUpload />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Umsatz & Marketing</h2>
        <div className="grid gap-6 xl:grid-cols-2 items-start">
          <CapitalStripeConnect />
          <CapitalShopifyConnect />
          <CapitalMetaAdsConnect />
          <CapitalTicketingConnect />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Dateien & Integrationen</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link to="/einstellungen?tab=spreadsheet" className="glass-card-hover p-4 flex items-start gap-3">
            <FileSpreadsheet className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Excel Live-Sync</p>
              <p className="text-xs text-muted-foreground mt-1">Listen verbinden, Spalten-Mapping, Audit · in den Einstellungen</p>
            </div>
          </Link>
          <Link to="/einstellungen?tab=integrations" className="glass-card-hover p-4 flex items-start gap-3">
            <Plug className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Integrationen</p>
              <p className="text-xs text-muted-foreground mt-1">HubSpot, Microsoft/OneDrive, Telegram, DHL · in den Einstellungen</p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
