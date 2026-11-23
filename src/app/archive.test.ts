import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFsProfileStore } from "@/adapters/profile-store";
import { parseFrontmatter } from "@/core/markdown/frontmatter";
import type { FetchedPosting } from "@/core/posting/job-fetcher";
import { archiveApplication, archiveRun, deleteApplication, restoreApplication, restoreRun } from "./archive";
import { enqueueLinks, runRegistry } from "./run";

// Archiving runs against a scratch copy of the fictional profile (Art. III.5). The model is never
// reached and nothing is fetched, so no test touches the network (Art. IX.2).
const app = vi.hoisted(() => ({ profilesDir: "", modelHangs: false }));

vi.mock("@/app/profiles", () => ({
  profileStore: () => createFsProfileStore(app.profilesDir),
  readSelectedProfile: async () => "jane-doe",
}));
vi.mock("@/adapters/job-fetcher", () => ({
  createJobFetcher: () => ({ fetchPosting: () => new Promise<FetchedPosting>(() => {}) }),
}));
vi.mock("@/app/llm", () => ({
  llmClient: () => {
    if (!app.modelHangs) throw new Error("No model in these tests.");
    // A model call that never returns, so the run stays running and the next one waits.
    return { model: "fake-model", contextTokens: 1_000_000, generate: () => new Promise(() => {}) };
  },
}));

const SAVED = "2026-11-10-globex-ltd-senior-backend-engineer";
/** The example application whose generation never finished: it has no verification.md. */
const UNFINISHED = "2026-11-10-globex-corporation-senior-backend-engineer";
const INDEED = "https://ie.indeed.com/viewjob?jk=1";

let profileDir: string;
const jobFile = () => path.join(profileDir, "applications", SAVED, "job.md");

async function answer(response: Promise<Response>) {
  const reply = await response;
  return { status: reply.status, body: reply.status === 204 ? null : ((await reply.json()) as { error: string }) };
}

const fields = (source: string) => {
  const parsed = parseFrontmatter(source);
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed;
};

/** A failed "Verify again" of the saved application: a run that has an application. */
async function failedVerify(): Promise<string> {
  const runId = runRegistry().enqueue("jane-doe", "verify", { start: { id: SAVED } });
  await vi.waitFor(() => expect(runRegistry().list("jane-doe")[0]).toMatchObject({ runId, status: "failed" }));
  return runId;
}

/** Every file of the profile with its content, to show that nothing else was written. */
async function snapshot(): Promise<Record<string, string>> {
  const files = await readdir(profileDir, { recursive: true, withFileTypes: true });
  const entries = await Promise.all(
    files.filter((file) => file.isFile()).map(async (file) => {
      const full = path.join(file.parentPath, file.name);
      return [path.relative(profileDir, full), await readFile(full, "utf8")] as const;
    }),
  );
  return Object.fromEntries(entries.sort());
}

beforeEach(async () => {
  app.profilesDir = await mkdtemp(path.join(tmpdir(), "resume-archive-"));
  profileDir = path.join(app.profilesDir, "jane-doe");
  await cp(path.resolve("example-profiles", "jane-doe"), profileDir, { recursive: true });
  // A registry of its own for each test.
  delete (globalThis as { resumeRuns?: unknown }).resumeRuns;
  app.modelHangs = false;
  // The failing run's error is printed by the executor; it holds no posting.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(app.profilesDir, { recursive: true, force: true });
});

