"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { RunEvent, RunStep } from "@/core/pipeline/run";
import type { SkippedLine } from "@/core/posting/known-links";
import type { FileError } from "@/core/markdown/validate";
import type { QueueEvent, RunKind, RunStepState } from "@/core/runs/queue";
import { elapsedSeconds } from "@/core/runs/reconnect";
import { Icon } from "@/components/icon";
import { askToNotify, tellRunEnded, watchRun } from "@/components/run-notifications";
import { Button } from "@/components/ui/button";
import { formatElapsed } from "@/lib/utils";

const STEP_LABELS: Record<RunStep, string> = {
  fetch: "Fetching the posting",
  analyse: "Analysing the posting and matching it to your profile",
  save: "Saving the application",
  tailor: "Writing the tailored resume",
  check: "Checking names, dates and numbers against your profile",
  review: "Reviewing every claim against its sources",
};

type Progress = Extract<RunEvent, { type: "progress" }>;

export interface Run {
  /** True from the moment the run is sent until it ends, waiting in the queue included. */
  running: boolean;
  /** The run is in the queue behind another one (F42). */
  waiting: boolean;
  steps: RunStepState[];
  /** Seconds since the run started on the server, also when the page opened later (F39). */
  elapsed: number;
  /** What the model is doing in the running step, once it has sent tokens. */
  progress: Progress | null;
  /** Steps whose prompt may not fit the context window, with the message to show (F40). */
  warnings: Partial<Record<RunStep, string>>;
  error: string | null;
  /** The user cancelled the run, running or waiting; that is not an error (F32, F48). */
  cancelled: boolean;
  /** The application folder, once it exists; a failed run can be tried again from it (F19). */
  savedId: string | null;
  /**
   * Queues a run through a run endpoint and follows it. Resolves with true once the run has
   * ended, however it ended (finished, failed or cancelled), so the page can show what it left;
   * with false when it couldn't be queued (F48). `kind` is what the endpoint queues.
   */
  start(url: string, body: Record<string, string>, kind: RunKind): Promise<boolean>;
  /**
   * Follows a queued run through its event stream, which replays what already happened.
   * `kind` chooses the words that tell its end (F38).
   */
  follow(runId: string, options: FollowOptions): Promise<string | null>;
  /**
   * Asks the server to cancel the run being followed, waiting or running; the run's stream says
   * when it has stopped (F32, F48).
   */
  cancel(): void;
  /** True once the X was pressed, until the run ends. */
  cancelling: boolean;
  /** The run being followed, or the last one that was. */
  runId: string | null;
}

interface FollowOptions {
  kind: RunKind;
  signal?: AbortSignal;
}

/** Tells the Runs list that a run was queued or cancelled, so it doesn't wait for its next refresh. */
export const RUNS_CHANGED = "runs-changed";

/** Queues a run through a run endpoint (F42). Starting a run is when the notification permission is asked (F38). */
export async function enqueueRun(url: string, body: Record<string, string>): Promise<{ runId: string } | { error: string }> {
  const reply = await enqueueRuns(url, body);
  return "error" in reply ? reply : { runId: reply.runIds[0] };
}

/**
 * Queues the runs an endpoint answers with: one, or one per link of a list (F33). A list also
 * answers the lines it skipped and the saved files it couldn't check, and may queue nothing
 * when every link was skipped (F47).
 */
export async function enqueueRuns(
  url: string,
  body: Record<string, string | string[]>,
): Promise<{ runIds: string[]; skipped: SkippedLine[]; problems: FileError[] } | { error: string }> {
  askToNotify();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const reply = (await response.json().catch(() => null)) as {
      runId?: string;
      runIds?: string[];
      skipped?: SkippedLine[];
      problems?: FileError[];
      error?: string;
    } | null;
    const runIds = reply?.runIds ?? (reply?.runId ? [reply.runId] : []);
    const skipped = reply?.skipped ?? [];
    if (!response.ok || (runIds.length === 0 && skipped.length === 0)) {
      return { error: reply?.error ?? `The server answered ${response.status}.` };
    }
    runIds.forEach(watchRun);
    window.dispatchEvent(new Event(RUNS_CHANGED));
    return { runIds, skipped, problems: reply?.problems ?? [] };
  } catch {
    return { error: "Can't reach the app." };
  }
}

