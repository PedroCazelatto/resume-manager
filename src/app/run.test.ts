import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFsProfileStore } from "@/adapters/profile-store";
import type { FetchedPosting } from "@/core/posting/job-fetcher";
import type { ListedLink } from "@/core/posting/links";
import { patchFrontmatter } from "@/core/markdown/frontmatter";
import { enqueueLinks, runRegistry } from "./run";

// enqueueLinks runs against a scratch copy of the fictional profile (Art. III.5). The fetcher
// is answered by hand and the model is never reached, so no test touches the network (Art. IX.2).
const app = vi.hoisted(() => ({
  profilesDir: "",
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
    throw new Error("No model in these tests.");
  },
}));

const A = "https://jobs.example.com/1";
const B = "https://jobs.example.com/2";
const INDEED = "https://ie.indeed.com/viewjob?jk=1";
const SAVED = "2026-11-10-globex-ltd-senior-backend-engineer";

const listed = (...urls: string[]): ListedLink[] => urls.map((url, index) => ({ line: index + 1, text: url, url }));
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

async function send(links: ListedLink[]) {
  const response = await enqueueLinks(links);
  return { status: response.status, ...((await response.json()) as { runIds: string[]; skipped: unknown[]; problems: unknown[] }) };
}

describe("enqueueLinks (F47)", () => {
  let profileDir: string;

  beforeEach(async () => {
    app.profilesDir = await mkdtemp(path.join(tmpdir(), "resume-links-"));
    profileDir = path.join(app.profilesDir, "jane-doe");
    await cp(path.resolve("example-profiles", "jane-doe"), profileDir, { recursive: true });
    app.asked = [];
    app.answers = new Map();
    // A registry of its own for each test.
    delete (globalThis as { resumeRuns?: unknown }).resumeRuns;
  });

  afterEach(async () => {
    await rm(app.profilesDir, { recursive: true, force: true });
  });

  /** Gives a saved application of the example profile a link in its job.md. */
  async function saveLink(id: string, url: string) {
    const file = path.join(profileDir, "applications", id, "job.md");
    await writeFile(file, patchFrontmatter(await readFile(file, "utf8"), { url }));
  }

  it("skips a link a saved application's job.md has, naming it, and queues the others", async () => {
    await saveLink(SAVED, A);

    const reply = await send(listed(A, B));

    expect(reply).toEqual({
      status: 202,
      runIds: [expect.any(String)],
      skipped: [{ line: 1, text: A, reason: `Skipped: it is already saved in application ${SAVED}.` }],
      problems: [],
    });
    expect(app.asked).toEqual([B]);
    expect(runRegistry().list("jane-doe").map((run) => [run.runId, run.url])).toEqual([[reply.runIds[0], B]]);
  });

  it("skips a link already in the Runs list, and queues it again once its row failed", async () => {
    await send(listed(A));

    const again = await send(listed(A));
    expect(again).toEqual({ status: 202, runIds: [], skipped: [{ line: 1, text: A, reason: "Skipped: it is already in the Runs list." }], problems: [] });

    app.answers.get(A)!({ ok: false, reason: "The page answered 403." });
    await settled();
    expect((await send(listed(A))).runIds).toHaveLength(1);
    expect(app.asked).toEqual([A, A]);
  });

  it("lists an Indeed link as needing its text without fetching it", async () => {
    const reply = await send(listed(INDEED, A));

    expect(reply.runIds).toHaveLength(2);
    expect(app.asked).toEqual([A]);
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
