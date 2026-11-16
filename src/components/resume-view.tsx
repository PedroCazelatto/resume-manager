"use client";

import { useState, useTransition } from "react";
import { addSkillToProfile, decideInference } from "@/app/applications/[id]/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SkillPlacement } from "@/core/profile/add-skill";
import type { Inference } from "@/core/resume/schema";

interface Props {
  id: string;
  inferences: Inference[];
  /** Where each approved skill that skills.md doesn't list yet would go, by skill (F07). */
  placements: Record<string, SkillPlacement>;
}

/** Skills the model inferred; they stay out of the resume until approved (Art. II.3, F16). */
export function InferenceList({ id, inferences, placements }: Props) {
  if (inferences.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-medium">Implied skills</h2>
      <p className="text-sm text-muted-foreground">
        Your profile implies these skills without stating them. They stay out of the resume until you approve them.
      </p>
      <ul className="space-y-2 text-sm">
        {inferences.map((inference) => (
          <li key={inference.skill}>
            <strong>{inference.skill}</strong> · {inference.status}
            <div>{inference.reason}</div>
            <div className="font-mono text-xs text-muted-foreground">{inference.sources.join(", ")}</div>
            <div className="mt-1 flex gap-2">
              <form action={decideInference.bind(null, id, inference.skill, "approved")}>
                <Button type="submit" variant="outline" size="sm" disabled={inference.status === "approved"}>
                  Approve
                </Button>
              </form>
              <form action={decideInference.bind(null, id, inference.skill, "rejected")}>
                <Button type="submit" variant="outline" size="sm" disabled={inference.status === "rejected"}>
                  Reject
                </Button>
              </form>
              {inference.status === "approved" && placements[inference.skill] && (
                <AddToProfile id={id} skill={inference.skill} placement={placements[inference.skill]} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Writes an approved skill into skills.md, only after the user confirms it in the dialog (Art. II.3, F07). */
function AddToProfile({ id, skill, placement }: { id: string; skill: string; placement: SkillPlacement }) {
  const [open, setOpen] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [adding, startAdding] = useTransition();

  function confirm() {
    startAdding(async () => {
      const result = await addSkillToProfile(id, skill, placement.heading);
      setProblems(result.ok ? [] : result.problems);
      if (result.ok) setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Add to my profile
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {skill} to your profile?</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{skill}</strong> will be added as one line to{" "}
              <span className="font-mono text-foreground">skills.md</span>, under the{" "}
              {placement.isNew ? "new heading" : "heading"}{" "}
              <strong className="text-foreground">{placement.heading}</strong>
              {placement.isNew && ", at the end of the file"}. Nothing else in the file changes.
            </DialogDescription>
          </DialogHeader>
          {problems.length > 0 && (
            <ul className="text-sm text-destructive">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm} disabled={adding}>
              {adding ? "Adding…" : "Add to my profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
