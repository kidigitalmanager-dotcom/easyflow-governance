import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, PhoneCall, ShieldCheck, Rocket, Bot, ListChecks } from "lucide-react";
import VoiceRepsTab from "@/components/VoiceRepsTab";
import CoPilotRepsTab from "@/components/CoPilotRepsTab";
import SalesCallsAuditTab from "@/components/SalesCallsAuditTab";
import RecordingConsentTab from "@/components/RecordingConsentTab";
import VoiceAgentsTab from "@/components/VoiceAgentsTab";
import LeadUploadTab from "@/components/LeadUploadTab";

export default function VoiceCalls() {
  const initialTab = (() => {
    if (typeof window === "undefined") return "reps";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "calls" || t === "consent" || t === "copilot" || t === "agents" || t === "leads" ? t : "reps";
  })();

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Voice &amp; Calls</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vertriebler-Telefonie, Anruf-Audit und DSGVO-Aufzeichnungs-Einstellungen.
        </p>
      </div>

      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="reps" className="gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Vertriebler
          </TabsTrigger>
          <TabsTrigger value="calls" className="gap-1.5">
            <PhoneCall className="w-3.5 h-3.5" />
            Anrufe
          </TabsTrigger>
          <TabsTrigger value="consent" className="gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            DSGVO-Consent
          </TabsTrigger>
          <TabsTrigger value="copilot" className="gap-1.5">
            <Rocket className="w-3.5 h-3.5" />
            Co-Pilot
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5">
            <Bot className="w-3.5 h-3.5" />
            KI-Agenten
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-1.5">
            <ListChecks className="w-3.5 h-3.5" />
            Leads
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reps" className="mt-6">
          <VoiceRepsTab />
        </TabsContent>

        <TabsContent value="calls" className="mt-6">
          <SalesCallsAuditTab />
        </TabsContent>

        <TabsContent value="consent" className="mt-6">
          <RecordingConsentTab />
        </TabsContent>

        <TabsContent value="copilot" className="mt-6">
          <CoPilotRepsTab />
        </TabsContent>

        <TabsContent value="agents" className="mt-6">
          <VoiceAgentsTab />
        </TabsContent>

        <TabsContent value="leads" className="mt-6">
          <LeadUploadTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
