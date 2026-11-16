import { jobSchema } from "../application/schemas";
import { stopIfCancelled, type LlmClient, type LlmProgress } from "../llm";
import { patchFrontmatter, stringifyFrontmatter } from "../markdown/frontmatter";
import { validateMarkdownFile } from "../markdown/validate";
import type { Profile } from "../profile/profile";
import { resumeFileSchema } from "../resume/schema";
import { checkResume } from "../verification/checks";
import { resumeStatus, verificationSchema } from "../verification/schema";
import { withFullVerification } from "../verification/update";
import { reviewResume } from "./review-resume";
import type { ApplicationFiles, RunEvent } from "./run";

// "Verify again" (Art. II.5): both checks run again on the saved resume. The model review
// can take minutes, so it is a run of its own in the queue (F42).

export interface VerifyInput {
  llm: LlmClient;
  profile: Profile;
  files: Pick<ApplicationFiles, "read" | "add" | "replace">;
  /** The application whose resume is verified. */
  id: string;
  now: () => Date;
  send: (event: RunEvent) => void;
  /** Aborted when the user cancels the run (F32). */
  signal?: AbortSignal;
}

/** Verifies the saved resume, replaces the failures in verification.md and updates the resume's status. */
export async function verifyApplication({ llm, profile, files, id, now, send, signal }: VerifyInput): Promise<string> {
  const resumeSource = await files.read(id, "resume.md");
  if (resumeSource === null) throw new Error("This application has no resume yet.");
  const saved = validateMarkdownFile(resumeFileSchema, "resume.md", resumeSource);
  if (!saved.ok) throw new Error("resume.md has problems. Fix the file first.");
  const resume = saved.data;

  const verificationSource = await files.read(id, "verification.md");
  const previous =
    verificationSource === null ? null : validateMarkdownFile(verificationSchema, "verification.md", verificationSource);
  if (previous && !previous.ok) throw new Error("verification.md has problems. Fix the file first.");

  // Only to name the application when the run ends (F38); verifying doesn't need job.md.
  const jobSource = await files.read(id, "job.md");
  const job = jobSource === null ? null : validateMarkdownFile(jobSchema, "job.md", jobSource);
  send({ type: "saved", id, ...(job?.ok ? { company: job.data.company, role: job.data.role } : {}) });

  stopIfCancelled(signal);
  send({ type: "step", step: "check", status: "running" });
  const checkedAt = now().toISOString();
  const found = checkResume(profile, resume);
  send({ type: "step", step: "check", status: "done" });

  stopIfCancelled(signal);
  send({ type: "step", step: "review", status: "running" });
  const reviewed = await reviewResume({
    llm,
    profile,
    resume,
    now,
    onProgress: (progress: LlmProgress) => send({ type: "progress", step: "review", ...progress }),
    onWarning: (message: string) => send({ type: "warning", step: "review", message }),
    signal,
  });
  const next = withFullVerification(previous?.data ?? null, [...found, ...reviewed.failures], checkedAt, reviewed.review);
  if (verificationSource === null) await files.add(id, "verification.md", stringifyFrontmatter(next));
  else await files.replace(id, "verification.md", patchFrontmatter(verificationSource, next));
  const status = resumeStatus(resume, next);
  if (status !== resume.status) await files.replace(id, "resume.md", patchFrontmatter(resumeSource, { status }));
  send({ type: "step", step: "review", status: "done" });

  send({ type: "done", id });
  return id;
}
