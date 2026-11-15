"use client";

import { useCallback, useEffect, useState } from "react";
import type { RunEvent, RunStep } from "@/core/pipeline/run";
import type { QueueEvent } from "@/core/runs/queue";
import { formatElapsed } from "@/lib/utils";

const STEP_LABELS: Record<RunStep, string> = {
  analyse: "Analysing the posting and matching it to your profile",
  save: "Saving the application",
  tailor: "Writing the tailored resume",
  check: "Checking names, dates and numbers against your profile",
  review: "Reviewing every claim against its sources",
};

type StepState = { step: RunStep; status: "running" | "done" };
type Progress = Extract<RunEvent, { type: "progress" }>;

export interface Run {
  /** True from the moment the run is sent until it ends, waiting in the queue included. */
  running: boolean;
  /** The run is in the queue behind another one (F42). */
  waiting: boolean;
  steps: StepState[];
  /** Seconds since the run started. */
  elapsed: number;
  /** What the model is doing in the running step, once it has sent tokens. */
  progress: Progress | null;
  error: string | null;
  /** The application folder, once it exists; a failed run can be tried again from it (F19). */
  savedId: string | null;
  /** Queues a run through a run endpoint and follows it; resolves with the application's ID when the run finishes. */
  start(url: string, body: Record<string, string>): Promise<string | null>;
  /**
   * Follows a queued run through its event stream, which replays what already happened.
   * `language` is the run's resume language, remembered once the application exists.
   */
  follow(runId: string, options?: { language?: string; signal?: AbortSignal }): Promise<string | null>;
}

/** Tells the Runs list that a run was queued or removed, so it doesn't wait for its next refresh. */
export const RUNS_CHANGED = "runs-changed";

/** Queues a run through a run endpoint (F42). */
export async function enqueueRun(url: string, body: Record<string, string>): Promise<{ runId: string } | { error: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const reply = (await response.json().catch(() => null)) as { runId?: string; error?: string } | null;
    if (!response.ok || !reply?.runId) return { error: reply?.error ?? `The server answered ${response.status}.` };
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
  const [steps, setSteps] = useState<StepState[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    if (!running || waiting) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running, waiting]);

  const follow = useCallback(async (runId: string, options: { language?: string; signal?: AbortSignal } = {}) => {
    setRunning(true);
    setWaiting(true);
    setElapsed(0);
    setSteps([]);
    setProgress(null);
    setError(null);
    let finished: string | null = null;
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
        } else if (event.type === "step") {
          setSteps((current) => [...current.filter((s) => s.step !== event.step), { step: event.step, status: event.status }]);
        } else if (event.type === "progress") {
          setProgress(event);
        } else if (event.type === "saved") {
          setSavedId(event.id);
          if (options.language !== undefined) rememberLanguage(event.id, options.language);
        } else if (event.type === "error") {
          setError(event.message);
        } else {
          finished = event.id;
        }
      }
    } catch {
      // Not an error when the page itself stopped following.
      if (!options.signal?.aborted) setError("Lost the connection to the app while the run was in progress.");
    } finally {
      setRunning(false);
      setWaiting(false);
    }
    return finished;
  }, []);

  async function start(url: string, body: Record<string, string>): Promise<string | null> {
    setRunning(true);
    setSteps([]);
    setError(null);
    const queued = await enqueueRun(url, body);
    if ("error" in queued) {
      setError(queued.error);
      setRunning(false);
      return null;
    }
    return follow(queued.runId, { language: body.language });
  }

  return { running, waiting, steps, elapsed, progress, error, savedId, start, follow };
}

export function RunProgress({ run }: { run: Run }) {
  if (run.waiting) return <p className="text-sm text-muted-foreground">Waiting for another run to finish…</p>;
  if (run.steps.length === 0) return null;
  return (
    <ol className="space-y-1 text-sm">
      {run.steps.map(({ step, status }) => (
        <li key={step}>
          {status === "done" ? "✓" : "…"} {STEP_LABELS[step]}
          {status === "running" && run.running && (
            <span className="text-muted-foreground">
              {" "}
              ({formatElapsed(run.elapsed)}
              {run.progress?.step === step &&
                ` · ${run.progress.phase}, ${run.progress.tokens.toLocaleString("en")} tokens`}
              )
            </span>
          )}
        </li>
      ))}
    </ol>
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
