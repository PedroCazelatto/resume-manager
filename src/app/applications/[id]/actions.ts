"use server";

import { revalidatePath } from "next/cache";
import { isApplicationId } from "@/core/application/folder";
import { patchFrontmatter } from "@/core/markdown/frontmatter";
import { validateMarkdownFile } from "@/core/markdown/validate";
import { resumeFileSchema, type Inference } from "@/core/resume/schema";
import { resumeStatus, verificationSchema } from "@/core/verification/schema";
import { profileStore, readSelectedProfile } from "@/app/profiles";

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
