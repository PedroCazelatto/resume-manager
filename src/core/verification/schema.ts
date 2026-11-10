import { z } from "zod";
import type { ResumeFile } from "../resume/schema";

// verification.md frontmatter: what the checks found in resume.md and what the user
// dismissed (constitution Art. II.5, IV.5).

const text = z.string().min(1, "must not be empty");
const timestamp = z.iso.datetime({ offset: true, error: "must be an ISO date-time, e.g. 2026-11-09T14:02:11Z" });

export const failureSchema = z.looseObject({
  /** Which check found it: the code checks (F15) or the model review (F17). */
  check: z.enum(["deterministic", "review"]),
  /** The resume field, e.g. `experience[0].bullets[1]`. */
  where: text,
  /** The resume text that failed. */
  claim: text,
  problem: text,
  /** True once the user dismissed it as a false alarm. */
  dismissed: z.boolean(),
});

export const verificationSchema = z.looseObject({
  /** When the deterministic checks last ran. */
  checked_at: timestamp,
  /** The last model review; `current` turns false when resume.md changes after it. */
  review: z.looseObject({ reviewed_at: timestamp, model: text, current: z.boolean() }).optional(),
  failures: z.array(failureSchema),
});

export type Failure = z.infer<typeof failureSchema>;
export type Verification = z.infer<typeof verificationSchema>;

/**
 * A resume is ready when the model review covers its current content, every failure is
 * fixed or dismissed, and no implied skill is pending (Art. II.3, II.5, VI.7; F24).
 */
export function resumeStatus(
  resume: Pick<ResumeFile, "inferences">,
  verification: Verification | null,
): ResumeFile["status"] {
  const verified = verification?.review?.current === true && verification.failures.every((f) => f.dismissed);
  const decided = resume.inferences.every((i) => i.status !== "pending");
  return verified && decided ? "ready" : "draft";
}
