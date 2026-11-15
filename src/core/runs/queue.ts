import type { RunEvent } from "../pipeline/run";

// The run queue (F42): one run uses the model at a time, the others wait in order. These
// functions only compute the next list of runs; the app keeps the list in memory (Art. IV.1).

export type RunStatus = "queued" | "running" | "done" | "failed" | "cancelled";

/** A new application from a pasted posting, "Try again" or "Verify again" on a saved one. */
export type RunKind = "new" | "retry" | "verify";

/** What a run's event stream carries: the pipeline's events, plus what the queue did with the run. */
export type QueueEvent = RunEvent | { type: "started" } | { type: "removed" } | { type: "cancelled" };

export interface QueuedRun<Input = unknown> {
  runId: string;
  /** The profile the run belongs to; no other profile sees it (Art. III.7). */
  profile: string;
  kind: RunKind;
  input: Input;
  status: RunStatus;
  /** The application folder, once it exists. */
  applicationId?: string;
  /** Every event sent so far, so a stream opened late can replay them. */
  events: QueueEvent[];
  /** Why the run failed. */
  error?: string;
}

export const MAX_FINISHED_RUNS = 50;

const isFinished = (run: QueuedRun) => run.status !== "queued" && run.status !== "running";

function update<I>(runs: readonly QueuedRun<I>[], runId: string, change: (run: QueuedRun<I>) => QueuedRun<I>) {
  return runs.map((run) => (run.runId === runId ? change(run) : run));
}

/** Adds a waiting run at the end of the queue. */
export function enqueue<I>(
  runs: readonly QueuedRun<I>[],
  run: Pick<QueuedRun<I>, "runId" | "profile" | "kind" | "input" | "applicationId">,
): QueuedRun<I>[] {
  return [...runs, { ...run, status: "queued", events: [] }];
}

/** The run to start now: the one that has waited longest, or null while another is running. */
export function nextRun<I>(runs: readonly QueuedRun<I>[]): QueuedRun<I> | null {
  if (runs.some((run) => run.status === "running")) return null;
  return runs.find((run) => run.status === "queued") ?? null;
}

/** Adds an event to a run's history. Only the latest progress of a step is kept. */
export function recordEvent<I>(runs: readonly QueuedRun<I>[], runId: string, event: QueueEvent): QueuedRun<I>[] {
  return update(runs, runId, (run) => {
    const last = run.events.at(-1);
    const replaces = event.type === "progress" && last?.type === "progress" && last.step === event.step;
    const events = [...(replaces ? run.events.slice(0, -1) : run.events), event];
    const applicationId = event.type === "saved" || event.type === "done" ? event.id : run.applicationId;
    return { ...run, events, ...(applicationId === undefined ? {} : { applicationId }) };
  });
}

/** Marks a waiting run as running. */
export function startRun<I>(runs: readonly QueuedRun<I>[], runId: string): QueuedRun<I>[] {
  const started = update(runs, runId, (run) => ({ ...run, status: "running" }));
  return recordEvent(started, runId, { type: "started" });
}

/** Forgets the oldest finished runs beyond `maxFinished`. */
function forgetOldest<I>(runs: QueuedRun<I>[], maxFinished: number): QueuedRun<I>[] {
  // Finished runs sit in the list in the order they ended, because only one runs at a time.
  const finished = runs.filter(isFinished);
  const forgotten = new Set(finished.slice(0, Math.max(0, finished.length - maxFinished)).map((run) => run.runId));
  return runs.filter((run) => !forgotten.has(run.runId));
}

/** Ends the running run, and forgets the oldest finished runs beyond `maxFinished`. */
export function finishRun<I>(
  runs: readonly QueuedRun<I>[],
  runId: string,
  error: string | null,
  maxFinished = MAX_FINISHED_RUNS,
): QueuedRun<I>[] {
  const ended =
    error === null
      ? update(runs, runId, (run) => ({ ...run, status: "done" }))
      : recordEvent(
          update(runs, runId, (run) => ({ ...run, status: "failed", error })),
          runId,
          { type: "error", message: error },
        );
  return forgetOldest(ended, maxFinished);
}

/** Ends the running run as cancelled by the user, which is not a failure (F32). */
export function cancelRun<I>(runs: readonly QueuedRun<I>[], runId: string, maxFinished = MAX_FINISHED_RUNS): QueuedRun<I>[] {
  const cancelled = update(runs, runId, (run) => ({ ...run, status: "cancelled" }));
  return forgetOldest(recordEvent(cancelled, runId, { type: "cancelled" }), maxFinished);
}

/** A profile's own run, or null: another profile's run is as good as unknown (Art. III.7). */
export function findRun<I>(runs: readonly QueuedRun<I>[], profile: string, runId: string): QueuedRun<I> | null {
  return runs.find((run) => run.runId === runId && run.profile === profile) ?? null;
}

/** Takes a waiting run of this profile off the queue. Any other run stays where it is. */
export function removeWaiting<I>(
  runs: readonly QueuedRun<I>[],
  profile: string,
  runId: string,
): { runs: QueuedRun<I>[]; removed: boolean } {
  const run = findRun(runs, profile, runId);
  if (run?.status !== "queued") return { runs: [...runs], removed: false };
  return { runs: runs.filter((other) => other !== run), removed: true };
}

/** A profile's runs as the Runs list shows them: the active one, the waiting ones in order, then the latest finished first. */
export function runsOf<I>(runs: readonly QueuedRun<I>[], profile: string): QueuedRun<I>[] {
  const own = runs.filter((run) => run.profile === profile);
  return [
    ...own.filter((run) => run.status === "running"),
    ...own.filter((run) => run.status === "queued"),
    ...own.filter(isFinished).reverse(),
  ];
}
