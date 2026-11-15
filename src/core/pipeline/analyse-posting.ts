import { z } from "zod";
import { IMPORTANCE, MATCH_STATUS, languageCode, type Analysis, type Job } from "../application/schemas";
import { LlmError, type LlmClient, type LlmRequest } from "../llm";
import { listProfileFiles, type Profile } from "../profile/profile";
import { ANALYSE_POSTING_SYSTEM, buildAnalysePostingPrompt } from "../prompts/analyse-posting";

/** Shape of the model's reply. Sources can only be files that exist in this profile. */
export function analysePostingReplySchema(profileFiles: [string, ...string[]]) {
  return z.object({
    company: z.string().min(1),
    role: z.string().min(1),
    location: z.string().min(1).nullable(),
    language: languageCode,
    requirements: z.array(
      z.object({
        text: z.string().min(1),
        importance: z.enum(IMPORTANCE),
        status: z.enum(MATCH_STATUS),
        sources: z.array(z.enum(profileFiles)),
        note: z.string(),
      }),
    ),
    keywords: z.array(z.string().min(1)),
  });
}

export interface AnalysePostingInput {
  llm: LlmClient;
  profile: Profile;
  posting: string;
  now: () => Date;
  onProgress?: LlmRequest<unknown>["onProgress"];
}

/** Pipeline steps 2–3 in one model call: analyse the posting, then fit/gap against the profile (F12). */
export async function analysePosting({ llm, profile, posting, now, onProgress }: AnalysePostingInput): Promise<{
  job: Job;
  analysis: Analysis;
}> {
  if (posting.trim() === "") throw new Error("The job posting is empty.");
  const submittedAt = now().toISOString();

  const files = listProfileFiles(profile);
  const paths = files.map((f) => f.file) as [string, ...string[]];
  const reply = await llm.generate({
    system: ANALYSE_POSTING_SYSTEM,
    prompt: buildAnalysePostingPrompt(files, posting),
    schema: analysePostingReplySchema(paths),
    temperature: 0.1,
    onProgress,
  });

  // A match needs evidence and a gap has none (Art. II.6); report the reply instead of fixing it.
  const inconsistent = reply.requirements.filter((r) =>
    r.status === "missing" ? r.sources.length > 0 : r.sources.length === 0,
  );
  if (inconsistent.length > 0) {
    throw new LlmError(
      "invalid-output",
      `The model's analysis is inconsistent: ${inconsistent.length} requirement(s) marked matched or partial without sources, or missing with sources. Try again.`,
    );
  }

  return {
    job: {
      source: "paste",
      fetched_at: submittedAt,
      company: reply.company,
      role: reply.role,
      language: reply.language,
      ...(reply.location ? { location: reply.location } : {}),
    },
    analysis: {
      generated_at: now().toISOString(),
      model: llm.model,
      requirements: reply.requirements,
      keywords: reply.keywords,
    },
  };
}
