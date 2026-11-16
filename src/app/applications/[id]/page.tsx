import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnalysisView } from "@/components/analysis-view";
import { FileProblems } from "@/components/file-problems";
import { RetryRun } from "@/components/retry-run";
import { ResumeEditor } from "@/components/resume-editor";
import { InferenceList } from "@/components/resume-view";
import { SourceList } from "@/components/source-list";
import { VerificationView } from "@/components/verification-view";
import { isApplicationId } from "@/core/application/folder";
import { analysisSchema, jobSchema } from "@/core/application/schemas";
import { languageName } from "@/core/application/languages";
import { validateMarkdownFile, type FileError } from "@/core/markdown/validate";
import { impliedSkillOptions, type SkillOptions } from "@/core/profile/add-skill";
import { listProfileFiles, type Profile } from "@/core/profile/profile";
import { contentYaml } from "@/core/resume/edit";
import { renderResume } from "@/core/resume/render";
import { resumeFileSchema, type ResumeFile } from "@/core/resume/schema";
import { citedFileTexts, listSourcedItems } from "@/core/resume/sources";
import { verificationSchema, type Verification } from "@/core/verification/schema";
import { profileStore, readSelectedProfile } from "@/app/profiles";
import { templateStore } from "@/app/templates";

export default function ApplicationPage(props: PageProps<"/applications/[id]">) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← Resume Manager
      </Link>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading application…</p>}>
        <Application params={props.params} />
      </Suspense>
    </main>
  );
}

async function Application({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isApplicationId(id)) notFound();

  // Applications are always read from the selected profile (Art. III.7).
  const store = profileStore();
  const slug = await readSelectedProfile((await store.listProfiles()).slugs);
  if (!slug) return <p className="text-sm">Choose a profile on the home page first.</p>;

  const [jobSource, analysisSource, resumeSource, verificationSource] = await Promise.all([
    store.readApplicationFile(slug, id, "job.md"),
    store.readApplicationFile(slug, id, "analysis.md"),
    store.readApplicationFile(slug, id, "resume.md"),
    store.readApplicationFile(slug, id, "verification.md"),
  ]);
  if (jobSource === null) notFound();

  const job = validateMarkdownFile(jobSchema, "job.md", jobSource);
  const analysis = analysisSource === null ? null : validateMarkdownFile(analysisSchema, "analysis.md", analysisSource);
  const resume = resumeSource === null ? null : validateMarkdownFile(resumeFileSchema, "resume.md", resumeSource);
  const verification =
    verificationSource === null ? null : validateMarkdownFile(verificationSchema, "verification.md", verificationSource);
  const template = resume?.ok ? await templateStore().loadTemplate(resume.data.template) : null;
  const errors: FileError[] = [
    ...[job, analysis, resume, verification].flatMap((file) => (file && !file.ok ? [file.error] : [])),
    ...(template && !template.ok ? [template.error] : []),
  ];
  if (errors.length > 0) {
    return (
      <FileProblems
        title="This application has problems"
        hint={`Fix these files in applications/${id}/, then reload.`}
        errors={errors}
      />
    );
  }
  if (!job.ok) return null;

  // Only the files this resume cites, in its items or its implied skills, reach the browser (F18).
  const sourcedItems = resume?.ok ? listSourcedItems(resume.data) : [];
  const profile = resume?.ok ? await store.loadProfile(slug) : null;
  const citedFiles =
    resume?.ok && profile?.ok
      ? citedFileTexts([...sourcedItems, ...resume.data.inferences], listProfileFiles(profile.profile))
      : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {job.data.role} · {job.data.company}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[job.data.location, languageName(job.data.language)].filter(Boolean).join(" · ")}
        </p>
      </header>
      {resume?.ok && template?.ok && (
        <section className="relative space-y-3">
          <h2 className="font-medium">
            Resume · {languageName(resume.data.language)} · {resume.data.status}
          </h2>
          <ResumeEditor
            // A new key resets the editor when the saved file changes.
            key={resumeSource}
            id={id}
            yaml={contentYaml(resume.data)}
            html={renderResume(template.template, {
              content: resume.data,
              language: resume.data.language,
              inferences: resume.data.inferences,
            })}
            maxPages={template.template.maxPages}
            blockers={printBlockers(resume.data, verification?.ok ? verification.data : null)}
            reviewCurrent={verification?.ok === true && verification.data.review?.current === true}
          />
          {/* Beside the preview when the window has room for it, under it otherwise. */}
          <SourceList
            items={sourcedItems}
            files={citedFiles}
            className="xl:absolute xl:top-0 xl:left-full xl:ml-6 xl:w-64"
          />
          <InferenceList
            id={id}
            inferences={resume.data.inferences}
            options={profile?.ok ? skillOptions(resume.data, profile.profile) : {}}
            files={citedFiles}
          />
          {verification?.ok && <VerificationView id={id} verification={verification.data} />}
        </section>
      )}
      {(resume === null || verification === null) && <RetryRun id={id} needsResume={resume === null} />}
      {analysis?.ok ? (
        <AnalysisView analysis={analysis.data} />
      ) : (
        <p className="text-sm">The analysis has not been saved yet.</p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Job posting</summary>
        <pre className="mt-2 whitespace-pre-wrap font-sans">{job.body}</pre>
      </details>
    </div>
  );
}

/** The headings of skills.md each approved implied skill it doesn't list yet can go under (F07). */
function skillOptions(resume: ResumeFile, profile: Profile): Record<string, SkillOptions> {
  const options: Record<string, SkillOptions> = {};
  for (const { skill } of resume.inferences) {
    const offered = impliedSkillOptions(resume, profile.skills.source, skill);
    if (offered) options[skill] = offered;
  }
  return options;
}

/** Why the resume is still a draft, in the user's words (F24). */
function printBlockers(resume: ResumeFile, verification: Verification | null): string[] {
  const pending = resume.inferences.filter((i) => i.status === "pending").length;
  const open = verification?.failures.filter((f) => !f.dismissed).length ?? 0;
  return [
    ...(pending > 0 ? [`you approve or reject ${pending} implied skill${pending === 1 ? "" : "s"}`] : []),
    ...(open > 0 ? [`${open} failed check${open === 1 ? " is" : "s are"} fixed or dismissed`] : []),
    ...(verification?.review?.current ? [] : ["the model review has run on the current content"]),
  ];
}
