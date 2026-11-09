import { applicationFolderName } from "@/core/application/folder";
import { LlmError } from "@/core/llm";
import { stringifyFrontmatter } from "@/core/markdown/frontmatter";
import { analysePosting } from "@/core/pipeline/analyse-posting";
import { llmClient } from "@/app/llm";
import { profileStore, readSelectedProfile } from "@/app/profiles";
import type { RunEvent } from "@/app/run-events";

const MAX_POSTING_CHARS = 50_000;

/** Starts a run for the selected profile and streams its progress (F09, F12, F25, F30). */
export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const posting =
    typeof body === "object" && body !== null && "posting" in body && typeof body.posting === "string"
      ? body.posting.trim()
      : "";
  if (posting === "") return Response.json({ error: "Paste the job posting first." }, { status: 400 });
  if (posting.length > MAX_POSTING_CHARS) {
    return Response.json({ error: `The posting is longer than ${MAX_POSTING_CHARS} characters.` }, { status: 400 });
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
        send({ type: "step", step: "analyse", status: "running" });
        const { job, analysis } = await analysePosting({
          llm: llmClient(),
          profile: loaded.profile,
          posting,
          now: () => new Date(),
        });
        send({ type: "step", step: "analyse", status: "done" });

        send({ type: "step", step: "save", status: "running" });
        const id = await store.createApplication(slug, applicationFolderName(localDate(), job.company, job.role), {
          "job.md": stringifyFrontmatter(job, `${posting}\n`),
          "analysis.md": stringifyFrontmatter(analysis),
        });
        send({ type: "step", step: "save", status: "done" });
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
