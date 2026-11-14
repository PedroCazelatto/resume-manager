"use client";

import { useEffect, useState } from "react";
import type { RunEvent, RunStep } from "@/core/pipeline/run";
import { formatElapsed } from "@/lib/utils";

const STEP_LABELS: Record<RunStep, string> = {
  analyse: "Analysing the posting and matching it to your profile",
  save: "Saving the application",
  tailor: "Writing the tailored resume",
  check: "Checking names, dates and numbers against your profile",
  review: "Reviewing every claim against its sources",
};

type StepState = { step: RunStep; status: "running" | "done" };

export interface Run {
  running: boolean;
  steps: StepState[];
  /** Seconds since the run started. */
  elapsed: number;
  error: string | null;
  /** The application folder, once it exists; a failed run can be tried again from it (F19). */
  savedId: string | null;
  /** Posts to a run endpoint and follows its events; resolves with the ID when the run finishes. */
  start(url: string, body: Record<string, string>): Promise<string | null>;
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

/** Follows a pipeline run step by step (F30). */
export function useRun(): Run {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  async function start(url: string, body: Record<string, string>): Promise<string | null> {
    setRunning(true);
    setElapsed(0);
    setSteps([]);
    setError(null);
    let finished: string | null = null;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok || !response.body) {
        const reply = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(reply?.error ?? `The server answered ${response.status}.`);
        return null;
      }
      for await (const event of readEvents(response.body)) {
        if (event.type === "step") {
          setSteps((current) => [...current.filter((s) => s.step !== event.step), { step: event.step, status: event.status }]);
        } else if (event.type === "saved") {
          setSavedId(event.id);
          rememberLanguage(event.id, body.language ?? "");
        } else if (event.type === "error") {
          setError(event.message);
        } else {
          finished = event.id;
        }
      }
    } catch {
      setError("Lost the connection to the app while the run was in progress.");
    } finally {
      setRunning(false);
    }
    return finished;
  }

  return { running, steps, elapsed, error, savedId, start };
}

export function RunProgress({ run }: { run: Run }) {
  if (run.steps.length === 0) return null;
  return (
    <ol className="space-y-1 text-sm">
      {run.steps.map(({ step, status }) => (
        <li key={step}>
          {status === "done" ? "✓" : "…"} {STEP_LABELS[step]}
          {status === "running" && run.running && <span className="text-muted-foreground"> ({formatElapsed(run.elapsed)})</span>}
        </li>
      ))}
    </ol>
  );
}

/** Reads newline-delimited JSON events from the response body. */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<RunEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as RunEvent;
  }
}
