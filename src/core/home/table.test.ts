import { describe, expect, it } from "vitest";
import type { ApplicationSummary } from "../application/summary";
import { firstTab, generatingCounts, homeTable, type HomeRow, type HomeRun } from "./table";

// Fictional applications and runs (Art. III.5). The IDs stand for application folders' UUIDs.

const app = (id: string, fields: Partial<ApplicationSummary> = {}): ApplicationSummary => ({
  id,
  hasText: true,
  indeed: false,
  finished: false,
  problems: [],
  ...fields,
});
const finishedApp = (id: string, fields: Partial<ApplicationSummary> = {}) =>
  app(id, { finished: true, resumeStatus: "ready", printBlockers: [], ...fields });

const run = (runId: string, fields: Partial<HomeRun> = {}): HomeRun => ({
  runId,
  kind: "new",
  status: "queued",
  steps: [],
  warnings: {},
  retryable: false,
  fetchFailed: false,
  archivable: false,
  stop: null,
  ...fields,
});
const waiting = (runId: string, fields: Partial<HomeRun> = {}) => run(runId, { status: "queued", stop: "cancel", ...fields });
const failed = (runId: string, fields: Partial<HomeRun> = {}) => run(runId, { status: "failed", archivable: true, ...fields });

const keys = (rows: readonly HomeRow[]) => rows.map((row) => row.key);
const INDEED = "https://ie.indeed.com/viewjob?jk=1";
const PROBLEM = (id: string, file: string) => ({ file: `applications/${id}/${file}`, problems: ["must be text"] });

