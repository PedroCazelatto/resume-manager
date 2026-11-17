import { describe, expect, it } from "vitest";
import {
  cancelRun,
  canTryAgain,
  dropFetchFailed,
  enqueue,
  enqueueFetch,
  failFetch,
  fetchDone,
  fetchFailed,
  findRun,
  finishRun,
  latestGeneration,
  nextFetch,
  nextRun,
  recordEvent,
  removeWaiting,
  runsOf,
  runSteps,
  startFetch,
  startRun,
  type QueuedRun,
} from "./queue";

/** Waiting runs; the ones named "john-…" belong to a second profile. */
function queued(...ids: string[]): QueuedRun[] {
  return ids.reduce<QueuedRun[]>(
    (runs, runId) =>
      enqueue(runs, { runId, profile: runId.startsWith("john") ? "john-roe" : "jane-doe", kind: "new", input: null }),
    [],
  );
}

/** When every run of these tests started. */
const STARTED = Date.UTC(2026, 10, 16, 10, 0, 0);

const statuses = (runs: QueuedRun[]) => runs.map((run) => `${run.runId}:${run.status}`);

/** Starts and ends the next run. */
function runNext(runs: QueuedRun[], error: string | null = null, maxFinished?: number): QueuedRun[] {
  const next = nextRun(runs);
  if (!next) throw new Error("nothing to run");
  return finishRun(startRun(runs, next.runId, STARTED), next.runId, error, maxFinished);
}

