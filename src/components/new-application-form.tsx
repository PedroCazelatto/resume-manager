"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RunEvent, RunStep } from "@/app/run-events";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const STEP_LABELS: Record<RunStep, string> = {
  analyse: "Analysing the posting and matching it to your profile",
  save: "Saving the application",
};

type StepState = { step: RunStep; status: "running" | "done" };

/** Paste a posting and follow the run step by step (F09, F30). */
export function NewApplicationForm() {
  const router = useRouter();
  const [posting, setPosting] = useState("");
  const [steps, setSteps] = useState<StepState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  async function generate() {
    setRunning(true);
    setElapsed(0);
    setSteps([]);
    setError(null);
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posting }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `The server answered ${response.status}.`);
        return;
      }
      for await (const event of readEvents(response.body)) {
        if (event.type === "step") {
          setSteps((current) => [...current.filter((s) => s.step !== event.step), { step: event.step, status: event.status }]);
        } else if (event.type === "error") {
          setError(event.message);
        } else {
          router.push(`/applications/${event.id}`);
        }
      }
    } catch {
      setError("Lost the connection to the app while the run was in progress.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium">New application</h2>
      <Textarea
        aria-label="Job posting"
        placeholder="Paste the full job posting here"
        className="min-h-60"
        value={posting}
        disabled={running}
        onChange={(e) => setPosting(e.target.value)}
      />
      <Button disabled={running || posting.trim() === ""} onClick={generate}>
        {running ? "Working…" : "Analyse posting"}
      </Button>

      {steps.length > 0 && (
        <ol className="space-y-1 text-sm">
          {steps.map(({ step, status }) => (
            <li key={step}>
              {status === "done" ? "✓" : "…"} {STEP_LABELS[step]}
              {status === "running" && running && <span className="text-muted-foreground"> ({elapsed} s)</span>}
            </li>
          ))}
        </ol>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
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
