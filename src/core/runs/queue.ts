import type { JobSummary } from "../application/job";
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
  /**
   * The application folder, once it exists: made when a link's fetch starts, or when an Indeed
   * link or pasted text is added; given for a run that continues a saved application (F50).
   */
  applicationId?: string;
  /**
   * What the run knows about its job: its title, company, company website and platform, from
   * job.md once its application is saved (F38, F46).
   */
  job?: JobSummary;
  /** Every event sent so far, so a stream opened late can replay them. */
  events: QueueEvent[];
  /** Why the run failed. */
  error?: string;
  /** The run that "Try again" queued in this one's place (F19). */
  triedAgainAs?: string;
  /**
   * The run's link is one the server never requests (Indeed): the run never entered the fetch
   * queue and asks for its posting's text from the start. It has no "Try again", which would
   * fetch the link (F47).
   */
  notFetched?: boolean;
  /**
   * When the run's row was archived, as an ISO timestamp like `job.md`'s `archived_at`. An
   * archived run leaves the Runs list; one with an application has the time in its `job.md` too (F48).
   */
  archivedAt?: string;
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

/**
 * Adds a run started from a link at the end of the fetch queue (F10). A link fetched again into
 * its application has the application's ID; a new link gets its folder when its fetch starts (F50).
 */
