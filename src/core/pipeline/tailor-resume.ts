import { stringify } from "yaml";
import { z } from "zod";
import type { Analysis } from "../application/schemas";
import { LlmError, type LlmClient, type LlmRequest } from "../llm";
import { languageName } from "../application/languages";
import { listProfileFiles, type Profile } from "../profile/profile";
import { buildTailorResumePrompt, tailorResumeSystem } from "../prompts/tailor-resume";
import { resumeContentSchema, type ResumeFile } from "../resume/schema";
import type { ResumeTemplate } from "../template/template";

/**
 * Shape of the model's reply: the resume content minus the contact block (copied from
 * personal.md by code), plus the inferred skills. Sources can only be real profile files.
 */
export function tailorReplySchema(profileFiles: [string, ...string[]]) {
  const sources = z.array(z.enum(profileFiles));
  const shape = resumeContentSchema.shape;
  const withSources = <T extends z.ZodRawShape>(item: z.ZodObject<T>) => item.extend({ sources });
  const extra = withSources(shape.extras.shape.availability.element);
  return z.object({
    labels: shape.labels,
    summary: shape.summary,
    summary_sources: sources,
    skills: shape.skills,
    experience: z.array(withSources(shape.experience.element)),
    education: z.array(withSources(shape.education.element)),
    projects: z.array(withSources(shape.projects.element)),
    certifications: z.array(withSources(shape.certifications.element)),
    languages: z.array(withSources(shape.languages.element)),
    extras: z.object({
      volunteering: z.array(extra),
      award: z.array(extra),
      publication: z.array(extra),
      interest: z.array(extra),
      availability: z.array(extra),
      other: z.array(extra),
    }),
    inferences: z.array(z.object({ skill: z.string().min(1), sources: z.array(z.enum(profileFiles)).min(1), reason: z.string().min(1) })),
  });
}

export interface TailorResumeInput {
  llm: LlmClient;
  profile: Profile;
  posting: string;
  analysis: Analysis;
  template: ResumeTemplate;
  /** ISO 639-1 code: the posting's language, or the user's choice (Art. VIII.1). */
  language: string;
  now: () => Date;
  onProgress?: LlmRequest<unknown>["onProgress"];
}

/** Pipeline step 4: writes the resume content as a draft, with implied skills pending (F13, F14, F16). */
export async function tailorResume({
  llm,
  profile,
  posting,
  analysis,
  template,
  language,
  now,
  onProgress,
}: TailorResumeInput): Promise<ResumeFile> {
  const files = listProfileFiles(profile);
  const paths = files.map((f) => f.file) as [string, ...string[]];
  const name = languageName(language);

  const reply = await llm.generate({
    system: tailorResumeSystem({ language: { code: language, name }, maxPages: template.maxPages }),
    prompt: buildTailorResumePrompt({
      files,
      posting,
      analysis: stringify({ requirements: analysis.requirements, keywords: analysis.keywords }, { lineWidth: 0 }),
      rules: template.rules,
      layout: template.layout,
      language: { code: language, name },
      maxPages: template.maxPages,
    }),
    schema: tailorReplySchema(paths),
    temperature: 0.3,
    onProgress,
  });

  const personal = profile.personal.data;
  const { inferences, ...content } = reply;

  // An implied skill is held back by its exact name; a different spelling in "skills" would slip through (Art. II.3).
  const items = new Set(content.skills.flatMap((group) => group.items.map((item) => item.trim().toLowerCase())));
  const unmatched = inferences.filter((inference) => !items.has(inference.skill.trim().toLowerCase()));
  if (unmatched.length > 0) {
    throw new LlmError(
      "invalid-output",
      `The model flagged ${unmatched.length} implied skill(s) under a different name than the one it wrote in the skills list. Try again.`,
    );
  }
  return {
    generated_at: now().toISOString(),
    model: llm.model,
    template: template.country,
    language,
    status: "draft",
    inferences: inferences.map((inference) => ({ ...inference, status: "pending" as const })),
    // Copied from personal.md as written, so the model can't alter contact details.
    name: personal.name,
    contact: {
      email: personal.email,
      ...(personal.phone ? { phone: personal.phone } : {}),
      location: { city: personal.location.city, country: personal.location.country },
      ...(personal.work_authorisation ? { work_authorisation: personal.work_authorisation } : {}),
      links: (personal.links ?? []).map(({ label, url }) => ({ label, url })),
    },
    ...content,
  };
}
