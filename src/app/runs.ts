import type { RunEvent, RunInput } from "@/core/pipeline/run";
import {
  enqueue,
  findRun,
  finishRun,
  nextRun,
  recordEvent,
  removeWaiting,
  runsOf,
  startRun,
  type QueueEvent,
  type QueuedRun,
  type RunKind,
  type RunStatus,
} from "@/core/runs/queue";

// The runs the server knows about (F42). They live in memory only and are gone after a
// restart (Art. IV.1). One run uses the model at a time; the others wait their turn.

/** What a run was asked to do. The posting it may hold is never logged (Art. III.4). */
export interface RunRequest {
  start: RunInput["start"];
  /** The user's choice of resume language; null means the posting's language. */
  language: string | null;
}

export type AppRun = QueuedRun<RunRequest>;

/** Does a run's work, sending its events; throws when the run fails. */
export type ExecuteRun = (run: AppRun, send: (event: RunEvent) => void) => Promise<void>;

/** A run as the Runs list shows it. */
export interface RunSummary {
  runId: string;
  kind: RunKind;
  status: RunStatus;
  applicationId?: string;
  error?: string;
  language: string | null;
}

/** Receives a run's events; `close` is called once, after the last one. */
export interface RunFollower {
  event(event: QueueEvent): void;
  close(): void;
}

export type RunRegistry = ReturnType<typeof createRunRegistry>;

export function createRunRegistry(execute: ExecuteRun) {
  let runs: AppRun[] = [];
  const followers = new Map<string, Set<RunFollower>>();

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
      runs = startRun(runs, runId);
      publish(runId);
      let error: string | null = null;
      try {
        await execute(run, (event) => {
          runs = recordEvent(runs, runId, event);
          publish(runId);
        });
      } catch (thrown) {
        error = thrown instanceof Error ? thrown.message : "Something went wrong. See the server console.";
      }
      runs = finishRun(runs, runId, error);
      if (error !== null) publish(runId);
      close(runId);
    }
  }

  return {
    /** Adds a run to the queue and returns its ID right away; it starts when its turn comes. */
    enqueue(profile: string, kind: RunKind, input: RunRequest): string {
      const runId = crypto.randomUUID();
      const applicationId = "id" in input.start ? input.start.id : undefined;
      runs = enqueue(runs, { runId, profile, kind, input, applicationId });
      void work();
      return runId;
    },

    /** The profile's own runs, in the order the Runs list shows them (Art. III.7). */
    list(profile: string): RunSummary[] {
      return runsOf(runs, profile).map(({ runId, kind, status, applicationId, error, input }) => ({
        runId,
        kind,
        status,
        applicationId,
        error,
        language: input.language,
      }));
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

    /** Takes a waiting run of this profile off the queue, so it never starts. */
    remove(profile: string, runId: string): "removed" | "not-waiting" | "unknown" {
      if (!findRun(runs, profile, runId)) return "unknown";
      const result = removeWaiting(runs, profile, runId);
      if (!result.removed) return "not-waiting";
      runs = result.runs;
      for (const follower of followers.get(runId) ?? []) follower.event({ type: "removed" });
      close(runId);
      return "removed";
    },
  };
}
