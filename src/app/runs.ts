import type { RunEvent, RunInput, RunStep } from "@/core/pipeline/run";
import type { FetchedPosting, JobFetcher } from "@/core/posting/job-fetcher";
import { INDEED_BLOCKED, isIndeedLink } from "@/core/posting/sites";
import { fetchedStart } from "@/core/posting/start";
import {
  addNotFetched,
  cancelRun,
  offersTryAgain,
  triedAgain,
  dropFetchFailed,
  enqueue,
  enqueueFetch,
  failFetch,
  fetchDone,
  fetchFailed,
  findRun,
  finishRun,
  nextFetch,
  nextRun,
  recordEvent,
  removeWaiting,
  runsOf,
  runSteps,
  startFetch,
  startRun,
  type QueueEvent,
  type QueuedRun,
  type RunKind,
  type RunStatus,
  type RunStepState,
} from "@/core/runs/queue";

// The runs the server knows about (F42). They live in memory only and are gone after a
// restart (Art. IV.1). One run uses the model at a time; the others wait their turn. A run
// started from a link has its posting fetched first, in a queue of its own that doesn't
// wait for the model, and joins the run queue only when the fetch worked (F10).

/**
 * What a run was asked to do. It stays with the run after it ends, so "Try again" can queue
 * the same posting or link. The posting is never logged or listed (Art. III.4).
 */
export interface RunRequest {
  /** A link alone is fetched first; the fetched posting then takes its place (F10). */
  start: RunInput["start"] | { url: string };
}

export type AppRun = QueuedRun<RunRequest>;

/**
 * Does a run's work, sending its events; throws when the run fails. `signal` is aborted
 * when the user cancels the run, and the work then stops as soon as it can (F32).
 */
export type ExecuteRun = (run: AppRun, send: (event: RunEvent) => void, signal: AbortSignal) => Promise<void>;

/** A run as the Runs list shows it. */
export interface RunSummary {
  runId: string;
  kind: RunKind;
  status: RunStatus;
  /** When the run started, in milliseconds since the epoch (F39). */
  startedAt?: number;
  applicationId?: string;
  /** The posting's company and role, once known (F38). */
  company?: string;
  role?: string;
  error?: string;
  /** The steps the run went through and their context-size warnings (F30, F40). */
  steps: RunStepState[];
  warnings: Partial<Record<RunStep, string>>;
  /** The Runs list offers "Try again" on the run itself: it ended before its application was saved (F19). */
  retryable: boolean;
  /**
   * The posting's link: the link as given until its fetch worked, then the address the text was
   * read from, after the LinkedIn rewrite and any redirects, which is the `url` saved in
   * `job.md` (F10, F47). For pasted text, the link kept with it.
   */
  url?: string;
  /** The run failed while fetching its link; the list offers "Paste the text instead" (F10). */
  fetchFailed: boolean;
}

/** Receives a run's events; `close` is called once, after the last one. */
export interface RunFollower {
  event(event: QueueEvent): void;
  close(): void;
}

export type RunRegistry = ReturnType<typeof createRunRegistry>;

/** The link of a run that still has to fetch its posting, or null. */
function linkToFetch(start: RunRequest["start"]): string | null {
  return "posting" in start || "id" in start ? null : start.url;
}

/** Used where no run starts from a link. */
const noFetcher: JobFetcher["fetchPosting"] = async () => ({ ok: false, reason: "Links can't be fetched here." });

