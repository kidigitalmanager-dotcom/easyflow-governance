/**
 * ReviewVerdictButtons — Approve/Edit/Reject für einen ECHTEN Draft in der
 * Review-Queue (v4.18.0).
 *
 * Eine Geste, zwei Wirkungen (Briefing 0b):
 *  (1) operativ: approve/edit legt den Entwurf via Gmail/Outlook in den
 *      ENTWÜRFE-Ordner ("Als Entwurf in dein Postfach legen") — UseEasy sendet
 *      nie selbst. reject verwirft.
 *  (2) Lernschleife: das Backend schreibt — nur wenn der Tenant den Autopilot
 *      in shadow/assisted fährt — autopilot_feedback als stillen Side-Effect.
 *
 * Endpoint: POST /v1/dashboard/review/verdict (NICHT mehr /autopilot/feedback).
 *
 * Redesign 27.07.2026: die Mutationen liegen jetzt in useReviewActions, damit
 * der neue Tastatur-Flow (F/A/E) und diese Buttons GARANTIERT dasselbe tun.
 * `openEditorSignal` erlaubt der Seite, den Editor per Taste E zu oeffnen.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, Edit2, X } from "lucide-react";
import { useReviewActions } from "@/hooks/use-review-actions";
import { REVIEW } from "@/data/strings.de";

interface Props {
  draftId: string;
  originalBody?: string;
  /** Zaehler: jede Erhoehung oeffnet den Editor (Tastatur "E"). */
  openEditorSignal?: number;
  /** Wird nach erfolgreichem Verdict aufgerufen (z.B. weiter zum naechsten Vorgang). */
  onDone?: () => void;
}

export default function ReviewVerdictButtons({
  draftId,
  originalBody = "",
  openEditorSignal = 0,
  onDone,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [editedBody, setEditedBody] = useState(originalBody);
  const actions = useReviewActions();

  /* Nur eine ERHOEHUNG des Zaehlers oeffnet den Editor — nicht schon ein
     Mount mit bereits erhoehtem Zaehler. Sonst sprang die Warteschlange nach
     dem ersten "E" bei JEDEM weiteren Vorgang direkt in den Editor (die Seite
     zaehlt den Zaehler nie zurueck, und die Komponente wird pro draft_id neu
     gemountet). Das blockierte zugleich das Blaettern mit ↓/↑, weil der Fokus
     dann im Textfeld liegt. */
  const seenSignal = useRef(openEditorSignal);
  useEffect(() => {
    if (openEditorSignal > 0 && openEditorSignal !== seenSignal.current) {
      seenSignal.current = openEditorSignal;
      setEditedBody(originalBody);
      setEditMode(true);
    }
  }, [openEditorSignal, originalBody]);

  if (editMode) {
    return (
      <div className="w-full space-y-2">
        <Textarea
          value={editedBody}
          onChange={(e) => setEditedBody(e.target.value)}
          rows={8}
          className="font-mono text-xs"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={() =>
              actions.edit(draftId, editedBody, () => {
                setEditMode(false);
                onDone?.();
              })
            }
            disabled={actions.isPending || editedBody.trim() === ""}
          >
            {REVIEW.draftToBox}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>
            Abbrechen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-shrink-0 gap-1.5">
      <Button
        size="sm"
        variant="default"
        onClick={() => actions.approve(draftId, onDone)}
        disabled={actions.isPending}
        title={`${REVIEW.draftToBox} · Taste F`}
      >
        <Check className="mr-1 h-3.5 w-3.5" /> In Postfach
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setEditedBody(originalBody);
          setEditMode(true);
        }}
        disabled={actions.isPending}
        title="Entwurf bearbeiten · Taste E"
      >
        <Edit2 className="mr-1 h-3.5 w-3.5" /> Bearbeiten
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => actions.reject(draftId, onDone)}
        disabled={actions.isPending}
        title="Entwurf verwerfen · Taste A"
      >
        <X className="mr-1 h-3.5 w-3.5" /> Verwerfen
      </Button>
    </div>
  );
}