export function enqueueFetch<I>(
  runs: readonly QueuedRun<I>[],
  run: Pick<QueuedRun<I>, "runId" | "profile" | "kind" | "input" | "applicationId">,
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
 * Notes the application folder made for a run before its pipeline starts: when its link's fetch
 * started, or when its posting's text was pasted (F50).
 */
export function madeApplication<I>(runs: readonly QueuedRun<I>[], runId: string, applicationId: string): QueuedRun<I>[] {
  return update(runs, runId, (run) => ({ ...run, applicationId }));
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

/**
 * Adds a run whose link the server never requests (Indeed). It never enters the fetch queue:
 * it starts where a failed fetch ends, listed as needing the posting's text with `reason`,
 * without any request (F47).
 */
export function addNotFetched<I>(
  runs: readonly QueuedRun<I>[],
  run: Pick<QueuedRun<I>, "runId" | "profile" | "kind" | "input" | "applicationId">,
  reason: string,
  maxFinished = MAX_FINISHED_RUNS,
): QueuedRun<I>[] {
  const added: QueuedRun<I> = { ...run, status: "failed", error: reason, notFetched: true, events: [{ type: "error", message: reason }] };
  // It ended as it was added, so it is the latest of the finished runs.
  return forgetOldest([...runs, added], maxFinished);
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
    return {
      ...run,
      events,
      ...(applicationId === undefined ? {} : { applicationId }),
      ...(event.type === "saved" && event.job ? { job: { ...run.job, ...event.job } } : {}),
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

/**
 * Ends a run as cancelled by the user, which is not a failure: the running run once its work
 * has stopped (F32), or a waiting run at once, which then never starts. Either stays listed as
 * cancelled, so it can be started again (F48).
 */
export function cancelRun<I>(runs: readonly QueuedRun<I>[], runId: string, maxFinished = MAX_FINISHED_RUNS): QueuedRun<I>[] {
  const cancelled = endRun(runs, runId, (run) => ({ ...run, status: "cancelled" }));
  return forgetOldest(recordEvent(cancelled, runId, { type: "cancelled" }), maxFinished);
}

/**
 * What the X on a run's row does, or null when the row has none (F48): a link of the fetch queue
 * is removed, a waiting or running run is cancelled, and a run that ended has no X, a failed one
 * included, since it can't be cancelled. The one exception is an Indeed link's run that needs its
 * posting's text, while no browser extension can read the page: it is cancelled, unless it is
 * archived (F26).
 */
export function stopAction(run: Pick<QueuedRun, "status" | "notFetched" | "archivedAt">): "remove" | "cancel" | null {
  if (run.status === "fetching") return "remove";
  if (run.status === "queued" || run.status === "running") return "cancel";
  return run.status === "failed" && run.notFetched === true && run.archivedAt === undefined ? "cancel" : null;
}

/**
 * Cancels an Indeed link's run of this profile that needs its posting's text (F26). It stays
 * where it is in the list, as cancelled, and still takes the pasted text: "Paste the text" moves
 * it on like before. It never gets "Try again", which would request Indeed (F47). Any other run
 * stays as it is.
 */
export function cancelNotFetched<I>(
  runs: readonly QueuedRun<I>[],
  profile: string,
  runId: string,
): { runs: QueuedRun<I>[]; cancelled: boolean } {
  const run = findRun(runs, profile, runId);
  if (!run || run.status !== "failed" || stopAction(run) !== "cancel") return { runs: [...runs], cancelled: false };
  const cancelled = update(runs, runId, (failed) => ({ ...failed, status: "cancelled" }));
  return { runs: recordEvent(cancelled, runId, { type: "cancelled" }), cancelled: true };
}

/** A profile's own run, or null: another profile's run is as good as unknown (Art. III.7). */
export function findRun<I>(runs: readonly QueuedRun<I>[], profile: string, runId: string): QueuedRun<I> | null {
  return runs.find((run) => run.runId === runId && run.profile === profile) ?? null;
}

/**
 * Takes a link of this profile off the fetch queue and off the list: it is not fetched, and
 * nothing of it is kept (F48). Any other run stays where it is; a run waiting for the model is
 * cancelled instead (`cancelRun`).
 */
export function removeLink<I>(
  runs: readonly QueuedRun<I>[],
  profile: string,
  runId: string,
): { runs: QueuedRun<I>[]; removed: boolean } {
  const run = findRun(runs, profile, runId);
  if (run?.status !== "fetching") return { runs: [...runs], removed: false };
  return { runs: runs.filter((other) => other !== run), removed: true };
}

/**
 * A profile's runs as the Runs list shows them: the active one, the waiting ones in order,
 * the ones whose posting is being fetched, then the latest finished first. Archived runs have
 * left the list (F48).
 */
export function runsOf<I>(runs: readonly QueuedRun<I>[], profile: string): QueuedRun<I>[] {
  const own = runs.filter((run) => run.profile === profile && run.archivedAt === undefined);
  return [
    ...own.filter((run) => run.status === "running"),
    ...own.filter((run) => run.status === "queued"),
    ...own.filter((run) => run.status === "fetching"),
    ...own.filter(isFinished).reverse(),
  ];
}

/** Whether a run got as far as saving its application's analysis, which its `saved` event tells (F50). */
function analysisSaved(run: Pick<QueuedRun, "events">): boolean {
  return run.events.some((event) => event.type === "saved");
}

/**
 * Whether the Runs list offers "Try again" on a run itself: a new application that failed or was
 * cancelled before its analysis was saved, or a link whose fetch failed again ("Try again" of
 * a failed fetch's application). One whose analysis was saved is tried again from its page (F19).
 * The application's folder may exist already, since it is made when the link's fetch starts; it
 * is the one tried again (F50). A run whose link the server never requests has none: trying
 * again would fetch it (F47). An archived run has none until it is restored (F48).
 */
export function canTryAgain(run: Pick<QueuedRun, "kind" | "status" | "events" | "notFetched" | "archivedAt">): boolean {
  return (
    (run.kind === "new" || (run.kind === "retry" && fetchFailed(run))) &&
    (run.status === "failed" || run.status === "cancelled") &&
    !analysisSaved(run) &&
    run.notFetched !== true &&
    run.archivedAt === undefined
  );
}

/**
 * Whether the Runs list offers "Try again" on a run now: once it was used, not again while the
 * run it queued is still listed. That run has its own "Try again" if it fails too (F19). Nor
 * while another run of its application is fetching, waiting or running: its link added again,
 * or "Try again" on its page, started it already (F50).
 */
export function offersTryAgain(runs: readonly QueuedRun[], run: QueuedRun): boolean {
  return (
    canTryAgain(run) &&
    !runs.some((other) => other.runId === run.triedAgainAs) &&
    (run.applicationId === undefined || !targetBusy(runs, run.profile, { applicationId: run.applicationId }))
  );
}

/** Notes that "Try again" on a run queued another one in its place. */
export function triedAgain<I>(runs: readonly QueuedRun<I>[], runId: string, as: string): QueuedRun<I>[] {
  return update(runs, runId, (run) => ({ ...run, triedAgainAs: as }));
}

/**
 * Whether a run of the fetch queue is still waiting for its turn: only the link being fetched
 * has begun its `fetch` step. The Runs list reads "waiting to fetch" for it (F48).
 */
export function waitingToFetch(run: { status: RunStatus; steps: readonly RunStepState[] }): boolean {
  return run.status === "fetching" && !run.steps.some((state) => state.step === "fetch");
}

/**
 * Whether a run's fetch failed, or its link is one the server never requests, so it never
 * joined the run queue and the Runs list asks for the posting's text (F10, F47). Such a run is
 * failed, or cancelled once it was archived and restored (F48).
 */
export function fetchFailed(run: Pick<QueuedRun, "status" | "events" | "notFetched">): boolean {
  if (run.status !== "failed" && run.status !== "cancelled") return false;
  return run.notFetched === true || runSteps(run.events).steps.some((s) => s.step === "fetch" && s.status === "running");
}

/**
 * The user pasted the posting's text on a run of this profile that needs it: its fetch failed,
 * or its link is one the server never requests. The same run moves on: it leaves the "needs the
 * posting's text" state and joins the end of the run queue with `input`, which holds the text
 * and its link. No other run takes its place (F48). Any other run stays as it is.
 */
export function pasteText<I>(
  runs: readonly QueuedRun<I>[],
  profile: string,
  runId: string,
  input: I,
): { runs: QueuedRun<I>[]; pasted: boolean } {
  const run = findRun(runs, profile, runId);
  if (!run || !fetchFailed(run) || run.archivedAt !== undefined) return { runs: [...runs], pasted: false };
  const moved = moveToEnd(runs, runId, (failed) => {
    const next: QueuedRun<I> = { ...failed, input, status: "queued", events: [] };
    // Its failed fetch is behind it: no error, no step, and nothing that keeps it from "Try again".
    delete next.error;
    delete next.notFetched;
    delete next.startedAt;
    return next;
  });
  return { runs: moved, pasted: true };
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
 * What one row of the archived list stands for: an application, with every run of it, or a run
 * alone while it has no application yet (F48).
 */
export type ArchiveTarget = { applicationId: string } | { runId: string };

/** The row a run's archive button archives: its application once it has one, otherwise the run (F48). */
export function archiveTarget(run: Pick<QueuedRun, "runId" | "applicationId">): ArchiveTarget {
  return run.applicationId === undefined ? { runId: run.runId } : { applicationId: run.applicationId };
}

function inTarget(run: QueuedRun<unknown>, profile: string, target: ArchiveTarget): boolean {
  if (run.profile !== profile) return false;
  return "applicationId" in target ? run.applicationId === target.applicationId : run.runId === target.runId;
}

/** Whether a run of this profile for the row is still fetching, waiting or running, so it can't be archived (F48). */
export function targetBusy(runs: readonly QueuedRun<unknown>[], profile: string, target: ArchiveTarget): boolean {
  return runs.some((run) => inTarget(run, profile, target) && !isFinished(run));
}

/**
 * Whether a run's row has the archive button (F48): the run was cancelled, failed (its fetch or
 * its generation) or finished, it isn't archived yet, and no run of its application is still
 * waiting or running.
 */
export function canArchive(runs: readonly QueuedRun<unknown>[], run: QueuedRun<unknown>): boolean {
  return isFinished(run) && run.archivedAt === undefined && !targetBusy(runs, run.profile, archiveTarget(run));
}

/**
 * Archives a row of this profile at `at`: its runs that ended leave the Runs list, and keep the
 * time in memory (F48). Nothing is deleted.
 */
export function archiveRuns<I>(runs: readonly QueuedRun<I>[], profile: string, target: ArchiveTarget, at: string): QueuedRun<I>[] {
  return runs.map((run) => (inTarget(run, profile, target) && isFinished(run) ? { ...run, archivedAt: at } : run));
}

/**
 * Restores a row of this profile: its runs come back to the Runs list. An unfinished one, failed
 * or cancelled, comes back as cancelled, so it has "Try again"; a finished one as it was (F48).
 */
export function restoreRuns<I>(runs: readonly QueuedRun<I>[], profile: string, target: ArchiveTarget): QueuedRun<I>[] {
  return runs.map((run) => {
    if (!inTarget(run, profile, target) || run.archivedAt === undefined) return run;
    const restored: QueuedRun<I> = { ...run, status: run.status === "failed" ? "cancelled" : run.status };
    delete restored.archivedAt;
    return restored;
  });
}

/**
 * Takes an archived run of this profile off the list for good, once the user confirmed deleting
 * its row (F26): only a run that never finished and has no application, so nothing of it is on
 * disk. Any other run stays; an application is deleted with its folder (`forgetApplication`).
 */
export function discardRun<I>(runs: readonly QueuedRun<I>[], profile: string, runId: string): { runs: QueuedRun<I>[]; discarded: boolean } {
  const run = findRun(runs, profile, runId);
  if (!run || run.archivedAt === undefined || run.applicationId !== undefined || !isFinished(run) || run.status === "done") {
    return { runs: [...runs], discarded: false };
  }
  return { runs: runs.filter((other) => other !== run), discarded: true };
}

/**
 * An application of this profile was renamed (the one-time update of old applications, F50):
 * its runs, and the events that name it, name it by its new folder `to`.
 */
export function moveApplication<I>(runs: readonly QueuedRun<I>[], profile: string, from: string, to: string): QueuedRun<I>[] {
  return runs.map((run) => {
    if (run.profile !== profile || run.applicationId !== from) return run;
    const events = run.events.map((event) => ((event.type === "saved" || event.type === "done") && event.id === from ? { ...event, id: to } : event));
    return { ...run, applicationId: to, events };
  });
}

/** An application of this profile was deleted (F50): its runs leave the list, since they have nothing left to show. */
export function forgetApplication<I>(runs: readonly QueuedRun<I>[], profile: string, applicationId: string): QueuedRun<I>[] {
  return runs.filter((run) => run.profile !== profile || run.applicationId !== applicationId);
}
