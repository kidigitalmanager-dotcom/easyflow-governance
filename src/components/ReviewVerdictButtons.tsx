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
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, Edit2, X } from "lucide-react";
import { toast } from "sonner";
import { useSubmitReviewVerdict } from "@/hooks/use-api";
import { REVIEW } from "@/data/strings.de";

interface Props {
  draftId: string;
  originalBody?: string;
}

export default function ReviewVerdictButtons({ draftId, originalBody = "" }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [editedBody, setEditedBody] = useState(originalBody);
  const submit = useSubmitReviewVerdict();

  const onErr = (e: unknown) =>
    toast.error("Fehler: " + (e instanceof Error ? e.message : String(e)));

  const handleApprove = () => {
    submit.mutate({ draft_id: draftId, human_verdict: "approve" }, {
      onSuccess: () => toast.success(REVIEW.approvedToast),
      onError: onErr,
    });
  };
  const handleEdit = () => {
    submit.mutate({ draft_id: draftId, human_verdict: "edit", draft_body_final: editedBody }, {
      onSuccess: (data) => {
        toast.success(`${REVIEW.editedToast} (${data.edit_distance} Zeichen geändert)`);
        setEditMode(false);
      },
      onError: onErr,
    });
  };
  const handleReject = () => {
    submit.mutate({ draft_id: draftId, human_verdict: "reject" }, {
      onSuccess: () => toast.success(REVIEW.rejectedToast),
      onError: onErr,
    });
  };

  if (editMode) {
    return (
      <div className="space-y-2 w-full">
        <Textarea
          value={editedBody}
          onChange={(e) => setEditedBody(e.target.value)}
          rows={8}
          className="font-mono text-xs"
        />
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="default" onClick={handleEdit}
            disabled={submit.isPending || editedBody.trim() === ""}>
            {REVIEW.draftToBox}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Abbrechen</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5 flex-shrink-0">
      <Button size="sm" variant="default" onClick={handleApprove} disabled={submit.isPending}
        title={REVIEW.draftToBox}>
        <Check className="h-3.5 w-3.5 mr-1" /> In Postfach
      </Button>
      <Button size="sm" variant="outline" onClick={() => { setEditedBody(originalBody); setEditMode(true); }}
        disabled={submit.isPending}>
        <Edit2 className="h-3.5 w-3.5 mr-1" /> Bearbeiten
      </Button>
      <Button size="sm" variant="destructive" onClick={handleReject} disabled={submit.isPending}>
        <X className="h-3.5 w-3.5 mr-1" /> Verwerfen
      </Button>
    </div>
  );
}
