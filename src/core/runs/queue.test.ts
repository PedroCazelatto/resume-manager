import { describe, expect, it } from "vitest";
import {
  cancelRun,
  canTryAgain,
  enqueue,
  findRun,
  finishRun,
  latestGeneration,
  nextRun,
  recordEvent,
  removeWaiting,
  runsOf,
  runSteps,
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
