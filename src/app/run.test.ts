import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFsProfileStore } from "@/adapters/profile-store";
import type { FetchedPosting } from "@/core/posting/job-fetcher";
import type { ListedLink } from "@/core/posting/links";
import { isUuidApplicationId } from "@/core/application/folder";
import { parseFrontmatter, patchFrontmatter } from "@/core/markdown/frontmatter";
import { enqueueLinks, enqueueRun, pasteRun, runRegistry } from "./run";

// enqueueLinks runs against a scratch copy of the fictional profile (Art. III.5). The fetcher
// is answered by hand and the model is never reached, so no test touches the network (Art. IX.2).
const app = vi.hoisted(() => ({
  profilesDir: "",
  modelHangs: false,
  asked: [] as string[],
  answers: new Map<string, (result: FetchedPosting) => void>(),
}));

vi.mock("@/app/profiles", () => ({
  profileStore: () => createFsProfileStore(app.profilesDir),
  readSelectedProfile: async () => "jane-doe",
}));
vi.mock("@/adapters/job-fetcher", () => ({
  createJobFetcher: () => ({
    fetchPosting: (url: string) => {
      app.asked.push(url);
      return new Promise<FetchedPosting>((resolve) => app.answers.set(url, resolve));
    },
  }),
}));
vi.mock("@/app/llm", () => ({
  llmClient: () => {
    if (!app.modelHangs) throw new Error("No model in these tests.");
    // A model call that never returns, so the run stays running and the next one waits.
    return { model: "fake-model", contextTokens: 1_000_000, generate: () => new Promise(() => {}) };
  },
}));

const A = "https://jobs.example.com/1";
const B = "https://jobs.example.com/2";
const INDEED = "https://ie.indeed.com/viewjob?jk=1";
const SAVED = "2026-11-10-globex-ltd-senior-backend-engineer";

const listed = (...urls: string[]): ListedLink[] => urls.map((url, index) => ({ line: index + 1, text: url, url }));

async function send(links: ListedLink[]) {
  const response = await enqueueLinks(links);
  return { status: response.status, ...((await response.json()) as { runIds: string[]; skipped: unknown[]; problems: unknown[] }) };
}

let profileDir: string;

beforeEach(async () => {
  app.profilesDir = await mkdtemp(path.join(tmpdir(), "resume-links-"));
  profileDir = path.join(app.profilesDir, "jane-doe");
  await cp(path.resolve("example-profiles", "jane-doe"), profileDir, { recursive: true });
  app.asked = [];
  app.answers = new Map();
  app.modelHangs = false;
  // A registry of its own for each test.
  delete (globalThis as { resumeRuns?: unknown }).resumeRuns;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(app.profilesDir, { recursive: true, force: true });
});

/** The applications made since the test began: the folders named by a UUID, newest last by name. */
async function made(): Promise<string[]> {
  return (await readdir(path.join(profileDir, "applications"))).filter(isUuidApplicationId).sort();
}

/** An application's job.md, split into its fields and body. */
async function job(id: string) {
  const parsed = parseFrontmatter(await readFile(path.join(profileDir, "applications", id, "job.md"), "utf8"));
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed;
}

/** Gives a saved application of the example profile a link in its job.md. */
async function saveLink(id: string, url: string) {
  const file = path.join(profileDir, "applications", id, "job.md");
  await writeFile(file, patchFrontmatter(await readFile(file, "utf8"), { url }));
}

describe("enqueueLinks (F47)", () => {
  it("skips a link a saved application's job.md has, naming it, and queues the others", async () => {
    await saveLink(SAVED, A);

    const reply = await send(listed(A, B));

    expect(reply).toEqual({
      status: 202,
      runIds: [expect.any(String)],
      skipped: [{ line: 1, text: A, reason: `Skipped: it is already saved in application ${SAVED}.` }],
      problems: [],
    });
    await vi.waitFor(() => expect(app.asked).toEqual([B]));
    expect(runRegistry().list("jane-doe").map((run) => [run.runId, run.url])).toEqual([[reply.runIds[0], B]]);
  });

  it("skips a link already in the Runs list, and its saved application once its fetch failed", async () => {
    await send(listed(A));

    const again = await send(listed(A));
    expect(again).toEqual({ status: 202, runIds: [], skipped: [{ line: 1, text: A, reason: "Skipped: it is already in the Runs list." }], problems: [] });

    await vi.waitFor(() => expect(app.answers.has(A)).toBe(true));
    app.answers.get(A)!({ ok: false, reason: "The page answered 403." });
    await vi.waitFor(() => expect(runRegistry().list("jane-doe")[0].status).toBe("failed"));
    // The failed fetch keeps the application made when its fetch started (F50).
    const [id] = await made();
    expect((await send(listed(A))).skipped).toEqual([{ line: 1, text: A, reason: `Skipped: it is already saved in application ${id}.` }]);
    expect(app.asked).toEqual([A]);
  });

  it("lists an Indeed link as needing its text without fetching it", async () => {
    const reply = await send(listed(INDEED, A));

    expect(reply.runIds).toHaveLength(2);
    await vi.waitFor(() => expect(app.asked).toEqual([A]));
    expect(runRegistry().list("jane-doe").find((run) => run.url === INDEED)).toMatchObject({ status: "failed", fetchFailed: true, retryable: false });
  });

  it("names a saved job.md that isn't valid, and still queues the link", async () => {
    await mkdir(path.join(profileDir, "applications", "2026-11-12-initech-dev"));
    await writeFile(path.join(profileDir, "applications", "2026-11-12-initech-dev", "job.md"), "no frontmatter");

    const reply = await send(listed(A));

    expect(reply.runIds).toHaveLength(1);
    expect(reply.problems).toEqual([
      { file: "applications/2026-11-12-initech-dev/job.md", problems: ["missing YAML frontmatter: the file must start with a `---` line"] },
    ]);
  });
});

