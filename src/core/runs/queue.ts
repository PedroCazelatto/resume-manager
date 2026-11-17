import type { RunEvent, RunStep } from "../pipeline/run";

// The run queue (F42): one run uses the model at a time, the others wait in order. A run
// started from a link first passes through the fetch queue (F10): its posting is fetched,
// one link at a time and without waiting for the model, and only a run whose fetch worked
// joins the run queue. These functions only compute the next list of runs; the app keeps
// the list in memory (Art. IV.1).

/** `fetching`: in the fetch queue, waiting for its posting or downloading it (F10). */
export type RunStatus = "fetching" | "queued" | "running" | "done" | "failed" | "cancelled";

/** A new application from a pasted posting or a link, "Try again" or "Verify again" on a saved one. */
export type RunKind = "new" | "retry" | "verify";

/** What a run's event stream carries: the pipeline's events, plus what the queue did with the run. */
export type QueueEvent =
  | RunEvent
  /** Told to a page that starts following a run that hasn't started yet; never kept in the run's history. */
  | { type: "waiting" }
  | { type: "started"; at: number }
  | { type: "removed" }
  | { type: "cancelled" };

export interface QueuedRun<Input = unknown> {
  runId: string;
  /** The profile the run belongs to; no other profile sees it (Art. III.7). */
  profile: string;
  kind: RunKind;
  input: Input;
  status: RunStatus;
  /** When the run started, in milliseconds since the epoch; a page opened later counts from it (F39). */
  startedAt?: number;
  /** The application folder, once it exists. */
  applicationId?: string;
  /** The posting's company and role, once the run has told them (F38). */
  company?: string;
  role?: string;
  /** Every event sent so far, so a stream opened late can replay them. */
  events: QueueEvent[];
  /** Why the run failed. */
  error?: string;
  /** The run that "Try again" queued in this one's place (F19). */
  triedAgainAs?: string;
}

/** A step of a run and how far it got. */
export interface RunStepState {
  step: RunStep;
  status: "running" | "done";
}

export const MAX_FINISHED_RUNS = 50;

const isFinished = (run: QueuedRun) => run.status === "done" || run.status === "failed" || run.status === "cancelled";

/** Changes a run and puts it last in the list: at the end of the run queue. */
function moveToEnd<I>(runs: readonly QueuedRun<I>[], runId: string, change: (run: QueuedRun<I>) => QueuedRun<I>) {
  const run = runs.find((other) => other.runId === runId);
  return run ? [...runs.filter((other) => other !== run), change(run)] : [...runs];
}

/**
 * Changes a run that has just ended, keeping the finished runs in the order they ended: a
 * fetch can fail while an earlier run is still running, so the run moves behind any
 * finished run that sits after it.
 */
function endRun<I>(runs: readonly QueuedRun<I>[], runId: string, change: (run: QueuedRun<I>) => QueuedRun<I>) {
  const index = runs.findIndex((run) => run.runId === runId);
  const lastFinished = runs.findLastIndex(isFinished);
  if (index === -1 || lastFinished < index) return update(runs, runId, change);
  return [...runs.slice(0, index), ...runs.slice(index + 1, lastFinished + 1), change(runs[index]), ...runs.slice(lastFinished + 1)];
}

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

/** Adds a run started from a link at the end of the fetch queue (F10). */
export function enqueueFetch<I>(
  runs: readonly QueuedRun<I>[],
  run: Pick<QueuedRun<I>, "runId" | "profile" | "kind" | "input">,
): QueuedRun<I>[] {
  return [...runs, { ...run, status: "fetching", events: [] }];
}

/** The run whose posting is fetched next: the one that has been in the fetch queue longest, or null. */
export function nextFetch<I>(runs: readonly QueuedRun<I>[]): QueuedRun<I> | null {
  return runs.find((run) => run.status === "fetching") ?? null;
}

/** Notes that a run's fetch has begun; the run stays in the fetch queue until it ends. */
export function startFetch<I>(runs: readonly QueuedRun<I>[], runId: string): QueuedRun<I>[] {
  return recordEvent(runs, runId, { type: "step", step: "fetch", status: "running" });
}

/**
 * The fetch worked: the run joins the end of the run queue with `input`, which now holds
 * the fetched posting, and from here on it is a run like one from pasted text (F10).
 */
export function fetchDone<I>(runs: readonly QueuedRun<I>[], runId: string, input: I): QueuedRun<I>[] {
  const waiting = moveToEnd(runs, runId, (run) => ({ ...run, input, status: "queued" }));
  return recordEvent(waiting, runId, { type: "step", step: "fetch", status: "done" });
}

/**
 * The fetch didn't work: the run never joins the run queue. It stays listed as failed with
 * the reason, so the user can paste the posting's text instead (F10).
 */
export function failFetch<I>(
  runs: readonly QueuedRun<I>[],
  runId: string,
  reason: string,
  maxFinished = MAX_FINISHED_RUNS,
): QueuedRun<I>[] {
  const failed = endRun(runs, runId, (run) => ({ ...run, status: "failed", error: reason }));
  return forgetOldest(recordEvent(failed, runId, { type: "error", message: reason }), maxFinished);
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
    const named = event.type === "saved" && event.company !== undefined && event.role !== undefined;
    return {
      ...run,
      events,
      ...(applicationId === undefined ? {} : { applicationId }),
      ...(named ? { company: event.company, role: event.role } : {}),
    };
  });
}

/** Marks a waiting run as running since `startedAt`, which its stream tells too (F39). */
export function startRun<I>(runs: readonly QueuedRun<I>[], runId: string, startedAt: number): QueuedRun<I>[] {
  const started = update(runs, runId, (run) => ({ ...run, status: "running", startedAt }));
  return recordEvent(started, runId, { type: "started", at: startedAt });
}