describe("run queue", () => {
  it("starts the run that has waited longest, one at a time, across profiles", () => {
    let runs = queued("a", "john-b", "c");
    expect(nextRun(runs)?.runId).toBe("a");

    runs = startRun(runs, "a", STARTED);
    expect(statuses(runs)).toEqual(["a:running", "john-b:queued", "c:queued"]);
    expect(nextRun(runs)).toBeNull();

    runs = finishRun(runs, "a", null);
    expect(nextRun(runs)?.runId).toBe("john-b");
    runs = runNext(runs);
    expect(nextRun(runs)?.runId).toBe("c");
    runs = runNext(runs);
    expect(nextRun(runs)).toBeNull();
    expect(statuses(runs)).toEqual(["a:done", "john-b:done", "c:done"]);
  });

  it("records the events of a run, keeping only the latest progress of a step and its warning", () => {
    let runs = startRun(queued("a"), "a", STARTED);
    runs = recordEvent(runs, "a", { type: "step", step: "analyse", status: "running" });
    runs = recordEvent(runs, "a", { type: "warning", step: "analyse", message: "This step's prompt is large." });
    runs = recordEvent(runs, "a", { type: "progress", step: "analyse", phase: "thinking", tokens: 10 });
    runs = recordEvent(runs, "a", { type: "progress", step: "analyse", phase: "writing", tokens: 3 });
    runs = recordEvent(runs, "a", { type: "step", step: "analyse", status: "done" });
    runs = recordEvent(runs, "a", { type: "saved", id: "2026-11-10-globex-backend-engineer" });

    expect(runs[0].events).toEqual([
      { type: "started", at: STARTED },
      { type: "step", step: "analyse", status: "running" },
      { type: "warning", step: "analyse", message: "This step's prompt is large." },
      { type: "progress", step: "analyse", phase: "writing", tokens: 3 },
      { type: "step", step: "analyse", status: "done" },
      { type: "saved", id: "2026-11-10-globex-backend-engineer" },
    ]);
    expect(runs[0].applicationId).toBe("2026-11-10-globex-backend-engineer");
    expect(runs[0].company).toBeUndefined();
  });

  it("keeps the company and role a run tells when its application is saved (F38)", () => {
    let runs = startRun(queued("a"), "a", STARTED);
    runs = recordEvent(runs, "a", { type: "saved", id: "2026-11-10-globex-backend-engineer", company: "Globex", role: "Backend Engineer" });
    runs = recordEvent(runs, "a", { type: "step", step: "tailor", status: "running" });

    expect(runs[0]).toMatchObject({ company: "Globex", role: "Backend Engineer" });
    expect(finishRun(runs, "a", "Can't reach Ollama.")[0]).toMatchObject({ status: "failed", company: "Globex", role: "Backend Engineer" });
  });

  it("ends a failed run with its error as the last event", () => {
    const runs = runNext(queued("a", "b"), "Can't reach Ollama.");

    expect(runs[0]).toMatchObject({ status: "failed", error: "Can't reach Ollama." });
    expect(runs[0].events.at(-1)).toEqual({ type: "error", message: "Can't reach Ollama." });
    expect(nextRun(runs)?.runId).toBe("b");
  });

  it("ends a cancelled run as cancelled, without an error, and lets the next one start (F32)", () => {
    let runs = startRun(queued("a", "b"), "a", STARTED);
    runs = recordEvent(runs, "a", { type: "saved", id: "2026-11-10-globex-backend-engineer" });

    runs = cancelRun(runs, "a");

    expect(runs[0]).toMatchObject({ status: "cancelled", applicationId: "2026-11-10-globex-backend-engineer" });
    expect(runs[0].error).toBeUndefined();
    expect(runs[0].events.at(-1)).toEqual({ type: "cancelled" });
    expect(nextRun(runs)?.runId).toBe("b");
    // A cancelled run counts as finished: the limit applies and it can't be removed.
    expect(statuses(cancelRun(startRun(runs, "b", STARTED), "b", 1))).toEqual(["b:cancelled"]);
    expect(removeWaiting(runs, "jane-doe", "a").removed).toBe(false);
  });

  it("forgets the oldest finished runs beyond the limit, never a waiting one", () => {
    let runs = queued("a", "b", "c", "d");
    runs = runNext(runs, null, 2);
    runs = runNext(runs, "failed", 2);
    runs = runNext(runs, null, 2);

    expect(statuses(runs)).toEqual(["b:failed", "c:done", "d:queued"]);
  });

  it("removes a waiting run, which then never starts", () => {
    const { runs, removed } = removeWaiting(startRun(queued("a", "b", "c"), "a", STARTED), "jane-doe", "b");

    expect(removed).toBe(true);
    expect(statuses(runs)).toEqual(["a:running", "c:queued"]);
    expect(nextRun(finishRun(runs, "a", null))?.runId).toBe("c");
  });

  it("doesn't remove a run that is running, finished or unknown", () => {
    const running = startRun(queued("a", "b"), "a", STARTED);
    const finished = finishRun(running, "a", null);

    expect(removeWaiting(running, "jane-doe", "a")).toEqual({ runs: running, removed: false });
    expect(removeWaiting(finished, "jane-doe", "a").removed).toBe(false);
    expect(removeWaiting(finished, "jane-doe", "nope").removed).toBe(false);
  });

  it("keeps one profile from finding or removing another's run (Art. III.7)", () => {
    const runs = queued("a", "john-b");

    expect(findRun(runs, "jane-doe", "john-b")).toBeNull();
    expect(findRun(runs, "john-roe", "john-b")?.runId).toBe("john-b");
    expect(removeWaiting(runs, "jane-doe", "john-b")).toEqual({ runs, removed: false });
  });

  it("lists a profile's runs: the active one, the waiting ones in order, then the latest finished first", () => {
    let runs = queued("a", "b", "john-c", "d", "e");
    runs = runNext(runs);
    runs = runNext(runs, "failed");
    runs = runNext(runs);
    runs = startRun(runs, "d", STARTED);

    expect(statuses(runsOf(runs, "jane-doe"))).toEqual(["d:running", "e:queued", "b:failed", "a:done"]);
    expect(statuses(runsOf(runs, "john-roe"))).toEqual(["john-c:done"]);
  });

  it("offers \"Try again\" on a new run that failed or was cancelled before its application was saved", () => {
    const run = { kind: "new", status: "failed" } as const;
    expect(canTryAgain(run)).toBe(true);
    expect(canTryAgain({ ...run, status: "cancelled" })).toBe(true);

    // With a folder, the application's page tries again.
    expect(canTryAgain({ ...run, applicationId: "2026-11-10-globex-backend-engineer" })).toBe(false);
    expect(canTryAgain({ ...run, status: "queued" })).toBe(false);
    expect(canTryAgain({ ...run, status: "running" })).toBe(false);
    expect(canTryAgain({ ...run, status: "done" })).toBe(false);
    expect(canTryAgain({ ...run, kind: "retry" })).toBe(false);
    expect(canTryAgain({ ...run, kind: "verify" })).toBe(false);
  });

  describe("the fetch queue (F10)", () => {
    const link = (runs: QueuedRun[], runId: string, profile = "jane-doe") =>
      enqueueFetch(runs, { runId, profile, kind: "new", input: { url: `https://jobs.example.com/${runId}` } });
    const brief = (runs: QueuedRun[]) => runs.map((run) => `${run.runId}:${run.status}`);

    it("keeps a link run out of the run queue while its posting is fetched", () => {
      const runs = startFetch(link(queued("a"), "b"), "b");

      expect(brief(runs)).toEqual(["a:queued", "b:fetching"]);
      expect(nextRun(runs)?.runId).toBe("a");
      expect(nextRun(startRun(runs, "a", 0))).toBeNull();
      expect(runSteps(runs[1].events).steps).toEqual([{ step: "fetch", status: "running" }]);
    });

    it("fetches the links in the order given, whether or not a run is running", () => {
      const runs = startRun(link(link(queued("a"), "b"), "c"), "a", 0);

      expect(nextFetch(runs)?.runId).toBe("b");
      expect(nextFetch(fetchDone(startFetch(runs, "b"), "b", "posting b"))?.runId).toBe("c");
      expect(nextFetch(failFetch(startFetch(runs, "b"), "b", "The page answered 403."))?.runId).toBe("c");
      expect(nextFetch(queued("a"))).toBeNull();
    });

    it("moves a run whose fetch worked to the end of the run queue, with its posting", () => {
      // "b" was given before "c", but "c" was already waiting for the model when the fetch ended.
      const runs = fetchDone(startFetch(enqueue(link(queued("a"), "b"), { runId: "c", profile: "jane-doe", kind: "new", input: null }), "b"), "b", "posting b");

      expect(brief(runs)).toEqual(["a:queued", "c:queued", "b:queued"]);
      expect(runs[2].input).toBe("posting b");
      expect(runSteps(runs[2].events).steps).toEqual([{ step: "fetch", status: "done" }]);
      expect(fetchFailed(runs[2])).toBe(false);
    });

    it("never queues a run whose fetch failed, and keeps it listed with the reason", () => {
      const runs = failFetch(startFetch(link(queued("a"), "b"), "b"), "b", "The page answered 403.");

      expect(brief(runs)).toEqual(["a:queued", "b:failed"]);
      expect(runs[1]).toMatchObject({ error: "The page answered 403.", input: { url: "https://jobs.example.com/b" } });
      expect(runs[1].events.at(-1)).toEqual({ type: "error", message: "The page answered 403." });
      expect(fetchFailed(runs[1])).toBe(true);
      expect(canTryAgain(runs[1])).toBe(true);
      expect(nextRun(startRun(runs, "a", 0))).toBeNull();
    });

    it("counts failed fetches among the finished runs it forgets", () => {
      let runs = link(link(queued(), "a"), "b");
      runs = failFetch(runs, "a", "The page answered 403.", 1);
      runs = failFetch(runs, "b", "The page answered 404.", 1);

      expect(brief(runs)).toEqual(["b:failed"]);
    });

    it("removes a run from the fetch queue, for its own profile only", () => {
      const runs = startFetch(link(link(queued(), "a"), "john-b", "john-roe"), "a");

      expect(removeWaiting(runs, "jane-doe", "john-b").removed).toBe(false);
      const { runs: left, removed } = removeWaiting(runs, "jane-doe", "a");
      expect(removed).toBe(true);
      expect(brief(left)).toEqual(["john-b:fetching"]);
    });

    it("lists the runs being fetched after the waiting ones and before the finished ones", () => {
      let runs = link(queued("a", "b", "c"), "d");
      runs = finishRun(startRun(runs, "a", 0), "a", null);
      runs = startRun(runs, "b", 0);

      expect(runsOf(runs, "jane-doe").map((run) => run.runId)).toEqual(["b", "c", "d", "a"]);
    });

    it("lists finished runs in the order they ended, a fetch that failed during a run included", () => {
      let runs = startRun(link(queued("a"), "b"), "a", 0);
      runs = failFetch(startFetch(runs, "b"), "b", "The page answered 403.");
      runs = finishRun(runs, "a", null);

      expect(runsOf(runs, "jane-doe").map((run) => run.runId)).toEqual(["a", "b"]);
    });

    it("tells a failed fetch from a run that failed later, was cancelled or is still fetching", () => {
      const fetching = [{ type: "step", step: "fetch", status: "running" }] as const;
      const fetchedThen = [...fetching, { type: "step", step: "fetch", status: "done" }, { type: "step", step: "analyse", status: "running" }] as const;

      expect(fetchFailed({ status: "failed", events: [...fetching, { type: "error", message: "The page answered 403." }] })).toBe(true);
      expect(fetchFailed({ status: "failed", events: [...fetchedThen] })).toBe(false);
      expect(fetchFailed({ status: "failed", events: [{ type: "started", at: 0 }, { type: "step", step: "analyse", status: "running" }] })).toBe(false);
      expect(fetchFailed({ status: "cancelled", events: [...fetching] })).toBe(false);
      expect(fetchFailed({ status: "fetching", events: [...fetching] })).toBe(false);
    });

    it("drops a run whose fetch failed once its posting was pasted, and no other run", () => {
      const runs = failFetch(startFetch(link(queued("a"), "b"), "b"), "b", "The page answered 403.");

      expect(brief(dropFetchFailed(runs, "jane-doe", "b"))).toEqual(["a:queued"]);
      expect(brief(dropFetchFailed(runs, "john-roe", "b"))).toEqual(["a:queued", "b:failed"]);
      expect(brief(dropFetchFailed(runs, "jane-doe", "a"))).toEqual(["a:queued", "b:failed"]);
      expect(brief(dropFetchFailed(runs, "jane-doe", "unknown"))).toEqual(["a:queued", "b:failed"]);
    });
  });

  it("reads a run's steps and context warnings from its events, leaving an unfinished step running", () => {
    expect(
      runSteps([
        { type: "started", at: STARTED },
        { type: "step", step: "analyse", status: "running" },
        { type: "warning", step: "analyse", message: "This step's prompt is large." },
        { type: "progress", step: "analyse", phase: "writing", tokens: 3 },
        { type: "step", step: "analyse", status: "done" },
        { type: "step", step: "save", status: "running" },
        { type: "step", step: "save", status: "done" },
        { type: "saved", id: "2026-11-10-globex-backend-engineer" },
        { type: "step", step: "tailor", status: "running" },
        { type: "error", message: "The model took too long." },
      ]),
    ).toEqual({
      steps: [
        { step: "analyse", status: "done" },
        { step: "save", status: "done" },
        { step: "tailor", status: "running" },
      ],
      warnings: { analyse: "This step's prompt is large." },
    });
    expect(runSteps([])).toEqual({ steps: [], warnings: {} });
  });

  it("finds the run that last asked for an application's resume, never a \"Verify again\"", () => {
    const id = "2026-11-10-globex-backend-engineer";
    const run = (runId: string, kind: QueuedRun["kind"], status: QueuedRun["status"], applicationId = id) => ({
      runId,
      kind,
      status,
      applicationId,
    });

    // As `runsOf` lists them: running, waiting in order, then the latest finished first.
    const finished = [run("retry-1", "retry", "failed"), run("new", "new", "failed")];
    expect(latestGeneration(finished, id)?.runId).toBe("retry-1");
    expect(latestGeneration([run("verify", "verify", "done"), ...finished], id)?.runId).toBe("retry-1");
    expect(latestGeneration([run("retry-2", "retry", "running"), ...finished], id)?.runId).toBe("retry-2");
    expect(
      latestGeneration(
        [run("retry-2", "retry", "running"), run("retry-3", "retry", "queued"), run("retry-4", "retry", "queued"), ...finished],
        id,
      )?.runId,
    ).toBe("retry-4");

    expect(latestGeneration([run("other", "new", "done", "2026-11-11-initech-developer")], id)).toBeNull();
    expect(latestGeneration([run("verify", "verify", "done")], id)).toBeNull();
    expect(latestGeneration([], id)).toBeNull();
  });
});
