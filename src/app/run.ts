import { isLanguageCode } from "@/core/application/languages";
import { LlmError } from "@/core/llm";
import { runApplication } from "@/core/pipeline/run";
import { verifyApplication } from "@/core/pipeline/verify";
import type { RunKind } from "@/core/runs/queue";
import { createJobFetcher } from "@/adapters/job-fetcher";
import { llmClient } from "@/app/llm";
import { profileStore, readSelectedProfile } from "@/app/profiles";
import { createRunRegistry, type AppRun, type ExecuteRun, type RunRegistry, type RunRequest } from "@/app/runs";
import { DEFAULT_TEMPLATE, templateStore } from "@/app/templates";

/** Reads the optional resume language from a request body; `error` when it isn't a known code. */
export function readLanguage(value: unknown): { language: string | null } | { error: Response } {
  const language = typeof value === "string" && value !== "" ? value : null;
  if (language !== null && !isLanguageCode(language)) {
    return { error: Response.json({ error: "Unknown resume language." }, { status: 400 }) };
  }
  return { language };
}

/** Does the work of one queued run for its profile: the pipeline, or "Verify again" (F42). */
const executeRun: ExecuteRun = async (run: AppRun, send, signal) => {
  const store = profileStore();
  const slug = run.profile;
  const loaded = await store.loadProfile(slug);
  if (!loaded.ok) throw new Error("Fix the profile's problems first.");
  // Every file belongs to the run's profile (Art. III.7).
  const files = {
    create: (baseName, initial) => store.createApplication(slug, baseName, initial),
    read: (id, file) => store.readApplicationFile(slug, id, file),
    add: (id, file, content) => store.addApplicationFile(slug, id, file, content),
    replace: (id, file, content) => store.replaceApplicationFile(slug, id, file, content),
  } satisfies Parameters<typeof runApplication>[0]["files"];
  const { start, language } = run.input;

  try {
    if (run.kind === "verify") {
      if (!("id" in start)) throw new Error("Only a saved application can be verified.");
      await verifyApplication({ llm: llmClient(), profile: loaded.profile, files, id: start.id, now: () => new Date(), send, signal });
    } else {
      // A link's posting is fetched before its run reaches this point (F10).
      if (!("posting" in start) && !("id" in start)) throw new Error("This run's posting was never fetched.");
      await runApplication({
        llm: llmClient(),
        profile: loaded.profile,
        files,
        loadTemplate: (country) => templateStore().loadTemplate(country),
        template: DEFAULT_TEMPLATE,
        start,
        language,
        now: () => new Date(),
        // Today's date on this machine, as YYYY-MM-DD.
        today: () => new Date().toLocaleDateString("en-CA"),
        send,
        signal,
      });
    }
  } catch (error) {
    // Unexpected errors carry file paths at most, never profile or posting text (Art. III.4).
    if (!(error instanceof LlmError)) console.error(error);
    throw error;
  }
};

// One registry for the whole server, kept on globalThis so hot reload doesn't duplicate it.
const server = globalThis as typeof globalThis & { resumeRuns?: RunRegistry };

export function runRegistry(): RunRegistry {
  return (server.resumeRuns ??= createRunRegistry(executeRun, (url, signal) => createJobFetcher().fetchPosting(url, signal)));
}

/** The selected profile, or the response that says there is none. */
export async function selectedProfile(): Promise<{ slug: string } | { error: Response }> {
  const slug = await readSelectedProfile((await profileStore().listProfiles()).slugs);
  return slug ? { slug } : { error: Response.json({ error: "Choose a profile first." }, { status: 400 }) };
}

/** The selected profile once its files load, or the response that says what is wrong. */
async function readyProfile(): Promise<{ slug: string } | { error: Response }> {
  const selected = await selectedProfile();
  if ("error" in selected) return selected;
  const loaded = await profileStore().loadProfile(selected.slug);
  if (!loaded.ok) return { error: Response.json({ error: "Fix the profile's problems first." }, { status: 400 }) };
  return selected;
}

/**
 * Queues a run for the selected profile and answers `{ runId }` right away; its progress
 * arrives through the run's event stream (F42). `replaces` is the run whose failed fetch
 * this one's pasted posting makes up for (F10).
 */
export async function enqueueRun(kind: RunKind, input: RunRequest, replaces?: string): Promise<Response> {
  const profile = await readyProfile();
  if ("error" in profile) return profile.error;

  return Response.json({ runId: runRegistry().enqueue(profile.slug, kind, input, replaces) }, { status: 202 });
}

/**
 * "Try again" for a run that ended before its application was saved: queues a new run with
 * the posting and language the server kept with it, and answers `{ runId }` (F19).
 */
export async function retryRun(runId: string): Promise<Response> {
  const profile = await readyProfile();
  if ("error" in profile) return profile.error;

  const result = runRegistry().retry(profile.slug, runId);
  if (result === "unknown") return Response.json({ error: "Unknown run." }, { status: 404 });
  if (result === "refused") return Response.json({ error: "This run can't be tried again from here." }, { status: 409 });
  return Response.json(result, { status: 202 });
}
