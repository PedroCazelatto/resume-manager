"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RunEvent, RunStep } from "@/app/run-events";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ISO_639_1, languageName } from "@/core/application/languages";

const STEP_LABELS: Record<RunStep, string> = {
  analyse: "Analysing the posting and matching it to your profile",
  save: "Saving the application",
  tailor: "Writing the tailored resume",
};

const POSTING_LANGUAGE = "posting";
const LANGUAGES = [
  { value: POSTING_LANGUAGE, label: "Same as the posting" },
  ...ISO_639_1.map((code) => ({ value: code, label: languageName(code) })).sort((a, b) => a.label.localeCompare(b.label)),
];

type StepState = { step: RunStep; status: "running" | "done" };

/** Paste a posting and follow the run step by step (F09, F30). */
export function NewApplicationForm() {
  const router = useRouter();
  const [posting, setPosting] = useState("");
  const [language, setLanguage] = useState(POSTING_LANGUAGE);
  const [savedId, setSavedId] = useState<string | null>(null);
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
    setSavedId(null);
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posting, language: language === POSTING_LANGUAGE ? "" : language }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `The server answered ${response.status}.`);
        return;
      }
      for await (const event of readEvents(response.body)) {
        if (event.type === "step") {
          setSteps((current) => [...current.filter((s) => s.step !== event.step), { step: event.step, status: event.status }]);
        } else if (event.type === "saved") {
          setSavedId(event.id);
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
      <div className="flex flex-wrap items-center gap-3">
        <Select items={LANGUAGES} value={language} disabled={running} onValueChange={(value) => value && setLanguage(value)}>
          <SelectTrigger aria-label="Resume language" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={running || posting.trim() === ""} onClick={generate}>
          {running ? "Working…" : "Generate resume"}
        </Button>
      </div>

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
      {error && (
        <p className="text-sm text-destructive">
          {error}
          {savedId && (
            <>
              {" "}
              <Link href={`/applications/${savedId}`} className="underline">
                See what was saved
              </Link>
            </>
          )}
        </p>
      )}
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