describe("archiving a run (F48)", () => {
  it("writes archived_at to its application's job.md, keeping every other field and the body, and takes it out of the list", async () => {
    const before = await readFile(jobFile(), "utf8");
    const runId = await failedVerify();

    expect(await answer(archiveRun(runId))).toEqual({ status: 204, body: null });

    const after = fields(await readFile(jobFile(), "utf8"));
    const { archived_at, ...kept } = after.data;
    expect(archived_at).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/));
    expect(kept).toEqual(fields(before).data);
    expect(after.body).toBe(fields(before).body);
    expect(runRegistry().list("jane-doe")).toEqual([]);
    // Written atomically: no temp file is left in the folder (Art. IV.8).
    expect((await readdir(path.dirname(jobFile()))).sort()).toEqual(["analysis.md", "job.md", "resume.md", "verification.md"]);
  });

  it("keeps the application archived after a restart, and restores it by its ID", async () => {
    const before = await readFile(jobFile(), "utf8");
    await archiveRun(await failedVerify());

    // A restart: the runs in memory are gone, job.md isn't.
    delete (globalThis as { resumeRuns?: unknown }).resumeRuns;
    expect(runRegistry().list("jane-doe")).toEqual([]);
    expect(fields(await readFile(jobFile(), "utf8")).data).toHaveProperty("archived_at");
    expect(await answer(archiveApplication(SAVED))).toEqual({ status: 409, body: { error: "This application is already archived." } });

    expect(await answer(restoreApplication(SAVED))).toEqual({ status: 204, body: null });
    expect(fields(await readFile(jobFile(), "utf8"))).toEqual(fields(before));
    expect(await answer(restoreApplication(SAVED))).toEqual({ status: 409, body: { error: "This application isn't archived." } });
  });

  it("restores a run with its application: archived_at leaves job.md, and the run comes back as cancelled", async () => {
    const before = await readFile(jobFile(), "utf8");
    const runId = await failedVerify();
    await archiveRun(runId);

    expect(await answer(restoreRun(runId))).toEqual({ status: 204, body: null });

    expect(fields(await readFile(jobFile(), "utf8"))).toEqual(fields(before));
    expect(runRegistry().list("jane-doe")).toMatchObject([{ runId, status: "cancelled", applicationId: SAVED, archivable: true }]);
    expect(await answer(restoreRun(runId))).toEqual({ status: 409, body: { error: "This run isn't archived." } });
  });

  it("archives an Indeed link's application, made when it was added, in its job.md (F50)", async () => {
    const [runId] = ((await (await enqueueLinks([{ line: 1, text: INDEED, url: INDEED }])).json()) as { runIds: string[] }).runIds;
    const { applicationId } = runRegistry().list("jane-doe")[0];
    const indeedJob = path.join(profileDir, "applications", applicationId!, "job.md");
    const before = await readFile(indeedJob, "utf8");

    expect(await answer(archiveRun(runId))).toEqual({ status: 204, body: null });
    expect(runRegistry().list("jane-doe")).toEqual([]);
    expect(fields(await readFile(indeedJob, "utf8")).data).toEqual({ ...fields(before).data, archived_at: expect.any(String) });

    // A restart: the archived row stays archived in its job.md (F48, F50).
    delete (globalThis as { resumeRuns?: unknown }).resumeRuns;
    expect(await answer(restoreApplication(applicationId!))).toEqual({ status: 204, body: null });
    expect(await readFile(indeedJob, "utf8")).toBe(before);
  });

  it("keeps a run restored with its application as cancelled, still asking for the posting's text", async () => {
    const [runId] = ((await (await enqueueLinks([{ line: 1, text: INDEED, url: INDEED }])).json()) as { runIds: string[] }).runIds;
    await archiveRun(runId);

    expect(await answer(restoreRun(runId))).toEqual({ status: 204, body: null });
    // Back as cancelled, still asking for the posting's text, and still without "Try again" (F47).
    expect(runRegistry().list("jane-doe")).toMatchObject([{ runId, status: "cancelled", fetchFailed: true, retryable: false, url: INDEED }]);
  });

  it("refuses an unknown run, and a run that is still fetching, with nothing written", async () => {
    const link = "https://jobs.example.com/1";
    const [fetching] = ((await (await enqueueLinks([{ line: 1, text: link, url: link }])).json()) as { runIds: string[] }).runIds;
    // Its application's folder is made as its fetch starts (F50).
    await vi.waitFor(() => expect(runRegistry().list("jane-doe")[0].applicationId).toBeDefined());
    const files = await snapshot();

    expect(await answer(archiveRun("no-such-run"))).toEqual({ status: 404, body: { error: "Unknown run." } });
    expect(await answer(restoreRun("no-such-run"))).toEqual({ status: 404, body: { error: "Unknown run." } });
    expect(await answer(archiveRun(fetching))).toEqual({
      status: 409,
      body: { error: "Only a run that ended can be archived, and not while a run of its application is waiting or running." },
    });
    expect(await snapshot()).toEqual(files);
  });

  it("names a job.md that isn't valid, and leaves it and the run as they are (Art. IV.6)", async () => {
    const runId = await failedVerify();
    const broken = (await readFile(jobFile(), "utf8")).replace("language: en", "language: English");
    await writeFile(jobFile(), broken);

    expect(await answer(archiveRun(runId))).toEqual({
      status: 409,
      body: { error: `applications/${SAVED}/job.md has problems: language: must be a two-letter ISO 639-1 code, e.g. en` },
    });
    expect(await readFile(jobFile(), "utf8")).toBe(broken);
    expect(runRegistry().list("jane-doe")).toMatchObject([{ runId, status: "failed", archivable: true }]);
  });
});

