/**
 * ReviewVerdictButtons — Approve/Edit/Reject für Drafts in der Review-Queue.
 * Schickt menschlichen Verdict an /v1/dashboard/autopilot/feedback.
 * Backend: berechnet Levenshtein-Edit-Distance, is_mismatch, schreibt
 * autopilot_feedback-Row + draft_queue.status-Update.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, Edit2, X } from "lucide-react";
import { toast } from "sonner";
import { useSubmitAutopilotFeedback } from "@/hooks/use-api";

interface Props {
  draftId: string;
  originalBody?: string;
}

export default function ReviewVerdictButtons({ draftId, originalBody = "" }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [editedBody, setEditedBody] = useState(originalBody);
  const submit = useSubmitAutopilotFeedback();

  const handleApprove = () => {
    submit.mutate({ draft_id: draftId, human_verdict: "approve" }, {
      onSuccess: () => toast.success("Approved"),
      onError: (e: unknown) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };
  const handleEdit = () => {
    submit.mutate({ draft_id: draftId, human_verdict: "edit", draft_body_final: editedBody }, {
      onSuccess: (data: { edit_distance: number }) => {
        toast.success(`Gespeichert (${data.edit_distance} Zeichen editiert)`);
        setEditMode(false);
      },
      onError: (e: unknown) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };
  const handleReject = () => {
    submit.mutate({ draft_id: draftId, human_verdict: "reject" }, {
      onSuccess: () => toast.success("Rejected"),
      onError: (e: unknown) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };

  if (editMode) {
    return (
      <div className="space-y-2 w-full">
        <Textarea value={editedBody} onChange={(e) => setEditedBody(e.target.value)}
          rows={8} className="font-mono text-xs" />
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="default" onClick={handleEdit}
            disabled={submit.isPending || editedBody === originalBody}>
            Speichern
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Abbrechen</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5 flex-shrink-0">
      <Button size="sm" variant="default" onClick={handleApprove} disabled={submit.isPending}>
        <Check className="h-3.5 w-3.5 mr-1" /> Approve
      </Button>
      <Button size="sm" variant="outline" onClick={() => setEditMode(true)} disabled={submit.isPending}>
        <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
      </Button>
      <Button size="sm" variant="destructive" onClick={handleReject} disabled={submit.isPending}>
        <X className="h-3.5 w-3.5 mr-1" /> Reject
      </Button>
    </div>
  );
}
