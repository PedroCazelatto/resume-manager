import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnalysisView } from "@/components/analysis-view";
import { FileProblems } from "@/components/file-problems";
import { isApplicationId } from "@/core/application/folder";
import { analysisSchema, jobSchema } from "@/core/application/schemas";
import { validateMarkdownFile, type FileError } from "@/core/markdown/validate";
import { profileStore, readSelectedProfile } from "@/app/profiles";

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

  const [jobSource, analysisSource] = await Promise.all([
    store.readApplicationFile(slug, id, "job.md"),
    store.readApplicationFile(slug, id, "analysis.md"),
  ]);
  if (jobSource === null) notFound();

  const job = validateMarkdownFile(jobSchema, "job.md", jobSource);
  const analysis = analysisSource === null ? null : validateMarkdownFile(analysisSchema, "analysis.md", analysisSource);
  const errors: FileError[] = [job, analysis].flatMap((file) => (file && !file.ok ? [file.error] : []));
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

  const language = new Intl.DisplayNames(["en"], { type: "language" }).of(job.data.language) ?? job.data.language;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {job.data.role} · {job.data.company}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[job.data.location, language].filter(Boolean).join(" · ")}
        </p>
      </header>
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
