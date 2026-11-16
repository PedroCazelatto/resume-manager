"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { RunSummary } from "@/app/runs";
import { pasteInstead } from "@/components/new-application-form";
import { tellEndedRuns } from "@/components/run-notifications";
import { Button } from "@/components/ui/button";
import { RUNS_CHANGED, RunProgress, RunSteps, enqueueRun, useRun } from "@/components/use-run";

const REFRESH_MS = 2000;

const KIND_LABELS: Record<RunSummary["kind"], string> = {
  new: "New application",
  retry: "Try again",
  verify: "Verify again",
};

const STATUS_LABELS: Record<RunSummary["status"], string> = {
  queued: "waiting",
  running: "running",
  done: "finished",
  failed: "failed",
  cancelled: "cancelled",
};

/**
 * The selected profile's runs since the app started: the active one with its steps, the
 * waiting ones in order, then the finished ones with the steps they went through (F42).
 */
export function RunsList() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  /** Why the last "Try again" of a run wasn't queued. */
  const [refused, setRefused] = useState<{ runId: string; error: string } | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/runs").catch(() => null);
    if (!response?.ok) return;
    const { runs } = (await response.json()) as { runs: RunSummary[] };
    setRuns(runs);
    // A run that ended since this tab saw it waiting or running is told about (F38).
    tellEndedRuns(runs);
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener(RUNS_CHANGED, refresh);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener(RUNS_CHANGED, refresh);
    };
  }, [refresh]);

  async function remove(runId: string) {
    await fetch(`/api/runs/${runId}`, { method: "DELETE" }).catch(() => null);
    await refresh();
  }

  /** Queues the run's posting or link and language again; the server kept them with the run (F19). */
  async function tryAgain(runId: string) {
    const reply = await enqueueRun(`/api/runs/${runId}`, {});
    setRefused("error" in reply ? { runId, error: reply.error } : null);
  }

  if (runs.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-medium">Runs</h2>
      <ul className="space-y-2 text-sm">
        {runs.map((run) => (
          <li key={run.runId} className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {KIND_LABELS[run.kind]}
                {run.applicationId && (
                  <>
                    {" · "}
                    <Link href={`/applications/${run.applicationId}`} className="underline">
                      {run.applicationId}
                    </Link>
                  </>
                )}
              </span>
              <span className="text-muted-foreground">{STATUS_LABELS[run.status]}</span>
              {run.status === "queued" && (
                <Button variant="outline" size="sm" onClick={() => remove(run.runId)}>
                  Remove
                </Button>
              )}
              {/* A run with an application is tried again from its page. */}
              {run.retryable && (
                <Button variant="outline" size="sm" onClick={() => tryAgain(run.runId)}>
                  Try again
                </Button>
              )}
              {/* The page couldn't be fetched: the form takes the text, and keeps the link (F10). */}
              {run.fetchFailed && run.url && (
                <Button variant="outline" size="sm" onClick={() => pasteInstead(run.url ?? "")}>
                  Paste the text instead
                </Button>
              )}
            </div>
            {run.status === "running" && <ActiveRun run={run} onEnd={refresh} />}
            {run.status !== "running" && run.steps.length > 0 && <RunSteps steps={run.steps} warnings={run.warnings} />}
            {run.error && <p className="text-destructive">{run.error}</p>}
            {refused?.runId === run.runId && <p className="text-destructive">{refused.error}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The steps and progress of the run that is using the model. */
function ActiveRun({ run, onEnd }: { run: RunSummary; onEnd: () => void }) {
  const followed = useRun();
  const { follow } = followed;
  const { runId, kind } = run;
  // Only a new application's language is news; "Try again" already remembered its own.
  const language = run.kind === "new" ? (run.language ?? "") : undefined;

  useEffect(() => {
    const leaving = new AbortController();
    void follow(runId, { kind, language, signal: leaving.signal }).then(() => {
      if (!leaving.signal.aborted) onEnd();
    });
    return () => leaving.abort();
  }, [follow, runId, kind, language, onEnd]);

  return <RunProgress run={followed} />;
}
