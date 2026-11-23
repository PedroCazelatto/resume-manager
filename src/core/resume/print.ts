import type { Verification } from "../verification/schema";
import type { ResumeFile } from "./schema";

/**
 * Why a resume can't be printed yet, in the user's words, or nothing once it can (Art. VI.7,
 * F24): an implied skill still pending, a failed check that isn't fixed or dismissed, or a model
 * review that hasn't covered the current content. The application page's "Print / Save as PDF"
 * and the home page's "View PDF" read the same list (F22, F26).
 */
export function printBlockers(resume: Pick<ResumeFile, "inferences">, verification: Verification | null): string[] {
  const pending = resume.inferences.filter((i) => i.status === "pending").length;
  const open = verification?.failures.filter((f) => !f.dismissed).length ?? 0;
  return [
    ...(pending > 0 ? [`you approve or reject ${pending} implied skill${pending === 1 ? "" : "s"}`] : []),
    ...(open > 0 ? [`${open} failed check${open === 1 ? " is" : "s are"} fixed or dismissed`] : []),
    ...(verification?.review?.current ? [] : ["the model review has run on the current content"]),
  ];
}
