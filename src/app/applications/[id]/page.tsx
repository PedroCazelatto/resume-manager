import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnalysisView } from "@/components/analysis-view";
import { FileProblems } from "@/components/file-problems";
import { RetryRun } from "@/components/retry-run";
import { ResumeEditor } from "@/components/resume-editor";
import { InferenceList } from "@/components/resume-view";
import { SectionCard } from "@/components/section-card";
import { SourceList } from "@/components/source-list";
import { StatusBadge } from "@/components/status-badge";
import type { ActiveRun } from "@/components/use-active-run";
import { Card, CardContent } from "@/components/ui/card";
import { VerificationView } from "@/components/verification-view";
import { isApplicationId } from "@/core/application/folder";
import { jobTitle } from "@/core/application/job";
import { analysisSchema, jobSchema } from "@/core/application/schemas";
import { languageName } from "@/core/application/languages";
import { validateMarkdownFile, type FileError } from "@/core/markdown/validate";
import { impliedSkillOptions, type SkillOptions } from "@/core/profile/add-skill";
import { listProfileFiles, type Profile } from "@/core/profile/profile";
import { contentYaml } from "@/core/resume/edit";
import { printBlockers } from "@/core/resume/print";
import { renderResume } from "@/core/resume/render";
import { resumeFileSchema, type ResumeFile } from "@/core/resume/schema";
import { citedFileTexts, listSourcedItems } from "@/core/resume/sources";
import { activeRun } from "@/core/runs/reconnect";
import { verificationSchema } from "@/core/verification/schema";
import { profileStore, readSelectedProfile } from "@/app/profiles";
import { runRegistry } from "@/app/run";
import type { RunSummary } from "@/app/runs";
import { templateStore } from "@/app/templates";

export default function ApplicationPage(props: PageProps<"/applications/[id]">) {
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
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

  // A run that is working on this application, or waiting for it, is followed again (F39).
  // Only the selected profile's runs are looked at (Art. III.7).
  const runs = runRegistry().list(slug);
  const generating = followed(activeRun(runs, id, "resume"));
  const verifying = followed(activeRun(runs, id, "verification"));

  const header = (
    <header className="space-y-1">
      {/* The title or the company may be unknown (F46); the link names the job then. */}
      <h1 className="text-2xl font-semibold tracking-tight break-words">
        {[jobTitle(job.data), job.data.company].filter(Boolean).join(" · ") || job.data.url || id}
      </h1>
      <p className="text-sm text-muted-foreground">
        {[job.data.location, job.data.language && languageName(job.data.language)].filter(Boolean).join(" · ")}
      </p>
    </header>
  );
  const retry = (resume === null || verification === null) && (
    <RetryRun id={id} needsResume={resume === null} active={generating} />
  );
  const details = (
    <>
      {analysis?.ok ? (
        <AnalysisView analysis={analysis.data} />
      ) : (
        <p className="text-sm">The analysis has not been saved yet.</p>
      )}
      <Card>
        <CardContent>
          <details className="text-sm">
            <summary className="cursor-pointer text-base font-medium">Job posting</summary>
            <pre className="mt-3 font-sans break-words whitespace-pre-wrap">{job.body}</pre>
          </details>
        </CardContent>
      </Card>
    </>
  );

  if (!resume?.ok || !template?.ok) {
    return (
      <div className="max-w-3xl space-y-6">
        {header}
        {retry}
        {details}
      </div>
    );
  }

  // Two columns on wide screens: the resume stays in view on the left, the rest scrolls on the right (F35).
  return (
    <div className="space-y-6">
      {header}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <div className="xl:sticky xl:top-8 xl:max-h-[calc(100svh-4rem)] xl:overflow-y-auto xl:[scrollbar-gutter:stable]">
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
            active={verifying}
          />
        </div>
        <div className="space-y-6">
          <SectionCard
            title="Resume"
            description={languageName(resume.data.language)}
            action={
              <StatusBadge tone={resume.data.status === "ready" ? "green" : "amber"}>{resume.data.status}</StatusBadge>
            }
          />
          {retry}
          <InferenceList
            id={id}
            inferences={resume.data.inferences}
            options={profile?.ok ? skillOptions(resume.data, profile.profile) : {}}
            files={citedFiles}
          />
          {verification?.ok && <VerificationView id={id} verification={verification.data} />}
          <SourceList items={sourcedItems} files={citedFiles} />
          {details}
        </div>
      </div>
    </div>
  );
}

/** What the browser needs of a run to follow it; nothing else of the run is sent. */
function followed(run: RunSummary | null): ActiveRun | null {
  return run && { runId: run.runId, kind: run.kind };
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
