import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFsProfileStore } from "@/adapters/profile-store";
import type { FetchedPosting } from "@/core/posting/job-fetcher";
import { archiveApplication } from "./archive";
import { readHome } from "./home";
import { enqueueLinks, runRegistry } from "./run";

// The home table read from a scratch copy of the fictional profile (Art. III.5). Nothing is
// fetched and the model is never reached, so no test touches the network (Art. IX.2).
const app = vi.hoisted(() => ({ profilesDir: "" }));

vi.mock("@/app/profiles", () => ({
  profileStore: () => createFsProfileStore(app.profilesDir),
  readSelectedProfile: async () => "jane-doe",
}));
vi.mock("@/adapters/job-fetcher", () => ({
  createJobFetcher: () => ({ fetchPosting: () => new Promise<FetchedPosting>(() => {}) }),
}));
vi.mock("@/app/llm", () => ({
  llmClient: () => {
    throw new Error("No model in these tests.");
  },
}));

/** The example application whose generation finished, and the one that has no verification.md. */
const FINISHED = "2026-11-10-globex-ltd-senior-backend-engineer";
const UNFINISHED = "2026-11-10-globex-corporation-senior-backend-engineer";
const INDEED = "https://ie.indeed.com/viewjob?jk=1";

let profileDir: string;

beforeEach(async () => {
  app.profilesDir = await mkdtemp(path.join(tmpdir(), "resume-home-"));
  profileDir = path.join(app.profilesDir, "jane-doe");
  await cp(path.resolve("example-profiles", "jane-doe"), profileDir, { recursive: true });
  delete (globalThis as { resumeRuns?: unknown }).resumeRuns;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(app.profilesDir, { recursive: true, force: true });
});

describe("readHome (F26)", () => {
  it("lists a finished application in Ready and an unfinished one in Generating as cancelled, after a restart", async () => {
    const { runs, table } = await readHome("jane-doe");

    expect(runs).toEqual([]);
    expect(table.running).toBeNull();
    expect(table.ready).toEqual([
      expect.objectContaining({ key: FINISHED, title: "Senior Backend Engineer", company: "Globex Ltd", state: "draft", main: "view-pdf" }),
    ]);
    expect(table.generating).toEqual([
      expect.objectContaining({ key: UNFINISHED, title: "Senior Backend Engineer", company: "Globex Corporation", state: "cancelled", main: "try-again" }),
    ]);
    expect(table.archived).toEqual([]);
    expect(table.firstTab).toBe("ready");
  });

  it("adds the runs in memory: an Indeed link that needs its text, with its counts", async () => {
    await enqueueLinks([{ line: 1, text: INDEED, url: INDEED }]);
    const [run] = runRegistry().list("jane-doe");

    const { runs, table } = await readHome("jane-doe");

    expect(runs).toEqual([expect.objectContaining({ runId: run.runId, stop: "cancel" })]);
    // The application with no run in memory comes first: it ended before the app started.
    expect(table.generating.map((row) => row.key)).toEqual([UNFINISHED, run.applicationId]);
    expect(table.generating[1]).toMatchObject({ key: run.applicationId, runId: run.runId, source: "Indeed", url: INDEED, state: "needs the posting's text", main: "cancel" });
    expect(table.counts).toEqual({ waiting: 0, fetching: 0, problems: 1 });
  });

  it("moves an archived application to Archived", async () => {
    await archiveApplication(UNFINISHED);

    const { table } = await readHome("jane-doe");

    expect(table.generating).toEqual([]);
    expect(table.archived).toEqual([expect.objectContaining({ key: UNFINISHED, main: "delete", menu: ["open", "restore"] })]);
  });

  it("lists a folder with an invalid job.md as having problems, and skips an empty one (Art. IV.6)", async () => {
    await writeFile(path.join(profileDir, "applications", FINISHED, "job.md"), "no frontmatter");
    await mkdir(path.join(profileDir, "applications", "3f2b8c1e-5a7d-4c9e-9b1a-2d6e8f0c4a73"));

    const { table } = await readHome("jane-doe");

    expect(table.ready).toEqual([expect.objectContaining({ key: FINISHED, state: "has problems", main: "open", menu: [] })]);
    expect([...table.generating, ...table.archived].map((row) => row.key)).toEqual([UNFINISHED]);
  });

  it("never lists another profile's applications or runs (Art. III.7)", async () => {
    const other = path.join(app.profilesDir, "john-roe");
    await cp(profileDir, other, { recursive: true });
    await rm(path.join(profileDir, "applications"), { recursive: true });
    runRegistry().enqueue("john-roe", "retry", { start: { id: FINISHED } });

    const { runs, table } = await readHome("jane-doe");

    expect(runs).toEqual([]);
    expect([...table.ready, ...table.generating, ...table.archived]).toEqual([]);
    expect(table.running).toBeNull();
  });
});