describe("archiving an application by its ID (F48)", () => {
  it("refuses an application that has a run waiting or running", async () => {
    app.modelHangs = true;
    const before = await readFile(jobFile(), "utf8");
    runRegistry().enqueue("jane-doe", "new", { start: { posting: "Globex is hiring.", url: "https://jobs.example.com/1" } });
    const waiting = runRegistry().enqueue("jane-doe", "retry", { start: { id: SAVED } });
    expect(runRegistry().list("jane-doe").find((run) => run.runId === waiting)).toMatchObject({ status: "queued", archivable: false });

    expect(await answer(archiveApplication(SAVED))).toEqual({ status: 409, body: { error: "This application has a run waiting or running." } });
    expect(await answer(archiveRun(waiting))).toMatchObject({ status: 409 });
    expect(await readFile(jobFile(), "utf8")).toBe(before);
    expect(runRegistry().list("jane-doe").find((run) => run.runId === waiting)).toMatchObject({ status: "queued" });
  });

  it("refuses an application that doesn't exist, or a name that isn't an application's", async () => {
    expect(await answer(archiveApplication("2026-11-12-initech-dev"))).toEqual({ status: 404, body: { error: "Unknown application." } });
    expect(await answer(restoreApplication("../john-roe"))).toEqual({ status: 404, body: { error: "Unknown application." } });
  });

  it("archives an application without a run in memory, and its runs leave the list when it has some", async () => {
    const runId = await failedVerify();

    expect(await answer(archiveApplication(SAVED))).toEqual({ status: 204, body: null });

    expect(fields(await readFile(jobFile(), "utf8")).data).toHaveProperty("archived_at");
    expect(runRegistry().list("jane-doe")).toEqual([]);
    expect(await answer(restoreApplication(SAVED))).toEqual({ status: 204, body: null });
    expect(runRegistry().list("jane-doe")).toMatchObject([{ runId, status: "cancelled" }]);
  });
});

describe("deleting an archived application that never finished (F26)", () => {
  const folder = (id: string, profile = profileDir) => path.join(profile, "applications", id);
  const exists = (file: string) => stat(file).then(() => true, () => false);

  /** A failed "Try again" of the unfinished application, then the application archived. */
  async function archivedWithRun(): Promise<string> {
    const runId = runRegistry().enqueue("jane-doe", "retry", { start: { id: UNFINISHED } });
    await vi.waitFor(() => expect(runRegistry().list("jane-doe")[0]).toMatchObject({ runId, status: "failed" }));
    expect(await answer(archiveApplication(UNFINISHED))).toEqual({ status: 204, body: null });
    return runId;
  }

  it("deletes its whole folder, archive/ included, and its runs leave the list; nothing else changes", async () => {
    const runId = await archivedWithRun();
    await mkdir(path.join(folder(UNFINISHED), "archive", "01"), { recursive: true });
    await writeFile(path.join(folder(UNFINISHED), "archive", "01", "resume.md"), "An earlier resume.\n");
    const before = await snapshot();

    expect(await answer(deleteApplication(UNFINISHED))).toEqual({ status: 204, body: null });

    expect(await exists(folder(UNFINISHED))).toBe(false);
    expect(await snapshot()).toEqual(Object.fromEntries(Object.entries(before).filter(([file]) => !file.startsWith(`applications/${UNFINISHED}/`))));
    expect(runRegistry().list("jane-doe")).toEqual([]);
    // Its run is gone too, archived or not.
    expect(await answer(restoreRun(runId))).toEqual({ status: 404, body: { error: "Unknown run." } });
    expect(await answer(deleteApplication(UNFINISHED))).toEqual({ status: 404, body: { error: "Unknown application." } });
  });

  it("refuses an application that isn't archived, a finished one, and an invalid job.md, deleting nothing", async () => {
    const refusal = { status: 409, body: { error: "Only an archived application that never finished can be deleted." } };
    await archiveApplication(SAVED);
    const before = await snapshot();

    expect(await answer(deleteApplication(UNFINISHED))).toEqual(refusal);
    expect(await answer(deleteApplication(SAVED))).toEqual(refusal);

    await archiveApplication(UNFINISHED);
    const job = path.join(folder(UNFINISHED), "job.md");
    const broken = (await readFile(job, "utf8")).replace("language: en", "language: English");
    await writeFile(job, broken);
    expect(await answer(deleteApplication(UNFINISHED))).toEqual({
      status: 409,
      body: { error: `applications/${UNFINISHED}/job.md has problems: language: must be a two-letter ISO 639-1 code, e.g. en` },
    });
    expect(await exists(folder(UNFINISHED))).toBe(true);
    expect(await exists(folder(SAVED))).toBe(true);
    expect(Object.keys(await snapshot())).toEqual(Object.keys(before));
  });

  it("refuses an application with a run waiting or running, and names that aren't an application's", async () => {
    await archiveApplication(UNFINISHED);
    app.modelHangs = true;
    runRegistry().enqueue("jane-doe", "retry", { start: { id: UNFINISHED } });

    expect(await answer(deleteApplication(UNFINISHED))).toEqual({ status: 409, body: { error: "This application has a run waiting or running." } });
    expect(await exists(folder(UNFINISHED))).toBe(true);
    expect(await answer(deleteApplication("../john-roe"))).toEqual({ status: 404, body: { error: "Unknown application." } });
    expect(await answer(deleteApplication("2026-11-12-initech-dev"))).toEqual({ status: 404, body: { error: "Unknown application." } });
  });

  it("never touches another profile's application of the same name (Art. III.7)", async () => {
    const other = path.join(app.profilesDir, "john-roe");
    await cp(profileDir, other, { recursive: true });
    await archiveApplication(UNFINISHED);

    expect(await answer(deleteApplication(UNFINISHED))).toEqual({ status: 204, body: null });

    expect(await exists(folder(UNFINISHED))).toBe(false);
    expect(await exists(folder(UNFINISHED, other))).toBe(true);
  });
});