/** Forgets the oldest finished runs beyond `maxFinished`. */
function forgetOldest<I>(runs: QueuedRun<I>[], maxFinished: number): QueuedRun<I>[] {
  // Finished runs sit in the list in the order they ended (see `endRun`).
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
      ? endRun(runs, runId, (run) => ({ ...run, status: "done" }))
      : recordEvent(
          endRun(runs, runId, (run) => ({ ...run, status: "failed", error })),
          runId,
          { type: "error", message: error },
        );
  return forgetOldest(ended, maxFinished);
}

/** Ends the running run as cancelled by the user, which is not a failure (F32). */
export function cancelRun<I>(runs: readonly QueuedRun<I>[], runId: string, maxFinished = MAX_FINISHED_RUNS): QueuedRun<I>[] {
  const cancelled = endRun(runs, runId, (run) => ({ ...run, status: "cancelled" }));
  return forgetOldest(recordEvent(cancelled, runId, { type: "cancelled" }), maxFinished);
}

/** A profile's own run, or null: another profile's run is as good as unknown (Art. III.7). */
export function findRun<I>(runs: readonly QueuedRun<I>[], profile: string, runId: string): QueuedRun<I> | null {
  return runs.find((run) => run.runId === runId && run.profile === profile) ?? null;
}

/** Takes a run of this profile off the run queue or the fetch queue. Any other run stays where it is. */
export function removeWaiting<I>(
  runs: readonly QueuedRun<I>[],
  profile: string,
  runId: string,
): { runs: QueuedRun<I>[]; removed: boolean } {
  const run = findRun(runs, profile, runId);
  if (run?.status !== "queued" && run?.status !== "fetching") return { runs: [...runs], removed: false };
  return { runs: runs.filter((other) => other !== run), removed: true };
}

/**
 * A profile's runs as the Runs list shows them: the active one, the waiting ones in order,
 * the ones whose posting is being fetched, then the latest finished first.
 */
export function runsOf<I>(runs: readonly QueuedRun<I>[], profile: string): QueuedRun<I>[] {
  const own = runs.filter((run) => run.profile === profile);
  return [
    ...own.filter((run) => run.status === "running"),
    ...own.filter((run) => run.status === "queued"),
    ...own.filter((run) => run.status === "fetching"),
    ...own.filter(isFinished).reverse(),
  ];
}

/**
 * Whether the Runs list offers "Try again" on a run itself: a new application that failed or
 * was cancelled before its folder existed. One with a folder is tried again from its page (F19).
 */
export function canTryAgain(run: Pick<QueuedRun, "kind" | "status" | "applicationId">): boolean {
  return run.kind === "new" && (run.status === "failed" || run.status === "cancelled") && run.applicationId === undefined;
}

/**
 * Whether the Runs list offers "Try again" on a run now: once it was used, not again while the
 * run it queued is still listed. That run has its own "Try again" if it fails too (F19).
 */
export function offersTryAgain(runs: readonly QueuedRun[], run: QueuedRun): boolean {
  return canTryAgain(run) && !runs.some((other) => other.runId === run.triedAgainAs);
}

/** Notes that "Try again" on a run queued another one in its place. */
export function triedAgain<I>(runs: readonly QueuedRun<I>[], runId: string, as: string): QueuedRun<I>[] {
  return update(runs, runId, (run) => ({ ...run, triedAgainAs: as }));
}

/**
 * Whether a run's fetch failed, so it never joined the run queue and the Runs list asks for
 * the posting's text with "Paste the text instead" (F10).
 */
export function fetchFailed(run: Pick<QueuedRun, "status" | "events">): boolean {
  return run.status === "failed" && runSteps(run.events).steps.some((s) => s.step === "fetch" && s.status === "running");
}

/**
 * Takes a run whose fetch failed off the list, once the user has pasted its posting's text
 * and that text is in the run queue (F10). Any other run stays.
 */
export function dropFetchFailed<I>(runs: readonly QueuedRun<I>[], profile: string, runId: string): QueuedRun<I>[] {
  const run = findRun(runs, profile, runId);
  return run && fetchFailed(run) ? runs.filter((other) => other !== run) : [...runs];
}

/**
 * The steps a run went through, in the order they started, and the context-size warning of
 * each (F40), read from its events. A step the run didn't finish stays `running`.
 */
export function runSteps(events: readonly QueueEvent[]): {
  steps: RunStepState[];
  warnings: Partial<Record<RunStep, string>>;
} {
  const steps: RunStepState[] = [];
  const warnings: Partial<Record<RunStep, string>> = {};
  for (const event of events) {
    if (event.type === "warning") warnings[event.step] = event.message;
    if (event.type !== "step") continue;
    const known = steps.find((state) => state.step === event.step);
    if (known) known.status = event.status;
    else steps.push({ step: event.step, status: event.status });
  }
  return { steps, warnings };
}

/**
 * The run that last asked for an application's resume (a new application or "Try again",
 * not "Verify again"), or null. `runs` is one profile's list in the order of `runsOf`.
 * Its resume language is what "Try again" starts from.
 */
export function latestGeneration<Run extends Pick<QueuedRun, "kind" | "status" | "applicationId">>(
  runs: readonly Run[],
  applicationId: string,
): Run | null {
  const own = runs.filter((run) => run.applicationId === applicationId && run.kind !== "verify");
  // Waiting runs are listed in the order they were queued, after the running one; the
  // finished ones follow, latest first.
  return own.findLast((run) => run.status === "queued") ?? own[0] ?? null;
}
