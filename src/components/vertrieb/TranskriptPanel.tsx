// -----------------------------------------------------------------------------
// TranskriptPanel.tsx — das mitlaufende Gespraech.
//
// 🔴 MONO ist eine Warnung, kein Schoenheitsfehler. Ohne den Kundenkanal
// steht zwar ein Transkript da, aber es ist alles dem Vertriebler
// zugeschrieben — und die Einwand-Erkennung wuerde auf die eigene Stimme
// hoeren. Der Master sagt an derselben Stelle dasselbe, laut.
// -----------------------------------------------------------------------------
import { useEffect, useRef } from "react";
import { SectionCard, EmptyState } from "@/components/ue/primitives";
import { sprecherName } from "@/lib/dg-transkript";
import type { Transkript } from "@/hooks/use-transkript";
import { AlertTriangle, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export function TranskriptPanel({
  t, repName, imGespraech,
}: {
  t: Transkript;
  repName?: string | null;
  imGespraech: boolean;
}) {
  const ende = useRef<HTMLDivElement | null>(null);
  // Mitlaufen, ohne die Seite zu bewegen.
  useEffect(() => {
    ende.current?.scrollIntoView({ block: "nearest" });
  }, [t.verlauf.length, t.zwischenstand.kunde, t.zwischenstand.rep]);

  const zwischen = [
    t.zwischenstand.kunde ? { text: t.zwischenstand.kunde, sprecher: "kunde" as const } : null,
    t.zwischenstand.rep ? { text: t.zwischenstand.rep, sprecher: "rep" as const } : null,
  ].filter(Boolean) as Array<{ text: string; sprecher: "kunde" | "rep" }>;

  return (
    <SectionCard
      title="Transkript"
      live={t.laeuft}
      subtitle={
        !imGespraech ? "Läuft mit, sobald ein Gespräch steht."
          : t.laeuft ? (t.stereo ? "Zwei Kanäle: du und der Kunde getrennt." : "Nur ein Kanal.")
          : "Verbindung wird aufgebaut."
      }
      bodyClassName="p-0"
    >
      {t.fehler && (
        <p className="border-b border-line-soft bg-danger/5 px-4 py-2.5 text-[12.5px] text-danger">
          {t.fehler}
        </p>
      )}

      {/* 🔴 Die MONO-Warnung. */}
      {t.laeuft && !t.stereo && (
        <div className="flex items-start gap-2 border-b border-line-soft bg-amber/5 px-4 py-2.5 text-[12.5px] text-amber">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Kein Kundenkanal erkannt. Was hier steht, wird dir zugeschrieben, und die
            Einwand-Erkennung hört nur dich. Auflegen und über „anrufen“ neu starten.
          </p>
        </div>
      )}

      <div className="max-h-[26rem] min-h-[12rem] space-y-2 overflow-y-auto p-4">
        {t.verlauf.length === 0 && zwischen.length === 0 ? (
          <EmptyState
            icon={<Radio className="h-7 w-7" />}
            title={imGespraech ? "Noch nichts gesagt" : "Kein Gespräch"}
            description={
              imGespraech
                ? "Sobald jemand spricht, steht es hier."
                : "Nummer oben eingeben und anrufen. Das Transkript startet mit dem Gespräch."
            }
          />
        ) : (
          <>
            {t.verlauf.map((z, i) => (
              <p key={i} className="text-[13px] leading-relaxed">
                <span
                  className={cn(
                    "mr-1.5 font-semibold",
                    z.sprecher === "kunde" ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {sprecherName(z.sprecher, repName) || "…"}
                </span>
                {/* 🔴 Unsicheres wird ausgegraut, nicht verschwiegen. */}
                <span className={z.unsicher ? "text-tx-weak" : "text-foreground"}>{z.text}</span>
              </p>
            ))}
            {zwischen.map((z) => (
              <p key={z.sprecher} className="text-[13px] leading-relaxed opacity-60">
                <span
                  className={cn(
                    "mr-1.5 font-semibold",
                    z.sprecher === "kunde" ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {sprecherName(z.sprecher, repName) || "…"}
                </span>
                <span className="text-muted-foreground">{z.text}</span>
              </p>
            ))}
            <div ref={ende} />
          </>
        )}
      </div>
    </SectionCard>
  );
}

export default TranskriptPanel;
