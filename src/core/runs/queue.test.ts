import { describe, expect, it } from "vitest";
import {
  enqueue,
  findRun,
  finishRun,
  nextRun,
  recordEvent,
  removeWaiting,
  runsOf,
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

const statuses = (runs: QueuedRun[]) => runs.map((run) => `${run.runId}:${run.status}`);

/** Starts and ends the next run. */
function runNext(runs: QueuedRun[], error: string | null = null, maxFinished?: number): QueuedRun[] {
  const next = nextRun(runs);
  if (!next) throw new Error("nothing to run");
  return finishRun(startRun(runs, next.runId), next.runId, error, maxFinished);
}

describe("run queue", () => {
  it("starts the run that has waited longest, one at a time, across profiles", () => {
    let runs = queued("a", "john-b", "c");
    expect(nextRun(runs)?.runId).toBe("a");

    runs = startRun(runs, "a");
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

  it("records the events of a run, keeping only the latest progress of a step", () => {
    let runs = startRun(queued("a"), "a");
    runs = recordEvent(runs, "a", { type: "step", step: "analyse", status: "running" });
    runs = recordEvent(runs, "a", { type: "progress", step: "analyse", phase: "thinking", tokens: 10 });
    runs = recordEvent(runs, "a", { type: "progress", step: "analyse", phase: "writing", tokens: 3 });
    runs = recordEvent(runs, "a", { type: "step", step: "analyse", status: "done" });
    runs = recordEvent(runs, "a", { type: "saved", id: "2026-11-10-globex-backend-engineer" });

    expect(runs[0].events).toEqual([
      { type: "started" },
      { type: "step", step: "analyse", status: "running" },
      { type: "progress", step: "analyse", phase: "writing", tokens: 3 },
      { type: "step", step: "analyse", status: "done" },
      { type: "saved", id: "2026-11-10-globex-backend-engineer" },
    ]);
    expect(runs[0].applicationId).toBe("2026-11-10-globex-backend-engineer");
  });

  it("ends a failed run with its error as the last event", () => {
    const runs = runNext(queued("a", "b"), "Can't reach Ollama.");

    expect(runs[0]).toMatchObject({ status: "failed", error: "Can't reach Ollama." });
    expect(runs[0].events.at(-1)).toEqual({ type: "error", message: "Can't reach Ollama." });
    expect(nextRun(runs)?.runId).toBe("b");
  });

  it("forgets the oldest finished runs beyond the limit, never a waiting one", () => {
    let runs = queued("a", "b", "c", "d");
    runs = runNext(runs, null, 2);
    runs = runNext(runs, "failed", 2);
    runs = runNext(runs, null, 2);

    expect(statuses(runs)).toEqual(["b:failed", "c:done", "d:queued"]);
  });

  it("removes a waiting run, which then never starts", () => {
    const { runs, removed } = removeWaiting(startRun(queued("a", "b", "c"), "a"), "jane-doe", "b");

    expect(removed).toBe(true);
    expect(statuses(runs)).toEqual(["a:running", "c:queued"]);
    expect(nextRun(finishRun(runs, "a", null))?.runId).toBe("c");
  });

  it("doesn't remove a run that is running, finished or unknown", () => {
    const running = startRun(queued("a", "b"), "a");
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
    runs = startRun(runs, "d");

    expect(statuses(runsOf(runs, "jane-doe"))).toEqual(["d:running", "e:queued", "b:failed", "a:done"]);
    expect(statuses(runsOf(runs, "john-roe"))).toEqual(["john-c:done"]);
  });
});
