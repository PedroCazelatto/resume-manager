import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnalysisView } from "@/components/analysis-view";
import { FileProblems } from "@/components/file-problems";
import { InferenceList, ResumePreview } from "@/components/resume-view";
import { isApplicationId } from "@/core/application/folder";
import { analysisSchema, jobSchema } from "@/core/application/schemas";
import { languageName } from "@/core/application/languages";
import { validateMarkdownFile, type FileError } from "@/core/markdown/validate";
import { renderResume } from "@/core/resume/render";
import { resumeFileSchema } from "@/core/resume/schema";
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

  const [jobSource, analysisSource, resumeSource] = await Promise.all([
    store.readApplicationFile(slug, id, "job.md"),
    store.readApplicationFile(slug, id, "analysis.md"),
    store.readApplicationFile(slug, id, "resume.md"),
  ]);
  if (jobSource === null) notFound();

  const job = validateMarkdownFile(jobSchema, "job.md", jobSource);
  const analysis = analysisSource === null ? null : validateMarkdownFile(analysisSchema, "analysis.md", analysisSource);
  const resume = resumeSource === null ? null : validateMarkdownFile(resumeFileSchema, "resume.md", resumeSource);
  const template = resume?.ok ? await templateStore().loadTemplate(resume.data.template) : null;
  const errors: FileError[] = [
    ...[job, analysis, resume].flatMap((file) => (file && !file.ok ? [file.error] : [])),
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
        <section className="space-y-3">
          <h2 className="font-medium">
            Resume · {languageName(resume.data.language)} · {resume.data.status}
          </h2>
          <ResumePreview
            html={renderResume(template.template, {
              content: resume.data,
              language: resume.data.language,
              inferences: resume.data.inferences,
            })}
          />
          <InferenceList inferences={resume.data.inferences} />
        </section>
      )}
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