describe("pasteRun (F48)", () => {
  const POSTING = "Globex is hiring a Backend Engineer.";

  async function paste(runId: string, body: { posting?: string; url?: string }) {
    const response = await pasteRun(runId, body);
    return { status: response.status, body: (await response.json()) as { runId?: string; error?: string } };
  }

  it("moves the Indeed link's own run on with the pasted text: same ID, one row, and no request to Indeed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const [runId] = (await send(listed(INDEED))).runIds;

    expect(await paste(runId, { posting: POSTING, url: INDEED })).toEqual({ status: 202, body: { runId } });

    // No model in these tests, so the run fails at once; the row is still the same one.
    await vi.waitFor(() => expect(runRegistry().list("jane-doe")[0].status).toBe("failed"));
    expect(runRegistry().list("jane-doe")).toMatchObject([
      { runId, status: "failed", url: INDEED, fetchFailed: false, retryable: true, error: "No model in these tests." },
    ]);
    expect(app.asked).toEqual([]);
    expect(JSON.stringify(error.mock.calls)).not.toContain(POSTING);
  });

  it("writes the pasted text as the body of the application's job.md, keeping its frontmatter (F50)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const [runId] = (await send(listed(INDEED))).runIds;
    const [id] = await made();
    const file = path.join(profileDir, "applications", id, "job.md");
    await writeFile(file, patchFrontmatter(await readFile(file, "utf8"), { my_note: "keep me" }));

    await paste(runId, { posting: POSTING, url: INDEED });

    const pasted = await job(id);
    expect(pasted.data).toEqual({ url: INDEED, source: "Indeed", my_note: "keep me", fetched_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
    expect(pasted.body).toBe(`${POSTING}\n`);
    expect(await made()).toEqual([id]);
    expect(runRegistry().list("jane-doe")[0]).toMatchObject({ runId, applicationId: id });
  });

  it("names a job.md that isn't valid, and leaves it and the run as they are (Art. IV.6)", async () => {
    const [runId] = (await send(listed(INDEED))).runIds;
    const [id] = await made();
    await writeFile(path.join(profileDir, "applications", id, "job.md"), "no frontmatter");

    expect(await paste(runId, { posting: POSTING, url: INDEED })).toEqual({
      status: 409,
      body: { error: `applications/${id}/job.md has problems: missing YAML frontmatter: the file must start with a \`---\` line` },
    });
    expect(await readFile(path.join(profileDir, "applications", id, "job.md"), "utf8")).toBe("no frontmatter");
    expect(runRegistry().list("jane-doe")).toMatchObject([{ runId, status: "failed", fetchFailed: true }]);
  });

  it("refuses text without its link, an unknown run and a run that doesn't need its text", async () => {
    const [indeed, fetching] = (await send(listed(INDEED, A))).runIds;

    expect(await paste(indeed, { posting: POSTING })).toEqual({
      status: 400,
      body: { error: "Give the posting's link with its text: every posting keeps its link." },
    });
    expect(await paste("no-such-run", { posting: POSTING, url: A })).toEqual({ status: 404, body: { error: "Unknown run." } });
    expect(await paste(fetching, { posting: POSTING, url: A })).toEqual({
      status: 409,
      body: { error: "This run doesn't need the posting's text." },
    });
    expect(runRegistry().list("jane-doe").map((run) => [run.runId, run.status])).toEqual([
      [fetching, "fetching"],
      [indeed, "failed"],
    ]);
  });
});

