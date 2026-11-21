import { restoredJob } from "@/core/application/archive";
import { APPLICATION_FILES, generationFinished } from "@/core/application/folder";
import { hasPostingText } from "@/core/application/job-file";
import { jobSchema } from "@/core/application/schemas";
import { LlmError } from "@/core/llm";
import { validateMarkdownFile, type FileError } from "@/core/markdown/validate";
import { runApplication } from "@/core/pipeline/run";
import { verifyApplication } from "@/core/pipeline/verify";
import { savedLinks, skipKnownLinks } from "@/core/posting/known-links";
import type { ListedLink } from "@/core/posting/links";
import { isIndeedLink } from "@/core/posting/sites";
import { readNewRunStart } from "@/core/posting/start";
import type { RunKind } from "@/core/runs/queue";
import { createJobFetcher } from "@/adapters/job-fetcher";
import { createApplicationFolders } from "@/app/folders";
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
    read: (id, file) => store.readApplicationFile(slug, id, file),
    add: (id, file, content) => store.addApplicationFile(slug, id, file, content),
    replace: (id, file, content) => store.replaceApplicationFile(slug, id, file, content),
  } satisfies Parameters<typeof runApplication>[0]["files"];
  // The application's folder and job.md were made before the run reached the model (F50).
  const id = run.applicationId;

  try {
    if (id === undefined) throw new Error("This run has no application folder. Add its link again.");
    if (run.kind === "verify") {
      await verifyApplication({ llm: llmClient(), profile: loaded.profile, files, id, now: () => new Date(), send, signal });
    } else {
      await runApplication({
        llm: llmClient(),
        profile: loaded.profile,
        files,
        loadTemplate: (country) => templateStore().loadTemplate(country),
        template: DEFAULT_TEMPLATE,
        start: { id },
        now: () => new Date(),
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

/** The selected profile's application folders, made and written before a run reaches the model (F50). */
const folders = createApplicationFolders(profileStore);

// One registry for the whole server, kept on globalThis so hot reload doesn't duplicate it.
const server = globalThis as typeof globalThis & { resumeRuns?: RunRegistry };

export function runRegistry(): RunRegistry {
  return (server.resumeRuns ??= createRunRegistry(
    executeRun,
    (url, signal) => createJobFetcher().fetchPosting(url, signal),
    Date.now,
    folders,
  ));
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
 * arrives through the run's event stream (F42). Pasted text gets its application's folder and
 * job.md first, with the text, so it survives a restart (F50).
 */
export async function enqueueRun(kind: RunKind, input: RunRequest): Promise<Response> {
  const profile = await readyProfile();
  if ("error" in profile) return profile.error;

  const { start } = input;
  const request =
    "posting" in start && input.applicationId === undefined
      ? { ...input, applicationId: await folders.create(profile.slug, start.url, start.posting) }
      : input;
  return Response.json({ runId: runRegistry().enqueue(profile.slug, kind, request) }, { status: 202 });
}

/**
 * The posting's text, pasted with its link, for a run of the selected profile whose fetch failed
 * or that is an Indeed link's run: the text becomes the body of its application's job.md, every
 * other field kept (F50), and the same run joins the end of the run queue; the answer is its own
 * `{ runId }` with 202 (F48). 400 when the text or its link is missing, 404 for an unknown or
 * another profile's run, 409 for a run that doesn't need its text, or whose job.md is missing or
 * not valid (named with its path and problems, Art. IV.6).
 */
export async function pasteRun(runId: string, body: { posting?: unknown; url?: unknown } | null): Promise<Response> {
  const profile = await readyProfile();
  if ("error" in profile) return profile.error;
  const read = readNewRunStart(body);
  if ("error" in read) return Response.json({ error: read.error }, { status: 400 });

  const registry = runRegistry();
  const refused = (error: string) => Response.json({ error }, { status: 409 });
  const target = registry.pasteTarget(profile.slug, runId);
  if (target === "unknown") return Response.json({ error: "Unknown run." }, { status: 404 });
  if (target === "refused") return refused("This run doesn't need the posting's text.");
  // A run whose folder couldn't be made when its fetch started gets it now, with the text.
  let applicationId = target.applicationId;
  if (applicationId === undefined) applicationId = await folders.create(profile.slug, read.start.url, read.start.posting);
  else {
    const problem = await folders.pasted(profile.slug, applicationId, read.start.posting);
    if (problem !== null) return refused(problem);
  }

  const result = registry.paste(profile.slug, runId, read.start, applicationId);
  if (result === "unknown") return Response.json({ error: "Unknown run." }, { status: 404 });
  if (result === "refused") return refused("This run doesn't need the posting's text.");
  return Response.json({ runId }, { status: 202 });
}

/**
 * Queues one run per link of a list for the selected profile, in the order given (F33), except
 * the links the profile already has, which are skipped (F47). A link whose application failed or
 * was cancelled starts that same application again instead, archived or not (F50). Answers 202
 * with the `runIds` queued, the `skipped` lines with why, and the `problems` of the saved
 * `job.md` files that couldn't be checked. Every link being skipped is not an error.
 */
export async function enqueueLinks(links: readonly ListedLink[]): Promise<Response> {
  const profile = await readyProfile();
  if ("error" in profile) return profile.error;

  const registry = runRegistry();
  const { saved, problems } = await readSavedLinks(profile.slug);
  const kept = skipKnownLinks(links, registry.list(profile.slug), saved);
  const runIds: string[] = [];
  for (const { url, applicationId } of kept.links) {
    if (applicationId !== undefined) {
      const started = await startAgain(profile.slug, applicationId, true);
      if ("error" in started) problems.push(started.error);
      else runIds.push(started.runId);
      continue;
    }
    // An Indeed link is never fetched, so its application is made now, as it is added (F50).
    const indeed = isIndeedLink(url) ? await folders.create(profile.slug, url) : undefined;
    runIds.push(registry.enqueue(profile.slug, "new", { start: { url }, ...(indeed === undefined ? {} : { applicationId: indeed }) }));
  }
  return Response.json({ runIds, skipped: kept.skipped, problems }, { status: 202 });
}

/**
 * The links of the profile's saved applications, from their `job.md` files, and whether each
 * one's generation finished (Art. III.7, F50).
 */
async function readSavedLinks(slug: string): Promise<ReturnType<typeof savedLinks>> {
  const store = profileStore();
  const ids = await store.listApplications(slug);
  const files = await Promise.all(
    ids.map(async (id) => {
      const read = await Promise.all(APPLICATION_FILES.map(async (file) => ({ file, source: await store.readApplicationFile(slug, id, file) })));
      const present = read.filter(({ source }) => source !== null).map(({ file }) => file);
      return { id, source: read.find(({ file }) => file === "job.md")?.source ?? null, finished: generationFinished(present) };
    }),
  );
  return savedLinks(files.flatMap(({ id, source, finished }) => (source === null ? [] : [{ id, source, finished }])));
}

/**
 * Starts an application of the profile again, as "Try again" does (F19, F50). While its job.md
 * has no posting text, its link is fetched again into it; an Indeed link is listed as needing
 * its text instead, never requested (F47). Otherwise the run continues it from its first step
 * without saved output. `unarchive` takes it out of the archived list first: `archived_at`
 * leaves its job.md and its runs come back to the Runs list (F48). Answers the new run's ID, or
 * a job.md that is missing or not valid, which is left as it is (Art. IV.6).
 */
async function startAgain(slug: string, id: string, unarchive: boolean): Promise<{ runId: string } | { error: FileError }> {
  const store = profileStore();
  const file = `applications/${id}/job.md`;
  const source = await store.readApplicationFile(slug, id, "job.md");
  if (source === null) return { error: { file, problems: ["the file doesn't exist"] } };
  const job = validateMarkdownFile(jobSchema, file, source);
  if (!job.ok) return { error: job.error };

  const registry = runRegistry();
  if (unarchive && job.data.archived_at !== undefined) {
    const restored = restoredJob(source, file);
    if (restored.ok) await store.replaceApplicationFile(slug, id, "job.md", restored.source);
    registry.restore(slug, { applicationId: id });
  }
  const { url } = job.data;
  const start = hasPostingText(job.body) || url === undefined ? { id } : { url };
  return { runId: registry.enqueue(slug, "retry", { start, applicationId: id }) };
}

/**
 * "Try again" on an application's page (F19): starts it again as `startAgain` does, so an
 * application whose posting's text never arrived has its link fetched again (F50). It stays
 * archived if it was (F48). A job.md that is missing or not valid is left for the run to
 * report, as before. Answers `{ runId }` with 202.
 */
export async function retryApplication(id: string): Promise<Response> {
  const profile = await readyProfile();
  if ("error" in profile) return profile.error;

  const started = await startAgain(profile.slug, id, false);
  const runId = "error" in started ? runRegistry().enqueue(profile.slug, "retry", { start: { id } }) : started.runId;
  return Response.json({ runId }, { status: 202 });
}

/**
 * "Try again" for a run that ended before its analysis was saved: queues a new run with
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
