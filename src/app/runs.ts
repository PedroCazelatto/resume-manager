import type { RunEvent, RunInput, RunStep } from "@/core/pipeline/run";
import {
  cancelRun,
  canTryAgain,
  enqueue,
  findRun,
  finishRun,
  nextRun,
  recordEvent,
  removeWaiting,
  runsOf,
  runSteps,
  startRun,
  type QueueEvent,
  type QueuedRun,
  type RunKind,
  type RunStatus,
  type RunStepState,
} from "@/core/runs/queue";

// The runs the server knows about (F42). They live in memory only and are gone after a
// restart (Art. IV.1). One run uses the model at a time; the others wait their turn.

/**
 * What a run was asked to do. It stays with the run after it ends, so "Try again" can queue
 * the same posting and language. The posting is never logged or listed (Art. III.4).
 */
export interface RunRequest {
  start: RunInput["start"];
  /** The user's choice of resume language; null means the posting's language. */
  language: string | null;
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
  /** The resume language chosen when the run was queued; null means the posting's language. */
  language: string | null;
  /** The steps the run went through and their context-size warnings (F30, F40). */
  steps: RunStepState[];
  warnings: Partial<Record<RunStep, string>>;
  /** The Runs list offers "Try again" on the run itself: it ended before its application was saved (F19). */
  retryable: boolean;
}

/** Receives a run's events; `close` is called once, after the last one. */
export interface RunFollower {
  event(event: QueueEvent): void;
  close(): void;
}

export type RunRegistry = ReturnType<typeof createRunRegistry>;

/** `now` is the clock that says when a run started. */
export function createRunRegistry(execute: ExecuteRun, now: () => number = Date.now) {
  let runs: AppRun[] = [];
  const followers = new Map<string, Set<RunFollower>>();
  /** The running run and what cancels it (F32). */
  let active: { runId: string; cancel: AbortController } | null = null;

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

  /** Adds a run to the queue and returns its ID right away; it starts when its turn comes. */
  function add(profile: string, kind: RunKind, input: RunRequest): string {
    const runId = crypto.randomUUID();
    const applicationId = "id" in input.start ? input.start.id : undefined;
    runs = enqueue(runs, { runId, profile, kind, input, applicationId });
    void work();
    return runId;
  }

  return {
    enqueue: add,

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
        language: run.input.language,
        ...runSteps(run.events),
        retryable: canTryAgain(run),
      }));
    },

    /**
     * "Try again" for a run of this profile that ended before its application was saved:
     * queues a new run with the same posting and language, and returns its ID (F19).
     */
    retry(profile: string, runId: string): { runId: string } | "refused" | "unknown" {
      const run = findRun(runs, profile, runId);
      if (!run) return "unknown";
      if (!canTryAgain(run)) return "refused";
      return { runId: add(profile, "new", run.input) };
    },

    /**
     * Replays a run's events so far, then follows it until it ends. Returns how to stop
     * following, or null when the profile has no such run.
     */
    follow(profile: string, runId: string, follower: RunFollower): (() => void) | null {
      const run = findRun(runs, profile, runId);
      if (!run) return null;
      for (const event of run.events) follower.event(event);
      if (run.status !== "queued" && run.status !== "running") {
        follower.close();
        return () => {};
      }
      const following = followers.get(runId) ?? new Set();
      followers.set(runId, following.add(follower));
      return () => following.delete(follower);
    },

    /**
     * Stops a run of this profile. A waiting run leaves the queue and never starts. The
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
      runs = result.runs;
      for (const follower of followers.get(runId) ?? []) follower.event({ type: "removed" });
      close(runId);
      return "removed";
    },
  };
}
