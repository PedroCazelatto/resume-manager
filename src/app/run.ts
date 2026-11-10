import { isLanguageCode } from "@/core/application/languages";
import { LlmError } from "@/core/llm";
import { runApplication, type RunEvent, type RunInput } from "@/core/pipeline/run";
import { llmClient } from "@/app/llm";
import { profileStore, readSelectedProfile } from "@/app/profiles";
import { M0_TEMPLATE, templateStore } from "@/app/templates";

/** Reads the optional resume language from a request body; `error` when it isn't a known code. */
export function readLanguage(value: unknown): { language: string | null } | { error: Response } {
  const language = typeof value === "string" && value !== "" ? value : null;
  if (language !== null && !isLanguageCode(language)) {
    return { error: Response.json({ error: "Unknown resume language." }, { status: 400 }) };
  }
  return { language };
}

/**
 * Runs the pipeline for the selected profile and streams its progress, one JSON event
 * per line (F30). Used by a new run and by "Try again" on a saved application (F19).
 */
export async function streamRun(start: RunInput["start"], language: string | null): Promise<Response> {
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
        await runApplication({
          llm: llmClient(),
          profile: loaded.profile,
          // Every file belongs to the selected profile (Art. III.7).
          files: {
            create: (baseName, files) => store.createApplication(slug, baseName, files),
            read: (id, file) => store.readApplicationFile(slug, id, file),
            add: (id, file, content) => store.addApplicationFile(slug, id, file, content),
            replace: (id, file, content) => store.replaceApplicationFile(slug, id, file, content),
          },
          loadTemplate: (country) => templateStore().loadTemplate(country),
          template: M0_TEMPLATE,
          start,
          language,
          now: () => new Date(),
          // Today's date on this machine, as YYYY-MM-DD.
          today: () => new Date().toLocaleDateString("en-CA"),
          send,
        });
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

function errorMessage(error: unknown): string {
  if (error instanceof LlmError) return error.message;
  // Unexpected errors carry file paths at most, never profile or posting text (Art. III.4).
  console.error(error);
  return error instanceof Error ? error.message : "Something went wrong. See the server console.";
}
