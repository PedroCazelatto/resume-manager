import type { QueuedRun } from "./queue";

// Picking a run up again after the page was reloaded or closed (F39). These functions only
// decide which run a page follows and what its timer shows; the page does the following.

/** Whole seconds since a run started; `startedAt` and `now` are milliseconds since the epoch. */
export function elapsedSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/**
 * The run that is working on an application or waiting for it, or null. `work` says which
 * part of the page asks: `resume` for a new application or "Try again", `verification` for
 * "Verify again". `runs` is one profile's list in the order of `runsOf`, so the running run
 * comes before the waiting ones, and those are in the order they will start.
 */
export function activeRun<Run extends Pick<QueuedRun, "kind" | "status" | "applicationId">>(
  runs: readonly Run[],
  applicationId: string,
  work: "resume" | "verification",
): Run | null {
  return (
    runs.find(
      (run) =>
        run.applicationId === applicationId &&
        (run.status === "running" || run.status === "queued") &&
        (run.kind === "verify") === (work === "verification"),
    ) ?? null
  );
}
