import { applicationFolderName } from "@/core/application/folder";
import { isLanguageCode } from "@/core/application/languages";
import { LlmError } from "@/core/llm";
import { stringifyFrontmatter } from "@/core/markdown/frontmatter";
import { analysePosting } from "@/core/pipeline/analyse-posting";
import { tailorResume } from "@/core/pipeline/tailor-resume";
import { llmClient } from "@/app/llm";
import { profileStore, readSelectedProfile } from "@/app/profiles";
import type { RunEvent } from "@/app/run-events";
import { M0_TEMPLATE, templateStore } from "@/app/templates";

const MAX_POSTING_CHARS = 50_000;

/** Runs the pipeline for the selected profile and streams its progress (F09, F12–F14, F25, F30). */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { posting?: unknown; language?: unknown } | null;
  const posting = typeof body?.posting === "string" ? body.posting.trim() : "";
  const language = typeof body?.language === "string" && body.language !== "" ? body.language : null;
  if (posting === "") return Response.json({ error: "Paste the job posting first." }, { status: 400 });
  if (posting.length > MAX_POSTING_CHARS) {
    return Response.json({ error: `The posting is longer than ${MAX_POSTING_CHARS} characters.` }, { status: 400 });
  }
  if (language !== null && !isLanguageCode(language)) {
    return Response.json({ error: "Unknown resume language." }, { status: 400 });
  }

  const store = profileStore();
  const slug = await readSelectedProfile((await store.listProfiles()).slugs);
  if (!slug) return Response.json({ error: "Choose a profile first." }, { status: 400 });
  const loaded = await store.loadProfile(slug);
  if (!loaded.ok) return Response.json({ error: "Fix the profile's problems first." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const llm = llmClient();
        const now = () => new Date();

        send({ type: "step", step: "analyse", status: "running" });
        const { job, analysis } = await analysePosting({ llm, profile: loaded.profile, posting, now });
        send({ type: "step", step: "analyse", status: "done" });

        send({ type: "step", step: "save", status: "running" });
        const id = await store.createApplication(slug, applicationFolderName(localDate(), job.company, job.role), {
          "job.md": stringifyFrontmatter(job, `${posting}\n`),
          "analysis.md": stringifyFrontmatter(analysis),
        });
        send({ type: "step", step: "save", status: "done" });
        send({ type: "saved", id });

        send({ type: "step", step: "tailor", status: "running" });
        // Without a usable template the run stops here; the analysis stays saved (Art. VII.4).
        const template = await templateStore().loadTemplate(M0_TEMPLATE);
        if (!template.ok) {
          throw new Error(`${template.error.file} isn't ready: ${template.error.problems.join("; ")}`);
        }
        const resume = await tailorResume({
          llm,
          profile: loaded.profile,
          posting,
          analysis,
          template: template.template,
          language: language ?? job.language,
          now,
        });
        await store.addApplicationFile(slug, id, "resume.md", stringifyFrontmatter(resume));
        send({ type: "step", step: "tailor", status: "done" });
        send({ type: "done", id });
      } catch (error) {
        send({ type: "error", message: errorMessage(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Today's date on this machine, as YYYY-MM-DD. */
function localDate(): string {
  return new Date().toLocaleDateString("en-CA");
}

function errorMessage(error: unknown): string {
  if (error instanceof LlmError) return error.message;
  // Unexpected errors carry file paths at most, never profile or posting text (Art. III.4).
  console.error(error);
  return error instanceof Error ? error.message : "Something went wrong. See the server console.";
}
