"use client";

import { useState, useTransition } from "react";
import { addSkillToProfile, decideInference } from "@/app/applications/[id]/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SourceFiles, type CitedFiles } from "@/components/source-list";
import { hasHeading, type SkillOptions } from "@/core/profile/add-skill";
import type { Inference } from "@/core/resume/schema";

interface Props {
  id: string;
  inferences: Inference[];
  /** The headings each approved skill that skills.md doesn't list yet can go under, by skill (F07). */
  options: Record<string, SkillOptions>;
  /** The text of the profile files the skills cite; null when the profile can't be read (F18). */
  files: CitedFiles;
}

/** Skills the model inferred; they stay out of the resume until approved (Art. II.3, F16). */
export function InferenceList({ id, inferences, options, files }: Props) {
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
            <SourceFiles sources={inference.sources} files={files} />
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
              {inference.status === "approved" && options[inference.skill] && (
                <AddToProfile id={id} skill={inference.skill} options={options[inference.skill]} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const NEW_SECTION = "new";

/**
 * Writes an approved skill into skills.md under the heading the user picks, only after they
 * confirm it in the dialog (Art. II.3, F07).
 */
function AddToProfile({ id, skill, options }: { id: string; skill: string; options: SkillOptions }) {
  const { headings } = options;
  const [open, setOpen] = useState(false);
  // An existing heading by its position in the list, or a new section.
  const [choice, setChoice] = useState(() =>
    options.preselected === null ? NEW_SECTION : String(headings.indexOf(options.preselected)),
  );
  const [newHeading, setNewHeading] = useState(options.newHeading);
  const [problems, setProblems] = useState<string[]>([]);
  const [adding, startAdding] = useTransition();

  const isNew = choice === NEW_SECTION;
  const heading = isNew ? newHeading.trim() : headings[Number(choice)];
  const nameProblem = !isNew
    ? null
    : heading === ""
      ? "Give the new section a name."
      : hasHeading(headings, heading)
        ? "skills.md already has this heading. Choose it in the list instead."
        : null;
  const items = [
    ...headings.map((label, index) => ({ value: String(index), label })),
    { value: NEW_SECTION, label: "New section" },
  ];

  function confirm() {
    startAdding(async () => {
      const result = await addSkillToProfile(id, skill, { heading, isNew });
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
              <span className="font-mono text-foreground">skills.md</span>, under the heading you choose. Nothing else
              in the file changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Select items={items} value={choice} disabled={adding} onValueChange={(next) => next && setChoice(next)}>
              <SelectTrigger aria-label="Heading in skills.md" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isNew && (
              <>
                <input
                  type="text"
                  aria-label="Name of the new section"
                  aria-invalid={nameProblem !== null}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30"
                  value={newHeading}
                  disabled={adding}
                  onChange={(event) => setNewHeading(event.target.value)}
                />
                <p className={nameProblem ? "text-destructive" : "text-muted-foreground"}>
                  {nameProblem ?? "The new section goes at the end of the file."}
                </p>
              </>
            )}
          </div>
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
            <Button type="button" onClick={confirm} disabled={adding || nameProblem !== null}>
              {adding ? "Adding…" : "Add to my profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