describe("application folders (F50)", () => {
  const fetched = (url: string, text = "Globex is hiring."): FetchedPosting => ({
    ok: true,
    text,
    url,
    details: { title: "Backend Engineer", company: "Globex" },
  });

  it("makes a link's folder and job.md when its fetch starts, never while it waits to fetch", async () => {
    const [first, second] = (await send(listed(A, B))).runIds;

    await vi.waitFor(() => expect(app.asked).toEqual([A]));
    const [id] = await made();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(await job(id)).toEqual({ ok: true, data: { url: A, source: "jobs.example.com" }, body: "" });
    expect(runRegistry().list("jane-doe").map((run) => [run.runId, run.applicationId])).toEqual([
      [first, id],
      [second, undefined],
    ]);

    // The text, the page's details and when it arrived are written once fetched, from the address it was read from.
    app.answers.get(A)!(fetched(`${A}?from=redirect`));
    await vi.waitFor(() => expect(app.asked).toEqual([A, B]));
    expect(await job(id)).toEqual({
      ok: true,
      data: {
        url: `${A}?from=redirect`,
        source: "jobs.example.com",
        title: "Backend Engineer",
        company: "Globex",
        fetched_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
      body: "Globex is hiring.\n",
    });
    expect(await made()).toHaveLength(2);
  });

  it("gives an Indeed link its folder as it is added, with no request to Indeed", async () => {
    const [runId] = (await send(listed(INDEED))).runIds;

    const [id] = await made();
    expect(await job(id)).toEqual({ ok: true, data: { url: INDEED, source: "Indeed" }, body: "" });
    expect(runRegistry().list("jane-doe")).toMatchObject([{ runId, applicationId: id, status: "failed", fetchFailed: true }]);
    expect(app.asked).toEqual([]);
  });

  it("deletes the folder made for a link when the X removes it while it is fetched, so nothing of it is left", async () => {
    const before = await readdir(path.join(profileDir, "applications"));
    const [runId] = (await send(listed(A))).runIds;
    await vi.waitFor(() => expect(app.asked).toEqual([A]));
    expect(await made()).toHaveLength(1);

    expect(runRegistry().remove("jane-doe", runId)).toBe("removed");
    // The fetcher gives up once its request is stopped.
    app.answers.get(A)!({ ok: false, reason: "The request was stopped." });

    await vi.waitFor(async () => expect(await made()).toEqual([]));
    expect(await readdir(path.join(profileDir, "applications"))).toEqual(before);
    expect(runRegistry().list("jane-doe")).toEqual([]);
  });

  it("keeps a failed fetch and a cancelled run in their folders after a restart", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await send(listed(A));
    await vi.waitFor(() => expect(app.answers.has(A)).toBe(true));
    app.answers.get(A)!({ ok: false, reason: "The page answered 403." });
    await vi.waitFor(() => expect(runRegistry().list("jane-doe")[0].status).toBe("failed"));
    const [failed] = await made();
    // Pasted text waits behind a run whose model call never ends, and is cancelled while it waits.
    app.modelHangs = true;
    await enqueueRun("new", { start: { posting: "Umbrella is hiring.", url: "https://jobs.example.com/3" } });
    const before = await made();
    const reply = await enqueueRun("new", { start: { posting: "Initech is hiring.", url: B } });
    const { runId } = (await reply.json()) as { runId: string };
    expect(runRegistry().remove("jane-doe", runId)).toBe("cancelled");
    const cancelled = (await made()).find((id) => !before.includes(id))!;

    // A restart: the runs in memory are gone, the folders aren't (Art. IV.1).
    delete (globalThis as { resumeRuns?: unknown }).resumeRuns;
    expect(runRegistry().list("jane-doe")).toEqual([]);
    expect(await createFsProfileStore(app.profilesDir).listApplications("jane-doe")).toEqual(expect.arrayContaining([failed, cancelled]));
    expect((await job(failed)).data).toEqual({ url: A, source: "jobs.example.com" });
    expect(await job(cancelled)).toMatchObject({ data: { url: B, source: "jobs.example.com" }, body: "Initech is hiring.\n" });
  });

  it("fetches a failed fetch's link again into the same folder when it is tried again", async () => {
    const [runId] = (await send(listed(A))).runIds;
    await vi.waitFor(() => expect(app.answers.has(A)).toBe(true));
    app.answers.get(A)!({ ok: false, reason: "The page answered 403." });
    await vi.waitFor(() => expect(runRegistry().list("jane-doe")[0]).toMatchObject({ status: "failed", retryable: true }));
    const [id] = await made();

    const again = runRegistry().retry("jane-doe", runId);
    if (typeof again !== "object") throw new Error(again);
    await vi.waitFor(() => expect(app.asked).toEqual([A, A]));
    app.answers.get(A)!(fetched(A));

    await vi.waitFor(async () => expect((await job(id)).body).toBe("Globex is hiring.\n"));
    expect(await made()).toEqual([id]);
    expect(runRegistry().list("jane-doe").find((run) => run.runId === again.runId)).toMatchObject({ applicationId: id });
  });

  it("gives two postings of the same company and title two folders", async () => {
    await enqueueRun("new", { start: { posting: "Globex is hiring a Backend Engineer.", url: A } });
    await enqueueRun("new", { start: { posting: "Globex is hiring a Backend Engineer.", url: B } });

    expect(await made()).toHaveLength(2);
  });
});