/** `now` is the clock that says when a run started. */
export function createRunRegistry(
  execute: ExecuteRun,
  fetchPosting: JobFetcher["fetchPosting"] = noFetcher,
  now: () => number = Date.now,
) {
  let runs: AppRun[] = [];
  const followers = new Map<string, Set<RunFollower>>();
  /** The running run and what cancels it (F32). */
  let active: { runId: string; cancel: AbortController } | null = null;
  /** The run whose posting is being fetched and what stops the fetch (F10). */
  let fetching: { runId: string; cancel: AbortController } | null = null;

  /** Sends a run's latest event to everyone following it. */
  function publish(runId: string) {
    const event = runs.find((run) => run.runId === runId)?.events.at(-1);
    if (event) for (const follower of followers.get(runId) ?? []) follower.event(event);
  }

  function close(runId: string) {
    for (const follower of followers.get(runId) ?? []) follower.close();
    followers.delete(runId);
  }

  /** Runs the waiting runs one after another; does nothing while one is running. */
  async function work() {
    for (let run = nextRun(runs); run; run = nextRun(runs)) {
      const { runId } = run;
      runs = startRun(runs, runId, now());
      publish(runId);
      const cancel = new AbortController();
      active = { runId, cancel };
      let error: string | null = null;
      try {
        await execute(
          run,
          (event) => {
            runs = recordEvent(runs, runId, event);
            publish(runId);
          },
          cancel.signal,
        );
      } catch (thrown) {
        error = thrown instanceof Error ? thrown.message : "Something went wrong. See the server console.";
      }
      active = null;
      // A run that stopped after the user cancelled it didn't fail. One that still got
      // to its end is finished.
      const cancelled = error !== null && cancel.signal.aborted;
      runs = cancelled ? cancelRun(runs, runId) : finishRun(runs, runId, error);
      if (error !== null) publish(runId);
      close(runId);
    }
  }

  /**
   * Fetches the postings of the runs started from a link, one after another, whether or
   * not a run is using the model. A run whose fetch worked joins the run queue; the others
   * end as failed and never reach the model (F10).
   */
  async function fetchWork() {
    if (fetching) return;
    for (let run = nextFetch(runs); run; run = nextFetch(runs)) {
      const { runId, input } = run;
      const cancel = new AbortController();
      fetching = { runId, cancel };
      runs = startFetch(runs, runId);
      publish(runId);
      let fetched: FetchedPosting;
      try {
        fetched = await fetchPosting(linkToFetch(input.start) ?? "", cancel.signal);
      } catch {
        fetched = { ok: false, reason: "Something went wrong while fetching the posting." };
      }
      fetching = null;
      // Removed while its posting was being fetched.
      if (!runs.some((other) => other.runId === runId)) continue;
      const read = fetchedStart(fetched);
      if ("error" in read) {
        runs = failFetch(runs, runId, read.error);
        publish(runId);
        close(runId);
      } else {
        runs = fetchDone(runs, runId, { ...input, start: read.start });
        publish(runId);
        void work();
      }
    }
  }

  /**
   * Adds a run and returns its ID right away. One started from a link goes to the fetch
   * queue first, except an Indeed link, which is never requested: it asks for its posting's
   * text at once (F47). Any other run goes to the run queue and starts when its turn comes.
   */
  function add(profile: string, kind: RunKind, input: RunRequest): string {
    const runId = crypto.randomUUID();
    const link = linkToFetch(input.start);
    if (link !== null && isIndeedLink(link)) {
      runs = addNotFetched(runs, { runId, profile, kind, input }, INDEED_BLOCKED);
      return runId;
    }
    if (link !== null) {
      runs = enqueueFetch(runs, { runId, profile, kind, input });
      void fetchWork();
      return runId;
    }
    const applicationId = "id" in input.start ? input.start.id : undefined;
    runs = enqueue(runs, { runId, profile, kind, input, applicationId });
    void work();
    return runId;
  }

  return {
    /**
     * `replaces` is a run of this profile whose fetch failed and whose posting the user has
     * now pasted: it leaves the list, since the new run stands for it (F10).
     */
    enqueue(profile: string, kind: RunKind, input: RunRequest, replaces?: string): string {
      const runId = add(profile, kind, input);
      if (replaces !== undefined) runs = dropFetchFailed(runs, profile, replaces);
      return runId;
    },

    /** The profile's own runs, in the order the Runs list shows them (Art. III.7). */
    list(profile: string): RunSummary[] {
      return runsOf(runs, profile).map((run) => ({
        runId: run.runId,
        kind: run.kind,
        status: run.status,
        startedAt: run.startedAt,
        applicationId: run.applicationId,
        company: run.company,
        role: run.role,
        error: run.error,
        ...runSteps(run.events),
        retryable: offersTryAgain(runs, run),
        url: "url" in run.input.start ? run.input.start.url : undefined,
        fetchFailed: fetchFailed(run),
      }));
    },

    /**
     * "Try again" for a run of this profile that ended before its application was saved:
     * queues a new run with the same posting, and returns its ID (F19). A run
     * whose fetch failed has its link fetched again (F10). The button is used once: it comes
     * back only when the run it queued is no longer listed.
     */
    retry(profile: string, runId: string): { runId: string } | "refused" | "unknown" {
      const run = findRun(runs, profile, runId);
      if (!run) return "unknown";
      if (!offersTryAgain(runs, run)) return "refused";
      const again = add(profile, "new", run.input);
      runs = triedAgain(runs, runId, again);
      return { runId: again };
    },

    /**
     * Replays a run's events so far, then follows it until it ends. Returns how to stop
     * following, or null when the profile has no such run.
     */
    follow(profile: string, runId: string, follower: RunFollower): (() => void) | null {
      const run = findRun(runs, profile, runId);
      if (!run) return null;
      for (const event of run.events) follower.event(event);
      if (run.status !== "fetching" && run.status !== "queued" && run.status !== "running") {
        follower.close();
        return () => {};
      }
      // The page shows "Remove" only once it knows the run is really waiting (F42).
      if (run.status === "queued") follower.event({ type: "waiting" });
      const following = followers.get(runId) ?? new Set();
      followers.set(runId, following.add(follower));
      return () => following.delete(follower);
    },

    /**
     * Stops a run of this profile. A waiting run leaves the queue and never starts; so does
     * one in the fetch queue, whose fetch is stopped if it had begun (F10). The
     * running one is told to stop: it ends as `cancelled` once its model call has stopped,
     * and the next run starts then (F32).
     */
    remove(profile: string, runId: string): "removed" | "cancelling" | "ended" | "unknown" {
      const run = findRun(runs, profile, runId);
      if (!run) return "unknown";
      if (run.status === "running" && active?.runId === runId) {
        active.cancel.abort();
        return "cancelling";
      }
      const result = removeWaiting(runs, profile, runId);
      if (!result.removed) return "ended";
      if (fetching?.runId === runId) fetching.cancel.abort();
      runs = result.runs;
      for (const follower of followers.get(runId) ?? []) follower.event({ type: "removed" });
      close(runId);
      return "removed";
    },
  };
}
