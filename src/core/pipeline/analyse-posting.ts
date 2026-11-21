import { z } from "zod";
import { IMPORTANCE, MATCH_STATUS, WORK_MODELS, languageCode, type Analysis, type Job, type JobDetails } from "../application/schemas";
import { generateWithWarning, LlmError, type LlmClient, type LlmRequest } from "../llm";
import { platformName } from "../posting/sites";
import { listProfileFiles, type Profile } from "../profile/profile";
import { ANALYSE_POSTING_SYSTEM, buildAnalysePostingPrompt } from "../prompts/analyse-posting";
import { postingWithDetails } from "../prompts/posting";

/** A detail the model copies from the posting's text, or null when the text doesn't state it (Art. VI.2). */
const detail = z.string().min(1).nullable();

/** Shape of the model's reply. Sources can only be files that exist in this profile. */
export function analysePostingReplySchema(profileFiles: [string, ...string[]]) {
  return z.object({
    title: detail,
    company: detail,
    location: detail,
    salary: detail,
    work_model: z.enum(WORK_MODELS).nullable(),
    hours: detail,
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
  /** The posting's link, the page its text was read from; job.md's `source` is named from it (F46). */
  url: string;
  /** The details read from the posting's page (F46). Each is kept as it is; the model only fills the others. */
  details?: JobDetails;
  now: () => Date;
  onProgress?: LlmRequest<unknown>["onProgress"];
  /** Called before the model call when the prompt takes more than half of the context window (F40). */
  onWarning?: (message: string) => void;
  signal?: AbortSignal;
}

/** Pipeline steps 2–3 in one model call: analyse the posting, then fit/gap against the profile (F12). */
export async function analysePosting({
  llm,
  profile,
  posting,
  url,
  details = {},
  now,
  onProgress,
  onWarning,
  signal,
}: AnalysePostingInput): Promise<{
  job: Job;
  analysis: Analysis;
}> {
  if (posting.trim() === "") throw new Error("The job posting is empty.");
  const submittedAt = now().toISOString();

  const files = listProfileFiles(profile);
  const paths = files.map((f) => f.file) as [string, ...string[]];
  const reply = await generateWithWarning(
    llm,
    {
      system: ANALYSE_POSTING_SYSTEM,
      // The page's details are untrusted like its text, so they go inside the posting's block (Art. II.7).
      prompt: buildAnalysePostingPrompt(files, postingWithDetails(details, posting)),
      schema: analysePostingReplySchema(paths),
      temperature: 0.1,
      onProgress,
      signal,
    },
    onWarning,
  );

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

  // A detail the page gives is always kept; the model's fills only what the page doesn't give (Art. VI.2).
  const copied: JobDetails = {
    title: reply.title ?? undefined,
    company: reply.company ?? undefined,
    location: reply.location ?? undefined,
    salary: reply.salary ?? undefined,
    work_model: reply.work_model ?? undefined,
    hours: reply.hours ?? undefined,
  };
  const known = (field: keyof JobDetails) => details[field] ?? copied[field];
  const job: Job = {
    title: known("title"),
    company: known("company"),
    company_url: details.company_url,
    url,
    source: platformName(new URL(url)),
    fetched_at: submittedAt,
    language: reply.language,
    location: known("location"),
    salary: known("salary"),
    work_model: details.work_model ?? copied.work_model,
    hours: known("hours"),
  };

  return {
    job: Object.fromEntries(Object.entries(job).filter(([, value]) => value !== undefined)) as Job,
    analysis: {
      generated_at: now().toISOString(),
      model: llm.model,
      requirements: reply.requirements,
      keywords: reply.keywords,
    },
  };
}
