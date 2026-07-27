import { FileSpreadsheet, Plug, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { MailboxReconnectCard } from "@/components/MailboxReconnectCard";
import { CapitalBankConnect } from "@/components/capital/CapitalBankConnect";
import { CapitalAccountingConnect } from "@/components/capital/CapitalAccountingConnect";
import { CapitalStatementUpload } from "@/components/capital/CapitalStatementUpload";
import { CapitalStripeConnect } from "@/components/capital/CapitalStripeConnect";
import { CapitalShopifyConnect } from "@/components/capital/CapitalShopifyConnect";
import { CapitalMetaAdsConnect } from "@/components/capital/CapitalMetaAdsConnect";
import { CapitalTicketingConnect } from "@/components/capital/CapitalTicketingConnect";
import { PageHeader } from "@/components/ue/primitives";

/**
 * Redesign 07.07.2026: EIN Ort fuer alles, was Signale liefert.
 * Postfaecher + alle Quellen-Connects zusammengefuehrt; Detail-Zugriff auf
 * Excel Live-Sync und Integrationen bleibt in den Einstellungen erhalten.
 * Reine Komposition bestehender, self-contained Karten.
 *
 * Redesign 27.07.2026: PageHeader statt handgebautem Titel, Gruppen-Ueberschriften
 * als .ue-kicker. Die Connect-Karten bringen ihre eigene Karten-Huelle inklusive
 * Lade- und Fehlerzustand mit — sie werden deshalb bewusst NICHT zusaetzlich in
 * eine SectionCard gepackt (das gaebe Karte-in-Karte und doppelte Raender).
 */
export default function Datenquellen() {
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Datenquellen"
        title="Alles, was Signale liefert"
        subtitle="Je mehr verbunden ist, desto belastbarer werden Gesundheits-Index und Frühwarnung. Es verlassen nur aggregierte 0-100-Werte das System, nie Rohdaten. EU-Hosting (Frankfurt), PII-Minimierung vor dem LLM."
      />

      <section className="space-y-3 animate-fade-up">
        <h2 className="ue-kicker">Postfächer · Kern-Quelle</h2>
        <MailboxReconnectCard />
      </section>

      <section className="space-y-3 animate-fade-up stagger-1">
        <h2 className="ue-kicker">Finanzen</h2>
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <CapitalBankConnect />
          <CapitalAccountingConnect />
        </div>
        <CapitalStatementUpload />
      </section>

      <section className="space-y-3 animate-fade-up stagger-2">
        <h2 className="ue-kicker">Umsatz &amp; Marketing</h2>
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <CapitalStripeConnect />
          <CapitalShopifyConnect />
          <CapitalMetaAdsConnect />
          <CapitalTicketingConnect />
        </div>
      </section>

      <section className="space-y-3 animate-fade-up stagger-3">
        <h2 className="ue-kicker">Dateien &amp; Integrationen</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to="/einstellungen?tab=spreadsheet"
            className="glass-card-hover group flex items-start gap-3 p-4"
          >
            <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">Excel Live-Sync</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Listen verbinden, Spalten-Mapping, Audit · in den Einstellungen
              </p>
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-tx-weak transition-colors group-hover:text-primary" />
          </Link>
          <Link
            to="/einstellungen?tab=integrations"
            className="glass-card-hover group flex items-start gap-3 p-4"
          >
            <Plug className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">Integrationen</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                HubSpot, Microsoft/OneDrive, Telegram, DHL · in den Einstellungen
              </p>
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-tx-weak transition-colors group-hover:text-primary" />
          </Link>
        </div>
      </section>
    </div>
  );
}
