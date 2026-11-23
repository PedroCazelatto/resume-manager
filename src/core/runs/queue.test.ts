import { describe, expect, it } from "vitest";
import {
  addNotFetched,
  archiveRuns,
  archiveTarget,
  canArchive,
  cancelRun,
  canTryAgain,
  cancelNotFetched,
  enqueue,
  enqueueFetch,
  failFetch,
  fetchDone,
  fetchFailed,
  findRun,
  finishRun,
  forgetApplication,
  madeApplication,
  moveApplication,
  nextFetch,
  nextRun,
  offersTryAgain,
  pasteText,
  recordEvent,
  removeLink,
  restoreRuns,
  runsOf,
  runSteps,
  startFetch,
  startRun,
  stopAction,
  triedAgain,
  waitingToFetch,
  type QueueEvent,
  type QueuedRun,
} from "./queue";

const APPLICATION = "3f2b8c1e-5a7d-4c9e-9b1a-2d6e8f0c4a73";

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
    expect(runs[0].job).toBeUndefined();
  });

  it("keeps what a run tells about its job when its application is saved (F38, F46)", () => {
    const job = { title: "Backend Engineer", company: "Globex", companyUrl: "https://globex.example/", source: "LinkedIn" };
    let runs = startRun(queued("a"), "a", STARTED);
    runs = recordEvent(runs, "a", { type: "saved", id: "2026-11-10-globex-backend-engineer", job });
    runs = recordEvent(runs, "a", { type: "step", step: "tailor", status: "running" });

    expect(runs[0]).toMatchObject({ job });
    expect(finishRun(runs, "a", "Can't reach Ollama.")[0]).toMatchObject({ status: "failed", job });
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
    expect(removeLink(runs, "jane-doe", "a").removed).toBe(false);
  });

  it("forgets the oldest finished runs beyond the limit, never a waiting one", () => {
    let runs = queued("a", "b", "c", "d");
    runs = runNext(runs, null, 2);
    runs = runNext(runs, "failed", 2);
    runs = runNext(runs, null, 2);

    expect(statuses(runs)).toEqual(["b:failed", "c:done", "d:queued"]);
  });

  it("cancels a waiting run, which stays listed as cancelled, can be tried again and never starts (F48)", () => {
    const runs = cancelRun(startRun(queued("a", "b", "c"), "a", STARTED), "b");

    expect(statuses(runs)).toEqual(["a:running", "b:cancelled", "c:queued"]);
    expect(runs[1].events).toEqual([{ type: "cancelled" }]);
    expect(runs[1].error).toBeUndefined();
    expect(offersTryAgain(runs, runs[1])).toBe(true);
    expect(nextRun(finishRun(runs, "a", null))?.runId).toBe("c");
    expect(statuses(runsOf(runs, "jane-doe"))).toEqual(["a:running", "c:queued", "b:cancelled"]);
  });

  it("has an X that removes a link of the fetch queue or cancels a waiting or running run, and none on a run that ended (F48)", () => {
    expect(stopAction({ status: "fetching" })).toBe("remove");
    expect(stopAction({ status: "queued" })).toBe("cancel");
    expect(stopAction({ status: "running" })).toBe("cancel");
    // A failed run can't be cancelled: it has "Try again" and the archive button instead.
    expect(stopAction({ status: "failed" })).toBeNull();
    // Except an Indeed link's run that needs its text, while it isn't archived (F26).
    expect(stopAction({ status: "failed", notFetched: true })).toBe("cancel");
    expect(stopAction({ status: "failed", notFetched: true, archivedAt: "2026-11-23T10:00:00.000Z" })).toBeNull();
    expect(stopAction({ status: "cancelled", notFetched: true })).toBeNull();
    expect(stopAction({ status: "cancelled" })).toBeNull();
    expect(stopAction({ status: "done" })).toBeNull();
  });

  it("removes only a link of the fetch queue, never a run that waits, runs, ended or is unknown (F48)", () => {
    const running = startRun(queued("a", "b"), "a", STARTED);
    const finished = finishRun(running, "a", null);

    expect(removeLink(running, "jane-doe", "a")).toEqual({ runs: running, removed: false });
    expect(removeLink(running, "jane-doe", "b")).toEqual({ runs: running, removed: false });
    expect(removeLink(finished, "jane-doe", "a").removed).toBe(false);
    expect(removeLink(finished, "jane-doe", "nope").removed).toBe(false);
  });

  it("keeps one profile from finding or removing another's run (Art. III.7)", () => {
    const runs = queued("a", "john-b");

    expect(findRun(runs, "jane-doe", "john-b")).toBeNull();
    expect(findRun(runs, "john-roe", "john-b")?.runId).toBe("john-b");
    expect(removeLink(runs, "jane-doe", "john-b")).toEqual({ runs, removed: false });
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

  it("offers \"Try again\" once, and again when the run it queued is no longer listed", () => {
    let runs = finishRun(startRun(queued("a"), "a", STARTED), "a", "Can't reach Ollama.");
    expect(offersTryAgain(runs, runs[0])).toBe(true);

    runs = triedAgain(enqueue(runs, { runId: "b", profile: "jane-doe", kind: "new", input: null }), "a", "b");
    expect(offersTryAgain(runs, findRun(runs, "jane-doe", "a")!)).toBe(false);

    // The new run failed too: it has the button, the first one still doesn't.
    const failedAgain = finishRun(startRun(runs, "b", STARTED), "b", "Can't reach Ollama.");
    expect(offersTryAgain(failedAgain, findRun(failedAgain, "jane-doe", "b")!)).toBe(true);
    expect(offersTryAgain(failedAgain, findRun(failedAgain, "jane-doe", "a")!)).toBe(false);

    // The new run was cancelled while it waited: it stays listed, with its own button (F48).
    const cancelled = cancelRun(runs, "b");
    expect(offersTryAgain(cancelled, findRun(cancelled, "jane-doe", "b")!)).toBe(true);
    expect(offersTryAgain(cancelled, findRun(cancelled, "jane-doe", "a")!)).toBe(false);

    // The new run has left the list: the posting can be tried again from the first.
    const left = runs.filter((run) => run.runId !== "b");
    expect(offersTryAgain(left, findRun(left, "jane-doe", "a")!)).toBe(true);
  });

  it("offers \"Try again\" on a new run that failed or was cancelled before its analysis was saved", () => {
    const run = { kind: "new", status: "failed", events: [] as QueueEvent[] } as const;
    expect(canTryAgain(run)).toBe(true);
    expect(canTryAgain({ ...run, status: "cancelled" })).toBe(true);

    // Once its analysis is saved, the application's page tries again (F19). The folder itself is
    // made when the link's fetch starts, so it doesn't decide (F50).
    expect(canTryAgain({ ...run, events: [{ type: "saved", id: APPLICATION }] })).toBe(false);
    expect(canTryAgain({ ...run, status: "queued" })).toBe(false);
    expect(canTryAgain({ ...run, status: "running" })).toBe(false);
    expect(canTryAgain({ ...run, status: "done" })).toBe(false);
    expect(canTryAgain({ ...run, kind: "retry" })).toBe(false);
    expect(canTryAgain({ ...run, kind: "verify" })).toBe(false);
  });

  it("keeps \"Try again\" on a failed fetch, whose application was made when its fetch started (F50)", () => {
    const fetching = madeApplication(
      startFetch(enqueueFetch([], { runId: "a", profile: "jane-doe", kind: "new", input: null }), "a"),
      "a",
      APPLICATION,
    );
    expect(fetching[0].applicationId).toBe(APPLICATION);

    const failed = failFetch(fetching, "a", "The page answered 403.");
    expect(failed[0]).toMatchObject({ status: "failed", applicationId: APPLICATION });
    expect(canTryAgain(failed[0])).toBe(true);
    // A link fetched again into its application ("Try again" from its page) keeps it when it fails too.
    expect(canTryAgain({ ...failed[0], kind: "retry" })).toBe(true);
    expect(canTryAgain({ ...failed[0], kind: "verify" })).toBe(false);
  });

  it("offers no \"Try again\" on a row while another run of its application is going (F50)", () => {
    const failed = failFetch(
      startFetch(enqueueFetch([], { runId: "a", profile: "jane-doe", kind: "new", input: null, applicationId: APPLICATION }), "a"),
      "a",
      "The page answered 403.",
    );
    expect(offersTryAgain(failed, failed[0])).toBe(true);

    // The link was added again, so its application started again in another run.
    const again = enqueueFetch(failed, { runId: "b", profile: "jane-doe", kind: "retry", input: null, applicationId: APPLICATION });
    expect(offersTryAgain(again, findRun(again, "jane-doe", "a")!)).toBe(false);

    const ended = failFetch(startFetch(again, "b"), "b", "The page answered 403.");
    expect(offersTryAgain(ended, findRun(ended, "jane-doe", "a")!)).toBe(true);
    expect(offersTryAgain(ended, findRun(ended, "jane-doe", "b")!)).toBe(true);
  });

  it("enqueues a link to fetch again into its application, and an Indeed link with its application (F50)", () => {
    const runs = enqueueFetch([], { runId: "a", profile: "jane-doe", kind: "retry", input: null, applicationId: APPLICATION });
    const indeed = addNotFetched(runs, { runId: "b", profile: "jane-doe", kind: "new", input: null, applicationId: APPLICATION }, "Indeed.");

    expect(indeed.map((run) => [run.status, run.applicationId])).toEqual([
      ["fetching", APPLICATION],
      ["failed", APPLICATION],
    ]);
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

      expect(removeLink(runs, "jane-doe", "john-b").removed).toBe(false);
      const { runs: left, removed } = removeLink(runs, "jane-doe", "a");
      expect(removed).toBe(true);
      expect(brief(left)).toEqual(["john-b:fetching"]);
    });

    it("tells a link waiting for its turn from the one being fetched (F48)", () => {
      const runs = startFetch(link(link(queued(), "a"), "b"), "a");
      const waiting = (run: QueuedRun) => waitingToFetch({ status: run.status, steps: runSteps(run.events).steps });

      expect(runs.map(waiting)).toEqual([false, true]);
      // Once its own fetch has begun, the second one is fetching too.
      const next = startFetch(failFetch(runs, "a", "The page answered 403."), "b");
      expect(next.map(waiting)).toEqual([false, false]);
      // Only a run of the fetch queue waits to fetch.
      expect(queued("c").map(waiting)).toEqual([false]);
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
      // Only a failed fetch that was archived and restored is cancelled with its fetch unfinished (F48).
      expect(fetchFailed({ status: "cancelled", events: [...fetching] })).toBe(true);
      expect(fetchFailed({ status: "cancelled", events: [...fetchedThen, { type: "cancelled" }] })).toBe(false);
      expect(fetchFailed({ status: "fetching", events: [...fetching] })).toBe(false);
    });

    it("moves the same run to the end of the run queue once its posting was pasted (F48)", () => {
      let runs = failFetch(startFetch(link(queued("a"), "b"), "b"), "b", "The page answered 403.");
      runs = enqueue(runs, { runId: "c", profile: "jane-doe", kind: "new", input: null });
      const text = { posting: "Globex is hiring.", url: "https://jobs.example.com/b" };

      const { runs: pasted, pasted: moved } = pasteText(runs, "jane-doe", "b", text);

      expect(moved).toBe(true);
      expect(brief(pasted)).toEqual(["a:queued", "c:queued", "b:queued"]);
      expect(pasted[2]).toEqual({ runId: "b", profile: "jane-doe", kind: "new", input: text, status: "queued", events: [] });
      // It no longer needs its text, and it starts when its turn comes.
      expect(fetchFailed(pasted[2])).toBe(false);
      expect(waitingToFetch({ status: pasted[2].status, steps: runSteps(pasted[2].events).steps })).toBe(false);
      expect(nextRun(finishRun(finishRun(startRun(pasted, "a", 0), "a", null), "c", null))?.runId).toBe("b");
    });

    it("pastes only on a run of the same profile that needs its text", () => {
      const runs = failFetch(startFetch(link(queued("a"), "b"), "b"), "b", "The page answered 403.");
      const text = { posting: "Globex is hiring.", url: "https://jobs.example.com/b" };
      const failedLater = finishRun(startRun(runs, "a", 0), "a", "Can't reach Ollama.");

      expect(pasteText(runs, "john-roe", "b", text)).toEqual({ runs, pasted: false });
      expect(pasteText(runs, "jane-doe", "a", text)).toEqual({ runs, pasted: false });
      expect(pasteText(runs, "jane-doe", "unknown", text)).toEqual({ runs, pasted: false });
      expect(pasteText(failedLater, "jane-doe", "a", text).pasted).toBe(false);
      expect(pasteText(link(queued(), "d"), "jane-doe", "d", text).pasted).toBe(false);
    });
  });

  describe("a link the server never requests (F47)", () => {
    const INDEED_BLOCKED = "Indeed blocks automated requests. Paste the posting's text instead.";
    const indeed = (runs: QueuedRun[], runId: string, profile = "jane-doe", maxFinished?: number) =>
      addNotFetched(runs, { runId, profile, kind: "new", input: { url: "https://ie.indeed.com/viewjob?jk=1" } }, INDEED_BLOCKED, maxFinished);

    it("never enters the fetch queue or the run queue, and starts as needing the posting's text", () => {
      const runs = indeed(queued(), "a");

      expect(nextFetch(runs)).toBeNull();
      expect(nextRun(runs)).toBeNull();
      expect(runs[0]).toMatchObject({ status: "failed", error: INDEED_BLOCKED, notFetched: true, input: { url: "https://ie.indeed.com/viewjob?jk=1" } });
      expect(runs[0].events).toEqual([{ type: "error", message: INDEED_BLOCKED }]);
      // No step was taken: nothing was fetched.
      expect(runSteps(runs[0].events).steps).toEqual([]);
      expect(fetchFailed(runs[0])).toBe(true);
    });

    it("offers no \"Try again\", which would fetch the link", () => {
      const runs = indeed(queued(), "a");

      expect(canTryAgain(runs[0])).toBe(false);
      expect(offersTryAgain(runs, runs[0])).toBe(false);
    });

    it("moves on with its pasted text, like a failed fetch, for its own profile only (F48)", () => {
      const runs = indeed(queued("b"), "a");
      const text = { posting: "Globex is hiring.", url: "https://ie.indeed.com/viewjob?jk=1" };

      expect(statuses(pasteText(runs, "john-roe", "a", text).runs)).toEqual(["b:queued", "a:failed"]);
      const pasted = pasteText(runs, "jane-doe", "a", text).runs;
      expect(statuses(pasted)).toEqual(["b:queued", "a:queued"]);
      expect(pasted[1].notFetched).toBeUndefined();
      expect(pasted[1].error).toBeUndefined();

      // If its generation fails later, "Try again" queues the pasted text: it has nothing left to fetch.
      const failed = finishRun(startRun(finishRun(startRun(pasted, "b", 0), "b", null), "a", 0), "a", "Can't reach Ollama.");
      expect(fetchFailed(findRun(failed, "jane-doe", "a")!)).toBe(false);
      expect(canTryAgain(findRun(failed, "jane-doe", "a")!)).toBe(true);
    });

    it("is cancelled where it stands, still taking its pasted text and never offering \"Try again\" (F26)", () => {
      const runs = indeed(runNext(queued("a", "b")), "c");
      const failedFetch = failFetch(enqueueFetch(runs, { runId: "d", profile: "jane-doe", kind: "new", input: null }), "d", "Not found.");

      const result = cancelNotFetched(failedFetch, "jane-doe", "c");
      // It keeps its place among the runs: nothing moves.

      expect(result.cancelled).toBe(true);
      expect(statuses(result.runs)).toEqual(["a:done", "b:queued", "c:cancelled", "d:failed"]);
      const cancelled = findRun(result.runs, "jane-doe", "c")!;
      expect(cancelled).toMatchObject({ error: INDEED_BLOCKED, notFetched: true });
      expect(cancelled.events.at(-1)).toEqual({ type: "cancelled" });
      expect(fetchFailed(cancelled)).toBe(true);
      expect(canTryAgain(cancelled)).toBe(false);
      expect(stopAction(cancelled)).toBeNull();
      expect(canArchive(result.runs, cancelled)).toBe(true);
      expect(pasteText(result.runs, "jane-doe", "c", { posting: "Globex is hiring." }).pasted).toBe(true);
    });

    it("cancels only an Indeed run of its own profile that needs its text and isn't archived (F26)", () => {
      const runs = failFetch(enqueueFetch(indeed(queued("a"), "c"), { runId: "d", profile: "jane-doe", kind: "new", input: null }), "d", "Not found.");
      const archived = archiveRuns(runs, "jane-doe", { runId: "c" }, "2026-11-23T10:00:00.000Z");
      const unchanged = (result: { runs: QueuedRun[]; cancelled: boolean }) => expect(result).toEqual({ runs, cancelled: false });

      unchanged(cancelNotFetched(runs, "john-roe", "c"));
      unchanged(cancelNotFetched(runs, "jane-doe", "d"));
      unchanged(cancelNotFetched(runs, "jane-doe", "a"));
      unchanged(cancelNotFetched(runs, "jane-doe", "nope"));
      expect(cancelNotFetched(archived, "jane-doe", "c")).toEqual({ runs: archived, cancelled: false });
      // Once cancelled, it can't be cancelled again.
      expect(cancelNotFetched(cancelNotFetched(runs, "jane-doe", "c").runs, "jane-doe", "c").cancelled).toBe(false);
    });

    it("is listed as the latest finished run, and counts among the finished runs it forgets", () => {
      let runs = runNext(queued("a", "b"));
      runs = indeed(runs, "c");

      expect(runsOf(runs, "jane-doe").map((run) => run.runId)).toEqual(["b", "c", "a"]);
      expect(statuses(indeed(runs, "d", "jane-doe", 1))).toEqual(["b:queued", "d:failed"]);
    });
  });

  describe("archiving and restoring (F48)", () => {
    const AT = "2026-11-21T20:45:00.000Z";
    const APP = "2026-11-10-globex-backend-engineer";
    const listed = (runs: QueuedRun[], profile = "jane-doe") => runsOf(runs, profile).map((run) => run.runId);
    const archivable = (runs: QueuedRun[]) => runs.map((run) => `${run.runId}:${canArchive(runs, run)}`);

    /** a finished, b failed, c cancelled, d running, e waiting, f fetching. */
    function everyKind(): QueuedRun[] {
      let runs = queued("a", "b", "c", "d", "e");
      runs = runNext(runs);
      runs = runNext(runs, "Can't reach Ollama.");
      runs = cancelRun(startRun(runs, "c", STARTED), "c");
      runs = startRun(runs, "d", STARTED);
      return enqueueFetch(runs, { runId: "f", profile: "jane-doe", kind: "new", input: { url: "https://jobs.example.com/f" } });
    }

    it("offers the archive button on cancelled, failed and finished runs only", () => {
      expect(archivable(everyKind())).toEqual(["a:true", "b:true", "c:true", "d:false", "e:false", "f:false"]);
    });

    it("offers it on a failed fetch and an Indeed link's run too", () => {
      let runs = failFetch(startFetch(enqueueFetch(queued(), { runId: "a", profile: "jane-doe", kind: "new", input: null }), "a"), "a", "The page answered 403.");
      runs = addNotFetched(runs, { runId: "b", profile: "jane-doe", kind: "new", input: null }, "Indeed blocks automated requests.");

      expect(archivable(runs)).toEqual(["a:true", "b:true"]);
    });

    it("takes the row out of the list at once, deletes nothing, and keeps the time", () => {
      const runs = everyKind();
      const archived = archiveRuns(runs, "jane-doe", { runId: "b" }, AT);

      expect(listed(archived)).toEqual(["d", "e", "f", "c", "a"]);
      expect(archived).toHaveLength(runs.length);
      expect(findRun(archived, "jane-doe", "b")).toMatchObject({ status: "failed", archivedAt: AT, error: "Can't reach Ollama." });
      expect(canArchive(archived, findRun(archived, "jane-doe", "b")!)).toBe(false);
      // An archived run has no "Try again" until it is restored.
      expect(offersTryAgain(archived, findRun(archived, "jane-doe", "b")!)).toBe(false);
    });

    it("archives only ended runs, and only the profile's own (Art. III.7)", () => {
      const runs = everyKind();

      expect(archiveRuns(runs, "jane-doe", { runId: "d" }, AT)).toEqual(runs);
      expect(archiveRuns(runs, "jane-doe", { runId: "e" }, AT)).toEqual(runs);
      expect(archiveRuns(runs, "john-roe", { runId: "a" }, AT)).toEqual(runs);
    });

    it("archives an application with every run of it that ended, and not while one of them waits or runs", () => {
      let runs = queued("a", "b", "c");
      runs = startRun(runs, "a", STARTED);
      runs = recordEvent(runs, "a", { type: "saved", id: APP });
      runs = finishRun(runs, "a", "The model took too long.");
      runs = enqueue(runs, { runId: "d", profile: "jane-doe", kind: "retry", input: null, applicationId: APP });

      // "Try again" on the application is waiting: its failed run can't be archived yet.
      expect(archiveTarget(findRun(runs, "jane-doe", "a")!)).toEqual({ applicationId: APP });
      expect(canArchive(runs, findRun(runs, "jane-doe", "a")!)).toBe(false);

      runs = runNext(runNext(runs));
      runs = finishRun(startRun(runs, "d", STARTED), "d", null);
      expect(canArchive(runs, findRun(runs, "jane-doe", "a")!)).toBe(true);

      const archived = archiveRuns(runs, "jane-doe", { applicationId: APP }, AT);
      expect(listed(archived)).toEqual(["c", "b"]);
    });

    it("restores a failed or cancelled run as cancelled with Try again, and a finished one as it was", () => {
      let runs = everyKind();
      for (const runId of ["a", "b", "c"]) runs = archiveRuns(runs, "jane-doe", { runId }, AT);
      expect(listed(runs)).toEqual(["d", "e", "f"]);

      expect(restoreRuns(runs, "john-roe", { runId: "b" })).toEqual(runs);
      for (const runId of ["a", "b", "c"]) runs = restoreRuns(runs, "jane-doe", { runId });

      expect(statuses(runsOf(runs, "jane-doe"))).toEqual(["d:running", "e:queued", "f:fetching", "c:cancelled", "b:cancelled", "a:done"]);
      expect(runs.every((run) => run.archivedAt === undefined)).toBe(true);
      expect(offersTryAgain(runs, findRun(runs, "jane-doe", "b")!)).toBe(true);
      expect(offersTryAgain(runs, findRun(runs, "jane-doe", "a")!)).toBe(false);
    });

    it("restores a failed fetch as cancelled that still asks for the posting's text, an Indeed link's without Try again", () => {
      let runs = failFetch(startFetch(enqueueFetch(queued(), { runId: "a", profile: "jane-doe", kind: "new", input: null }), "a"), "a", "The page answered 403.");
      runs = addNotFetched(runs, { runId: "b", profile: "jane-doe", kind: "new", input: null }, "Indeed blocks automated requests.");
      // While archived, it takes no pasted text.
      expect(pasteText(archiveRuns(runs, "jane-doe", { runId: "b" }, AT), "jane-doe", "b", "pasted").pasted).toBe(false);
      for (const runId of ["a", "b"]) runs = restoreRuns(archiveRuns(runs, "jane-doe", { runId }, AT), "jane-doe", { runId });

      const [fetched, indeed] = ["a", "b"].map((runId) => findRun(runs, "jane-doe", runId)!);
      expect([fetched.status, indeed.status]).toEqual(["cancelled", "cancelled"]);
      expect([fetchFailed(fetched), fetchFailed(indeed)]).toEqual([true, true]);
      expect([offersTryAgain(runs, fetched), offersTryAgain(runs, indeed)]).toEqual([true, false]);
      expect(pasteText(runs, "jane-doe", "b", "pasted").pasted).toBe(true);
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
});

describe("renamed and deleted applications (F50)", () => {
  const OLD = "2026-11-10-globex-backend-engineer";

  it("names a renamed application's runs and events by its new folder, in its profile only", () => {
    let runs = enqueue(queued("john-a"), { runId: "a", profile: "jane-doe", kind: "verify", input: null, applicationId: OLD });
    runs = recordEvent(runs, "a", { type: "saved", id: OLD });
    runs = enqueue(runs, { runId: "b", profile: "jane-doe", kind: "retry", input: null, applicationId: APPLICATION });
    runs = runs.map((run) => (run.runId === "john-a" ? { ...run, applicationId: OLD } : run));

    const moved = moveApplication(runs, "jane-doe", OLD, APPLICATION.replace("3f2b", "0000"));

    expect(moved.map((run) => [run.runId, run.applicationId])).toEqual([
      ["john-a", OLD],
      ["a", APPLICATION.replace("3f2b", "0000")],
      ["b", APPLICATION],
    ]);
    expect(moved[1].events).toEqual([{ type: "saved", id: APPLICATION.replace("3f2b", "0000") }]);
  });

  it("forgets a deleted application's runs, in its profile only", () => {
    const runs = [
      ...enqueue([], { runId: "a", profile: "jane-doe", kind: "verify", input: null, applicationId: OLD }),
      ...enqueue([], { runId: "john-a", profile: "john-roe", kind: "verify", input: null, applicationId: OLD }),
      ...enqueue([], { runId: "c", profile: "jane-doe", kind: "new", input: null }),
    ];

    expect(forgetApplication(runs, "jane-doe", OLD).map((run) => run.runId)).toEqual(["john-a", "c"]);
  });
});
