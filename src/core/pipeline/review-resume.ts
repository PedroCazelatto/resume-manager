import { z } from "zod";
import { generateWithWarning, type LlmClient, type LlmRequest } from "../llm";
import { languageName } from "../application/languages";
import { listProfileFiles, type Profile } from "../profile/profile";
import { buildReviewResumePrompt, reviewResumeSystem } from "../prompts/review-resume";
import type { ResumeFile } from "../resume/schema";
import { resumeClaims } from "../verification/claims";
import type { Failure, Verification } from "../verification/schema";

/** Shape of the model's reply. It can only point at claims that are in the resume. */
export function reviewReplySchema(claimIds: [string, ...string[]]) {
  return z.object({
    unsupported: z.array(z.object({ id: z.enum(claimIds), problem: z.string().min(1) })),
  });
}

export interface ReviewResumeInput {
  llm: LlmClient;
  profile: Profile;
  resume: ResumeFile;
  now: () => Date;
  onProgress?: LlmRequest<unknown>["onProgress"];
  /** Called before the model call when the prompt takes more than half of the context window (F40). */
  onWarning?: (message: string) => void;
  signal?: AbortSignal;
}

/** Pipeline step 5, model part: lists the claims the profile doesn't support (Art. II.5, F17). */
export async function reviewResume({ llm, profile, resume, now, onProgress, onWarning, signal }: ReviewResumeInput): Promise<{
  review: NonNullable<Verification["review"]>;
  failures: Failure[];
}> {
  const claims = resumeClaims(resume, resume.inferences);
  const ids = claims.map((claim) => claim.where) as [string, ...string[]];

  const reply = await generateWithWarning(
    llm,
    {
      system: reviewResumeSystem({ code: resume.language, name: languageName(resume.language) }),
      prompt: buildReviewResumePrompt(listProfileFiles(profile), claims),
      schema: reviewReplySchema(ids),
      temperature: 0.1,
      onProgress,
      signal,
    },
    onWarning,
  );

  const text = new Map(claims.map((claim) => [claim.where, claim.text]));
  return {
    review: { reviewed_at: now().toISOString(), model: llm.model, current: true },
    failures: reply.unsupported.map(({ id, problem }) => ({
      check: "review" as const,
      where: id,
      claim: text.get(id) ?? id,
      problem,
      dismissed: false,
    })),
  };
}