/** Follows a queued run step by step (F30, F42). */
export function useRun(): Run {
  const [running, setRunning] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [steps, setSteps] = useState<RunStepState[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [warnings, setWarnings] = useState<Partial<Record<RunStep, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [followedId, setFollowedId] = useState<string | null>(null);
  /** When the followed run started on the server, once its stream has told (F39). */
  const [startedAt, setStartedAt] = useState<number | null>(null);
  /** Counts the calls of `follow`, so one that was replaced leaves the newer one's state alone. */
  const follows = useRef(0);

  useEffect(() => {
    if (!running || startedAt === null) return;
    const timer = setInterval(() => setElapsed(elapsedSeconds(startedAt, Date.now())), 1000);
    return () => clearInterval(timer);
  }, [running, startedAt]);

  const follow = useCallback(async (runId: string, options: FollowOptions) => {
    const mine = ++follows.current;
    setStartedAt(null);
    setRunning(true);
    // Not waiting until the stream says so: a run that starts at once never shows the waiting line.
    setWaiting(false);
    setElapsed(0);
    setSteps([]);
    setProgress(null);
    setWarnings({});
    setError(null);
    setCancelled(false);
    setCancelling(false);
    setFollowedId(runId);
    let finished: string | null = null;
    let failed = false;
    let job: { company?: string; title?: string } = {};
    try {
      const response = await fetch(`/api/runs/${runId}/events`, { signal: options.signal });
      if (!response.ok || !response.body) {
        const reply = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(reply?.error ?? `The server answered ${response.status}.`);
        return null;
      }
      for await (const event of readEvents(response.body)) {
        if (event.type === "waiting") {
          setWaiting(true);
        } else if (event.type === "started") {
          setWaiting(false);
          setStartedAt(event.at);
          setElapsed(elapsedSeconds(event.at, Date.now()));
        } else if (event.type === "removed") {
          // Only a link of the fetch queue is removed, and no page follows one (F48).
        } else if (event.type === "cancelled") {
          setCancelled(true);
        } else if (event.type === "step") {
          setSteps((current) => [...current.filter((s) => s.step !== event.step), { step: event.step, status: event.status }]);
        } else if (event.type === "progress") {
          setProgress(event);
        } else if (event.type === "warning") {
          setWarnings((current) => ({ ...current, [event.step]: event.message }));
        } else if (event.type === "saved") {
          setSavedId(event.id);
          job = { company: event.job?.company, title: event.job?.title };
        } else if (event.type === "error") {
          setError(event.message);
          failed = true;
        } else {
          finished = event.id;
        }
      }
      // A cancelled run, or a lost connection, is not told about (F38).
      if (finished !== null || failed) tellRunEnded(runId, { kind: options.kind, status: failed ? "failed" : "done", ...job });
    } catch {
      // Not an error when the page itself stopped following.
      if (!options.signal?.aborted) setError("Lost the connection to the app while the run was in progress.");
    } finally {
      if (follows.current === mine) {
        setRunning(false);
        setWaiting(false);
        setCancelling(false);
      }
    }
    return finished;
  }, []);

  async function start(url: string, body: Record<string, string>, kind: RunKind): Promise<boolean> {
    setRunning(true);
    setSteps([]);
    setError(null);
    setCancelled(false);
    const queued = await enqueueRun(url, body);
    if ("error" in queued) {
      setError(queued.error);
      setRunning(false);
      return false;
    }
    await follow(queued.runId, { kind });
    return true;
  }

  function cancel() {
    if (followedId === null) return;
    setCancelling(true);
    void fetch(`/api/runs/${followedId}`, { method: "DELETE" })
      .then((response) => {
        if (!response.ok) setCancelling(false);
        window.dispatchEvent(new Event(RUNS_CHANGED));
      })
      .catch(() => setCancelling(false));
  }

  return {
    running,
    waiting,
    steps,
    elapsed,
    progress,
    warnings,
    error,
    cancelled,
    savedId,
    start,
    follow,
    cancel,
    cancelling,
    runId: followedId,
  };
}

/**
 * A run's steps, each with its context-size warning (F40). `live` adds what belongs next to
 * the step that is running; without it the steps are shown as the run left them. `ended` says
 * the run is over, so a step it never finished shows as stopped.
 */
export function RunSteps({
  steps,
  warnings,
  live,
  ended = false,
}: {
  steps: RunStepState[];
  warnings: Partial<Record<RunStep, string>>;
  live?: (step: RunStep) => ReactNode;
  ended?: boolean;
}) {
  return (
    <ol className="space-y-1">
      {steps.map(({ step, status }) => (
        <li key={step}>
          {status === "done" ? "✓" : ended ? "✗" : "…"} {STEP_LABELS[step]}
          {status === "running" && live?.(step)}
          {warnings[step] && <p className="text-amber-900 dark:text-amber-100">{warnings[step]}</p>}
        </li>
      ))}
    </ol>
  );
}

/** The X that cancels a waiting or running run (F48). */
function CancelButton({ run, size, className }: { run: Run; size: "icon-xs" | "icon-sm"; className?: string }) {
  return (
    <Button
      variant="outline"
      size={size}
      className={className}
      aria-label="Cancel"
      disabled={run.cancelling}
      onClick={run.cancel}
    >
      <Icon name="x" />
    </Button>
  );
}

/**
 * The followed run's waiting line or steps. The running step has the X that cancels the run;
 * `cancellable` adds it to the waiting line too, where no Runs list sits next to it (F42, F48).
 */
export function RunProgress({ run, cancellable = false }: { run: Run; cancellable?: boolean }) {
  if (run.waiting) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>Waiting for another run to finish…</span>
        {cancellable && <CancelButton run={run} size="icon-sm" />}
      </div>
    );
  }
  if (run.steps.length === 0 && !run.cancelled) return null;
  return (
    <div className="space-y-1 text-sm">
      <RunSteps
        steps={run.steps}
        warnings={run.warnings}
        ended={!run.running}
        live={
          run.running
            ? (step) => (
                <>
                  <span className="text-muted-foreground">
                    {" "}
                    ({formatElapsed(run.elapsed)}
                    {run.progress?.step === step &&
                      ` · ${run.progress.phase}, ${run.progress.tokens.toLocaleString("en")} tokens`}
                    )
                  </span>
                  <CancelButton run={run} size="icon-xs" className="ml-2 align-middle" />
                </>
              )
            : undefined
        }
      />
      {run.cancelled && <p className="text-muted-foreground">This run was cancelled. The finished steps stay saved.</p>}
    </div>
  );
}

/** Reads newline-delimited JSON events from the response body. */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<QueueEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as QueueEvent;
  }
}
