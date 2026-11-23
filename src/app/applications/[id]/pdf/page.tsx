import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FileProblems } from "@/components/file-problems";
import { PrintableResume } from "@/components/printable-resume";
import { isApplicationId } from "@/core/application/folder";
import { jobHeading } from "@/core/application/job";
import { jobSchema } from "@/core/application/schemas";
import { validateMarkdownFile, type FileError } from "@/core/markdown/validate";
import { printBlockers } from "@/core/resume/print";
import { renderResume } from "@/core/resume/render";
import { resumeFileSchema } from "@/core/resume/schema";
import { verificationSchema } from "@/core/verification/schema";
import { profileStore, readSelectedProfile } from "@/app/profiles";
import { templateStore } from "@/app/templates";

/**
 * The printable resume of an application, which the home page's "View PDF" opens in a new page
 * (F26): the same HTML as the application page's preview and its "Print / Save as PDF"
 * (Art. V.9). A resume that can't be printed yet isn't shown here (Art. VI.7).
 */
export default function PrintablePage(props: PageProps<"/applications/[id]/pdf">) {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the resume…</p>}>
        <Printable params={props.params} />
      </Suspense>
    </main>
  );
}

async function Printable({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isApplicationId(id)) notFound();

  // Applications are always read from the selected profile (Art. III.7).
  const store = profileStore();
  const slug = await readSelectedProfile((await store.listProfiles()).slugs);
  if (!slug) return <p className="text-sm">Choose a profile on the home page first.</p>;

  const [jobSource, resumeSource, verificationSource] = await Promise.all([
    store.readApplicationFile(slug, id, "job.md"),
    store.readApplicationFile(slug, id, "resume.md"),
    store.readApplicationFile(slug, id, "verification.md"),
  ]);
  if (jobSource === null) notFound();

  const job = validateMarkdownFile(jobSchema, "job.md", jobSource);
  const resume = resumeSource === null ? null : validateMarkdownFile(resumeFileSchema, "resume.md", resumeSource);
  const verification =
    verificationSource === null ? null : validateMarkdownFile(verificationSchema, "verification.md", verificationSource);
  const template = resume?.ok ? await templateStore().loadTemplate(resume.data.template) : null;
  const errors: FileError[] = [
    ...[job, resume, verification].flatMap((file) => (file && !file.ok ? [file.error] : [])),
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

  const heading = <h1 className="text-2xl font-semibold tracking-tight break-words">{jobHeading(job.data, id)}</h1>;
  const open = (
    <Link href={`/applications/${id}`} className="text-primary underline underline-offset-2">
      Open the application
    </Link>
  );
  if (!resume?.ok || !template?.ok) {
    return (
      <div className="space-y-3">
        {heading}
        <p className="text-sm">This application has no resume yet. {open}</p>
      </div>
    );
  }

  // The same rule as the application page's "Print / Save as PDF" (Art. VI.7, F24).
  const blockers = printBlockers(resume.data, verification?.ok ? verification.data : null);
  if (blockers.length > 0) {
    return (
      <div className="space-y-3">
        {heading}
        <p className="text-sm">
          This resume can&apos;t be printed yet. Printing unlocks when: {blockers.join("; ")}. {open}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {heading}
      <PrintableResume
        html={renderResume(template.template, {
          content: resume.data,
          language: resume.data.language,
          inferences: resume.data.inferences,
        })}
        maxPages={template.template.maxPages}
      />
    </div>
  );
}