describe("homeTable (F26)", () => {
  describe("Ready", () => {
    it("lists only finished applications that aren't archived, newest first, as draft or ready", () => {
      const table = homeTable(
        [
          finishedApp("old", { date: "2026-11-10T10:00:00Z", resumeStatus: "draft", printBlockers: ["the model review has run on the current content"] }),
          app("unfinished", { date: "2026-11-22T10:00:00Z" }),
          finishedApp("new", { date: "2026-11-21T10:00:00Z", title: "Backend Engineer", company: "Globex", source: "LinkedIn" }),
          finishedApp("undated"),
          finishedApp("archived", { archivedAt: "2026-11-22T11:00:00Z" }),
        ],
        [],
      );

      expect(keys(table.ready)).toEqual(["new", "old", "undated"]);
      expect(table.ready[0]).toEqual({
        key: "new",
        place: "ready",
        applicationId: "new",
        title: "Backend Engineer",
        company: "Globex",
        source: "LinkedIn",
        date: "2026-11-21T10:00:00Z",
        state: "ready",
        tone: "green",
        steps: [],
        warnings: {},
        main: "view-pdf",
        menu: ["open", "archive"],
        printBlockers: [],
      });
      expect(table.ready[1]).toMatchObject({ state: "draft", tone: "green", main: "view-pdf", printBlockers: ["the model review has run on the current content"] });
    });

    it("lists a finished application with an invalid file as having problems, opened to see them (Art. IV.6)", () => {
      const table = homeTable([finishedApp("broken", { problems: [PROBLEM("broken", "verification.md")] })], []);

      expect(table.ready).toEqual([expect.objectContaining({ key: "broken", state: "has problems", tone: "red", main: "open", menu: ["archive"] })]);
      expect(table.ready[0].printBlockers).toBeUndefined();
    });

    it("can't archive an application whose job.md is invalid, and lists an unfinished one in Generating", () => {
      const table = homeTable(
        [finishedApp("finished", { problems: [PROBLEM("finished", "job.md")] }), app("unfinished", { hasText: false, problems: [PROBLEM("unfinished", "job.md")] })],
        [],
      );

      expect(table.ready).toEqual([expect.objectContaining({ key: "finished", state: "has problems", main: "open", menu: [] })]);
      expect(table.generating).toEqual([expect.objectContaining({ key: "unfinished", state: "has problems", main: "open", menu: [] })]);
    });
  });

  describe("Generating", () => {
    it("lists an unfinished application with no run in memory as cancelled, with Try again, after a restart (F50)", () => {
      const table = homeTable([app("with-text"), app("no-text", { hasText: false })], []);

      expect(table.generating).toEqual([
        expect.objectContaining({ key: "no-text", state: "cancelled", tone: "neutral", main: "try-again", menu: ["open", "paste", "archive"], pasteTo: "application" }),
        expect.objectContaining({ key: "with-text", state: "cancelled", tone: "neutral", main: "try-again", menu: ["open", "archive"] }),
      ]);
      expect(table.generating[1].pasteTo).toBeUndefined();
    });

    it("never offers Try again on an Indeed application without its text, which would request Indeed (F47)", () => {
      const table = homeTable([app("indeed", { hasText: false, indeed: true, url: INDEED, source: "Indeed" })], []);

      expect(table.generating).toEqual([
        expect.objectContaining({ key: "indeed", url: INDEED, state: "cancelled", main: "paste", menu: ["open", "archive"], pasteTo: "application" }),
      ]);
    });

    it("shows a link of the fetch queue with its X, then the link being fetched", () => {
      const table = homeTable(
        [app("fetching", { hasText: false })],
        [
          run("being-fetched", { status: "fetching", stop: "remove", applicationId: "fetching", steps: [{ step: "fetch", status: "running" }] }),
          run("next", { status: "fetching", stop: "remove", url: "https://jobs.example.com/2", source: "jobs.example.com" }),
        ],
      );

      expect(table.generating).toEqual([
        expect.objectContaining({ key: "fetching", runId: "being-fetched", state: "fetching the posting", tone: "neutral", main: "remove", menu: ["open"] }),
        expect.objectContaining({ key: "next", runId: "next", url: "https://jobs.example.com/2", state: "waiting to fetch", main: "remove", menu: [] }),
      ]);
      expect(table.generating[1].applicationId).toBeUndefined();
    });

    it("cancels a run waiting for the model, and labels a Try again or a Verify again", () => {
      const table = homeTable(
        [app("a"), finishedApp("b")],
        [waiting("ra", { kind: "retry", applicationId: "a" }), waiting("rb", { kind: "verify", applicationId: "b" })],
      );

      expect(table.ready).toEqual([]);
      expect(table.generating).toEqual([
        expect.objectContaining({ key: "a", state: "waiting", label: "Try again", main: "cancel", menu: ["open"] }),
        expect.objectContaining({ key: "b", state: "waiting", label: "Verify again", main: "cancel", menu: ["open"] }),
      ]);
    });

    it("shows the generation in progress above the tabs only, with no menu", () => {
      const table = homeTable([app("a", { title: "Backend Engineer" })], [run("ra", { status: "running", stop: "cancel", applicationId: "a", kind: "retry" })]);

      expect(table.running).toMatchObject({ key: "a", runId: "ra", kind: "retry", label: "Try again", title: "Backend Engineer", state: "running", tone: "green", main: null, menu: [] });
      expect(table.generating).toEqual([]);
      expect(table.ready).toEqual([]);
    });

    it("asks for the text of a failed fetch, with Try again first and the text sent to its run (F48)", () => {
      const table = homeTable(
        [app("a", { hasText: false })],
        [failed("ra", { applicationId: "a", fetchFailed: true, retryable: true, error: "Not found.", steps: [{ step: "fetch", status: "running" }] })],
      );

      expect(table.generating).toEqual([
        expect.objectContaining({
          key: "a",
          state: "needs the posting's text",
          tone: "amber",
          error: "Not found.",
          steps: [{ step: "fetch", status: "running" }],
          main: "try-again",
          menu: ["open", "paste", "archive"],
          pasteTo: "run",
        }),
      ]);
    });

    it("cancels an Indeed link that needs its text; once cancelled, its main action is pasting the text (F26)", () => {
      const indeed = (fields: Partial<HomeRun>) =>
        homeTable([app("a", { hasText: false, indeed: true, url: INDEED })], [failed("ra", { applicationId: "a", fetchFailed: true, url: INDEED, ...fields })]);

      expect(indeed({ stop: "cancel" }).generating).toEqual([
        expect.objectContaining({ state: "needs the posting's text", tone: "amber", main: "cancel", menu: ["open", "paste", "archive"], pasteTo: "run" }),
      ]);
      expect(indeed({ status: "cancelled" }).generating).toEqual([
        expect.objectContaining({ state: "cancelled", tone: "neutral", main: "paste", menu: ["open", "archive"], pasteTo: "run" }),
      ]);
    });

    it("tries a failed generation again, and reads a restored failed fetch as cancelled with its text still asked for (F48)", () => {
      const table = homeTable(
        [app("generation"), app("restored", { hasText: false })],
        [
          failed("rg", { applicationId: "generation", error: "Can't reach Ollama.", warnings: { tailor: "May not fit." } }),
          run("rr", { status: "cancelled", applicationId: "restored", fetchFailed: true, retryable: true, archivable: true }),
        ],
      );

      expect(table.generating).toEqual([
        expect.objectContaining({ key: "restored", state: "cancelled", main: "try-again", menu: ["open", "paste", "archive"], pasteTo: "run" }),
        expect.objectContaining({ key: "generation", state: "failed", tone: "red", error: "Can't reach Ollama.", warnings: { tailor: "May not fit." }, main: "try-again" }),
      ]);
    });

    it("uses a run's own Try again and archive button while it has no application", () => {
      const table = homeTable([], [failed("lone", { fetchFailed: true, retryable: true, url: "https://jobs.example.com/1" }), failed("used", { fetchFailed: true })]);

      expect(table.generating).toEqual([
        expect.objectContaining({ key: "used", main: "paste", menu: ["archive"], pasteTo: "run" }),
        expect.objectContaining({ key: "lone", main: "try-again", menu: ["paste", "archive"], pasteTo: "run" }),
      ]);
    });

    it("keeps the queue's order, and a failed generation where it stood: ended rows, then waiting, then fetching", () => {
      // As the Runs list orders them: running, waiting, fetching, then ended runs, latest first.
      const runs = [
        run("r-running", { status: "running", applicationId: "running" }),
        waiting("r-second", { applicationId: "second" }),
        waiting("r-first", { applicationId: "first" }),
        run("r-fetch", { status: "fetching", stop: "remove" }),
        failed("r-latest", { applicationId: "latest" }),
        run("r-earlier", { status: "cancelled", applicationId: "earlier" }),
      ];
      const apps = ["running", "second", "first", "latest", "earlier"].map((id) => app(id));
      const table = homeTable([...apps, app("restart-new", { date: "2026-11-21T10:00:00Z" }), app("restart-old", { date: "2026-11-20T10:00:00Z" }), app("restart-undated")], runs);

      expect(keys(table.generating)).toEqual(["restart-old", "restart-new", "restart-undated", "earlier", "latest", "second", "first", "r-fetch"]);
      expect(table.running?.key).toBe("running");
    });

    it("shows an application's latest run: the waiting Try again, not the run that failed before it", () => {
      const table = homeTable([app("a")], [waiting("again", { applicationId: "a", kind: "retry" }), failed("before", { applicationId: "a" })]);

      expect(table.generating).toEqual([expect.objectContaining({ key: "a", runId: "again", state: "waiting", main: "cancel" })]);
    });
  });

  describe("Archived", () => {
    it("lists archived rows only there, newest archived first, with Restore, and View PDF or Delete", () => {
      const table = homeTable(
        [
          finishedApp("finished", { archivedAt: "2026-11-21T10:00:00Z" }),
          app("unfinished", { archivedAt: "2026-11-22T10:00:00Z", hasText: false }),
        ],
        [],
        [failed("unfinished-run", { applicationId: "unfinished", fetchFailed: true, archivedAt: "2026-11-22T10:00:00Z" }), failed("lone", { archivedAt: "2026-11-20T10:00:00Z", error: "Couldn't save." })],
      );

      expect(keys(table.archived)).toEqual(["unfinished", "finished", "lone"]);
      expect(table.archived).toEqual([
        expect.objectContaining({ state: "needs the posting's text", main: "delete", menu: ["open", "restore"], archivedAt: "2026-11-22T10:00:00Z" }),
        expect.objectContaining({ state: "ready", main: "view-pdf", menu: ["open", "restore"] }),
        expect.objectContaining({ runId: "lone", state: "failed", main: "delete", menu: ["restore"] }),
      ]);
      expect(table.archived[2].error).toBeUndefined();
      expect(table.archived[0].pasteTo).toBeUndefined();
      expect(table.ready).toEqual([]);
      expect(table.generating).toEqual([]);
    });

    it("lists an archived application with a run going in the queue, as the Runs list did (F48)", () => {
      const table = homeTable([finishedApp("a", { archivedAt: "2026-11-21T10:00:00Z" })], [waiting("v", { kind: "verify", applicationId: "a" })]);

      expect(table.generating).toEqual([expect.objectContaining({ key: "a", state: "waiting", main: "cancel", menu: ["open"] })]);
      expect(table.archived).toEqual([]);
    });
  });

  describe("the Generating tab's numbers and the first tab", () => {
    it("counts runs waiting for the model, links being fetched, and rows with problems", () => {
      const table = homeTable(
        [app("needs-text", { hasText: false }), app("failed"), app("cancelled")],
        [
          run("running", { status: "running" }),
          waiting("w1"),
          waiting("w2"),
          run("f1", { status: "fetching", steps: [{ step: "fetch", status: "running" }] }),
          run("f2", { status: "fetching" }),
          failed("x", { applicationId: "needs-text", fetchFailed: true }),
          failed("y", { applicationId: "failed" }),
          run("z", { status: "cancelled", applicationId: "cancelled" }),
        ],
      );

      expect(table.counts).toEqual({ waiting: 2, fetching: 2, problems: 2 });
      expect(generatingCounts([])).toEqual({ waiting: 0, fetching: 0, problems: 0 });
    });

    it("shows Generating first while a resume is being generated, otherwise Ready", () => {
      expect(homeTable([], []).firstTab).toBe("ready");
      expect(homeTable([finishedApp("a"), app("b")], []).firstTab).toBe("ready");
      expect(homeTable([], [run("r", { status: "running" })]).firstTab).toBe("generating");
      expect(homeTable([], [waiting("w")]).firstTab).toBe("generating");
      expect(homeTable([], [run("f", { status: "fetching" })]).firstTab).toBe("generating");
      expect(firstTab({ running: null, generating: [{ state: "failed" } as HomeRow] })).toBe("ready");
    });
  });
});
