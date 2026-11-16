"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { RunEvent, RunStep } from "@/core/pipeline/run";
import type { QueueEvent, RunKind, RunStepState } from "@/core/runs/queue";
import { askToNotify, tellRunEnded, watchRun } from "@/components/run-notifications";
import { Button } from "@/components/ui/button";
import { formatElapsed } from "@/lib/utils";

const STEP_LABELS: Record<RunStep, string> = {
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
  /** Seconds since the run started. */
  elapsed: number;
  /** What the model is doing in the running step, once it has sent tokens. */
  progress: Progress | null;
  /** Steps whose prompt may not fit the context window, with the message to show (F40). */
  warnings: Partial<Record<RunStep, string>>;
  error: string | null;
  /** The user cancelled the run; that is not an error (F32). */
  cancelled: boolean;
  /** The application folder, once it exists; a failed run can be tried again from it (F19). */
  savedId: string | null;
  /**
   * Queues a run through a run endpoint and follows it; resolves with the application's ID
   * when the run finishes. `kind` is what the endpoint queues.
   */
  start(url: string, body: Record<string, string>, kind: RunKind): Promise<string | null>;
  /**
   * Follows a queued run through its event stream, which replays what already happened.
   * `kind` chooses the words that tell its end (F38); `language` is the run's resume
   * language, remembered once the application exists.
   */
  follow(runId: string, options: FollowOptions): Promise<string | null>;
  /**
   * Asks the server to stop the run being followed: a waiting run leaves the queue (F42), the
   * running one is cancelled, and the run's stream says when it has stopped (F32).
   */
  cancel(): void;
  /** True once Cancel or Remove was asked for, until the run ends. */
  cancelling: boolean;
}

interface FollowOptions {
  kind: RunKind;
  language?: string;
  signal?: AbortSignal;
}

/** Tells the Runs list that a run was queued or removed, so it doesn't wait for its next refresh. */
export const RUNS_CHANGED = "runs-changed";

/** Queues a run through a run endpoint (F42). Starting a run is when the notification permission is asked (F38). */
export async function enqueueRun(url: string, body: Record<string, string>): Promise<{ runId: string } | { error: string }> {
  askToNotify();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const reply = (await response.json().catch(() => null)) as { runId?: string; error?: string } | null;
    if (!response.ok || !reply?.runId) return { error: reply?.error ?? `The server answered ${response.status}.` };
    watchRun(reply.runId);
    window.dispatchEvent(new Event(RUNS_CHANGED));
    return { runId: reply.runId };
  } catch {
    return { error: "Can't reach the app." };
  }
}

// The chosen resume language is remembered in this browser only, per application, so
// "Try again" can reuse it.
const languageKey = (id: string) => `resume-language:${id}`;

export function rememberedLanguage(id: string): string {
  return window.localStorage.getItem(languageKey(id)) ?? "";
}

function rememberLanguage(id: string, language: string) {
  if (language) window.localStorage.setItem(languageKey(id), language);
  else window.localStorage.removeItem(languageKey(id));
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

  useEffect(() => {
    if (!running || waiting) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running, waiting]);

  const follow = useCallback(async (runId: string, options: FollowOptions) => {
    setRunning(true);
    setWaiting(true);
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
    let job: { company?: string; role?: string } = {};
    try {
      const response = await fetch(`/api/runs/${runId}/events`, { signal: options.signal });
      if (!response.ok || !response.body) {
        const reply = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(reply?.error ?? `The server answered ${response.status}.`);
        return null;
      }
      for await (const event of readEvents(response.body)) {
        if (event.type === "started") {
          setWaiting(false);
        } else if (event.type === "removed") {
          setError("This run was removed from the queue.");
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
          job = { company: event.company, role: event.role };
          if (options.language !== undefined) rememberLanguage(event.id, options.language);
        } else if (event.type === "error") {
          setError(event.message);
          failed = true;
        } else {
          finished = event.id;
        }
      }
      // A cancelled or removed run, or a lost connection, is not told about (F38).
      if (finished !== null || failed) tellRunEnded(runId, { kind: options.kind, status: failed ? "failed" : "done", ...job });
    } catch {
      // Not an error when the page itself stopped following.
      if (!options.signal?.aborted) setError("Lost the connection to the app while the run was in progress.");
    } finally {
      setRunning(false);
      setWaiting(false);
      setCancelling(false);
    }
    return finished;
  }, []);

  async function start(url: string, body: Record<string, string>, kind: RunKind): Promise<string | null> {
    setRunning(true);
    setSteps([]);
    setError(null);
    setCancelled(false);
    const queued = await enqueueRun(url, body);
    if ("error" in queued) {
      setError(queued.error);
      setRunning(false);
      return null;
    }
    return follow(queued.runId, { kind, language: body.language });
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

  return { running, waiting, steps, elapsed, progress, warnings, error, cancelled, savedId, start, follow, cancel, cancelling };
}

/**
 * A run's steps, each with its context-size warning (F40). `live` adds what belongs next to
 * the step that is running; without it the steps are shown as the run left them.
 */
export function RunSteps({
  steps,
  warnings,
  live,
}: {
  steps: RunStepState[];
  warnings: Partial<Record<RunStep, string>>;
  live?: (step: RunStep) => ReactNode;
}) {
  return (
    <ol className="space-y-1">
      {steps.map(({ step, status }) => (
        <li key={step}>
          {status === "done" ? "✓" : "…"} {STEP_LABELS[step]}
          {status === "running" && live?.(step)}
          {warnings[step] && <p className="text-amber-900 dark:text-amber-100">{warnings[step]}</p>}
        </li>
      ))}
    </ol>
  );
}

/** `removable` offers "Remove" while the run waits, where no Runs list sits next to it (F42). */
export function RunProgress({ run, removable = false }: { run: Run; removable?: boolean }) {
  if (run.waiting) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>Waiting for another run to finish…</span>
        {removable && (
          <Button variant="outline" size="sm" disabled={run.cancelling} onClick={run.cancel}>
            Remove
          </Button>
        )}
      </div>
    );
  }
  if (run.steps.length === 0 && !run.cancelled) return null;
  return (
    <div className="space-y-1 text-sm">
      <RunSteps
        steps={run.steps}
        warnings={run.warnings}
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
                  <Button variant="outline" size="xs" className="ml-2" disabled={run.cancelling} onClick={run.cancel}>
                    {run.cancelling ? "Cancelling…" : "Cancel"}
                  </Button>
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
