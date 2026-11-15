import { z } from "zod";
import type { LlmClient, LlmRequest } from "../llm";
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
}

/** Pipeline step 5, model part: lists the claims the profile doesn't support (Art. II.5, F17). */
export async function reviewResume({ llm, profile, resume, now, onProgress }: ReviewResumeInput): Promise<{
  review: NonNullable<Verification["review"]>;
  failures: Failure[];
}> {
  const claims = resumeClaims(resume, resume.inferences);
  const ids = claims.map((claim) => claim.where) as [string, ...string[]];

  const reply = await llm.generate({
    system: reviewResumeSystem({ code: resume.language, name: languageName(resume.language) }),
    prompt: buildReviewResumePrompt(listProfileFiles(profile), claims),
    schema: reviewReplySchema(ids),
    temperature: 0.1,
    onProgress,
  });

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
