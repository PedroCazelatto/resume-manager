"use server";

import { revalidatePath } from "next/cache";
import { isApplicationId } from "@/core/application/folder";
import { patchFrontmatter } from "@/core/markdown/frontmatter";
import { validateMarkdownFile } from "@/core/markdown/validate";
import { LlmError } from "@/core/llm";
import { reviewResume } from "@/core/pipeline/review-resume";
import { contentYaml, parseContentYaml } from "@/core/resume/edit";
import { renderResume } from "@/core/resume/render";
import { resumeFileSchema, type Inference } from "@/core/resume/schema";
import { checkResume } from "@/core/verification/checks";
import { resumeStatus, verificationSchema, type Verification } from "@/core/verification/schema";
import { withChecks, withFullVerification } from "@/core/verification/update";
import { stringifyFrontmatter } from "@/core/markdown/frontmatter";
import { llmClient } from "@/app/llm";
import { profileStore, readSelectedProfile } from "@/app/profiles";
import { templateStore } from "@/app/templates";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; problems: string[] };

/** Reads resume.md and verification.md of an application of the selected profile (Art. III.7). */
async function loadReview(id: string) {
  if (!isApplicationId(id)) throw new Error("Invalid application name");
  const store = profileStore();
  const slug = await readSelectedProfile((await store.listProfiles()).slugs);
  if (!slug) throw new Error("Choose a profile first.");

  const resumeSource = await store.readApplicationFile(slug, id, "resume.md");
  if (resumeSource === null) throw new Error("This application has no resume yet.");
  const resume = validateMarkdownFile(resumeFileSchema, "resume.md", resumeSource);
  if (!resume.ok) throw new Error("resume.md has problems. Fix the file first.");

  const verificationSource = await store.readApplicationFile(slug, id, "verification.md");
  const verification =
    verificationSource === null ? null : validateMarkdownFile(verificationSchema, "verification.md", verificationSource);
  if (verification && !verification.ok) throw new Error("verification.md has problems. Fix the file first.");

  return { store, slug, resumeSource, resume: resume.data, verificationSource, verification: verification?.data ?? null };
}

/** Approves or rejects an implied skill (Art. II.3, F16), then updates the resume's status (F24). */
export async function decideInference(id: string, skill: string, status: Inference["status"]): Promise<void> {
  const { store, slug, resumeSource, resume, verification } = await loadReview(id);
  if (!resume.inferences.some((i) => i.skill === skill)) throw new Error("Unknown implied skill");

  const inferences = resume.inferences.map((i) => (i.skill === skill ? { ...i, status } : i));
  await store.replaceApplicationFile(
    slug,
    id,
    "resume.md",
    patchFrontmatter(resumeSource, { inferences, status: resumeStatus({ inferences }, verification) }),
  );
  revalidatePath(`/applications/${id}`);
}

/** Dismisses a verification failure as a false alarm, or restores it (Art. II.5), then updates the status. */
export async function setFailureDismissed(id: string, index: number, where: string, dismissed: boolean): Promise<void> {
  const { store, slug, resumeSource, resume, verificationSource, verification } = await loadReview(id);
  // `where` guards against a page that is older than the file.
  if (!verification || verificationSource === null || verification.failures[index]?.where !== where) {
    throw new Error("The verification changed. Reload the page.");
  }

  const failures = verification.failures.map((f, i) => (i === index ? { ...f, dismissed } : f));
  await store.replaceApplicationFile(slug, id, "verification.md", patchFrontmatter(verificationSource, { failures }));
  const status = resumeStatus(resume, { ...verification, failures });
  if (status !== resume.status) {
    await store.replaceApplicationFile(slug, id, "resume.md", patchFrontmatter(resumeSource, { status }));
  }
  revalidatePath(`/applications/${id}`);
}

/** Renders edited content for the live preview, without saving anything (F21). */
export async function previewResume(id: string, yaml: string): Promise<ActionResult<{ html: string }>> {
  const parsed = parseContentYaml(yaml);
  if (!parsed.ok) return { ok: false, problems: parsed.error.problems };
  const { resume } = await loadReview(id);
  const template = await templateStore().loadTemplate(resume.template);
  if (!template.ok) return { ok: false, problems: template.error.problems };
  const html = renderResume(template.template, {
    content: parsed.content,
    language: resume.language,
    inferences: resume.inferences,
  });
  return { ok: true, html };
}

/**
 * Saves edited content into resume.md and runs the deterministic checks again. The model
 * review becomes out of date, so the resume goes back to draft (Art. II.5, F21).
 */
export async function saveResume(id: string, yaml: string): Promise<ActionResult> {
  const parsed = parseContentYaml(yaml);
  if (!parsed.ok) return { ok: false, problems: parsed.error.problems };
  const { store, slug, resumeSource, resume, verificationSource, verification } = await loadReview(id);
  const profile = await store.loadProfile(slug);
  if (!profile.ok) return { ok: false, problems: ["Your profile has problems. Fix its files first."] };

  const changed = contentYaml(parsed.content) !== contentYaml(resume);
  const next = withChecks(verification, checkResume(profile.profile, parsed.content), new Date().toISOString(), changed);
  await store.replaceApplicationFile(
    slug,
    id,
    "resume.md",
    patchFrontmatter(resumeSource, { ...parsed.content, status: resumeStatus(resume, next) }),
  );
  await writeVerification(store, slug, id, verificationSource, next);
  revalidatePath(`/applications/${id}`);
  return { ok: true };
}

/** Runs both checks on the saved resume; the model review can take minutes (Art. II.5, F15, F17). */
export async function verifyResume(id: string): Promise<ActionResult> {
  const { store, slug, resumeSource, resume, verificationSource, verification } = await loadReview(id);
  const profile = await store.loadProfile(slug);
  if (!profile.ok) return { ok: false, problems: ["Your profile has problems. Fix its files first."] };

  const checkedAt = new Date().toISOString();
  const found = checkResume(profile.profile, resume);
  let reviewed;
  try {
    reviewed = await reviewResume({ llm: llmClient(), profile: profile.profile, resume, now: () => new Date() });
  } catch (error) {
    if (error instanceof LlmError) return { ok: false, problems: [error.message] };
    throw error;
  }
  const next = withFullVerification(verification, [...found, ...reviewed.failures], checkedAt, reviewed.review);
  await writeVerification(store, slug, id, verificationSource, next);
  const status = resumeStatus(resume, next);
  if (status !== resume.status) {
    await store.replaceApplicationFile(slug, id, "resume.md", patchFrontmatter(resumeSource, { status }));
  }
  revalidatePath(`/applications/${id}`);
  return { ok: true };
}

async function writeVerification(
  store: ReturnType<typeof profileStore>,
  slug: string,
  id: string,
  previousSource: string | null,
  next: Verification,
): Promise<void> {
  if (previousSource === null) await store.addApplicationFile(slug, id, "verification.md", stringifyFrontmatter(next));
  else await store.replaceApplicationFile(slug, id, "verification.md", patchFrontmatter(previousSource, next));
}
