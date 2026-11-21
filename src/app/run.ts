import { LlmError } from "@/core/llm";
import { runApplication } from "@/core/pipeline/run";
import { verifyApplication } from "@/core/pipeline/verify";
import { savedLinks, skipKnownLinks } from "@/core/posting/known-links";
import type { ListedLink } from "@/core/posting/links";
import type { RunKind } from "@/core/runs/queue";
import { createJobFetcher } from "@/adapters/job-fetcher";
import { llmClient } from "@/app/llm";
import { profileStore, readSelectedProfile } from "@/app/profiles";
import { createRunRegistry, type AppRun, type ExecuteRun, type RunRegistry, type RunRequest } from "@/app/runs";
import { DEFAULT_TEMPLATE, templateStore } from "@/app/templates";

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
  const { start } = run.input;

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
 * Queues one new run per link of a list for the selected profile, in the order given (F33),
 * except the links the profile already has, which are skipped (F47). Answers 202 with the
 * `runIds` queued, the `skipped` lines with why, and the `problems` of the saved `job.md`
 * files that couldn't be checked. Every link being skipped is not an error.
 */
export async function enqueueLinks(links: readonly ListedLink[]): Promise<Response> {
  const profile = await readyProfile();
  if ("error" in profile) return profile.error;

  const registry = runRegistry();
  const { saved, problems } = await readSavedLinks(profile.slug);
  const kept = skipKnownLinks(links, registry.list(profile.slug), saved);
  const runIds = kept.links.map((link) => registry.enqueue(profile.slug, "new", { start: { url: link.url } }));
  return Response.json({ runIds, skipped: kept.skipped, problems }, { status: 202 });
}

/** The links of the profile's saved applications, from their `job.md` files (Art. III.7). */
async function readSavedLinks(slug: string): Promise<ReturnType<typeof savedLinks>> {
  const store = profileStore();
  const ids = await store.listApplications(slug);
  const files = await Promise.all(ids.map(async (id) => ({ id, source: await store.readApplicationFile(slug, id, "job.md") })));
  return savedLinks(files.flatMap(({ id, source }) => (source === null ? [] : [{ id, source }])));
}

/**
 * "Try again" for a run that ended before its application was saved: queues a new run with
 * the posting the server kept with it, and answers `{ runId }` (F19).
 */
export async function retryRun(runId: string): Promise<Response> {
  const profile = await readyProfile();
  if ("error" in profile) return profile.error;

  const result = runRegistry().retry(profile.slug, runId);
  if (result === "unknown") return Response.json({ error: "Unknown run." }, { status: 404 });
  if (result === "refused") return Response.json({ error: "This run can't be tried again from here." }, { status: 409 });
  return Response.json(result, { status: 202 });
}
