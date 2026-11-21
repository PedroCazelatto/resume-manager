"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { RunSummary } from "@/app/runs";
import { webAddress } from "@/core/posting/url";
import { stopAction, waitingToFetch } from "@/core/runs/queue";
import { Icon } from "@/components/icon";
import { pasteInstead } from "@/components/new-application-form";
import { tellEndedRuns } from "@/components/run-notifications";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, type Tone } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RUNS_CHANGED, RunProgress, RunSteps, enqueueRun, useRun } from "@/components/use-run";

const REFRESH_MS = 2000;

/** The run's kind, as a small label; a new application has none, since every row is one (F46). */
const KIND_LABELS: Partial<Record<RunSummary["kind"], string>> = {
  retry: "Try again",
  verify: "Verify again",
};

const STATUS_LABELS: Record<RunSummary["status"], string> = {
  fetching: "fetching the posting",
  queued: "waiting",
  running: "running",
  done: "finished",
  failed: "failed",
  cancelled: "cancelled",
};

const STATUS_TONES: Record<RunSummary["status"], Tone> = {
  fetching: "neutral",
  queued: "neutral",
  running: "green",
  done: "green",
  failed: "red",
  cancelled: "neutral",
};

/** A failed fetch, or an Indeed link's run, waits for the posting's text (F10, F47). */
const needsText = (run: RunSummary) => run.status === "failed" && run.fetchFailed;

/**
 * What a row says about its run: only the link being fetched is "fetching the posting" (F48). A
 * failed fetch that was archived and restored says "cancelled", and still offers to paste the text.
 */
function stateLabel(run: RunSummary): string {
  if (needsText(run)) return "needs the posting's text";
  return waitingToFetch(run) ? "waiting to fetch" : STATUS_LABELS[run.status];
}

/**
 * The selected profile's runs since the app started: the active one with its steps, the
 * waiting ones in order, then the finished ones with the steps they went through (F42).
 */
export function RunsList() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  /** Why the last "Try again" or archive button of a run didn't work. */
  const [problem, setProblem] = useState<{ runId: string; error: string } | null>(null);

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

  /** Removes a link from the fetch queue, or cancels a waiting run (F48). */
  async function stop(runId: string) {
    await fetch(`/api/runs/${runId}`, { method: "DELETE" }).catch(() => null);
    await refresh();
  }

  /** Queues the run's posting or link again; the server kept it with the run (F19). */
  async function tryAgain(runId: string) {
    const reply = await enqueueRun(`/api/runs/${runId}`, {});
    setProblem("error" in reply ? { runId, error: reply.error } : null);
  }

  /** Moves the row to the archived list at once; nothing is deleted, so nothing is asked (F48). */
  async function archive(runId: string) {
    const response = await fetch(`/api/runs/${runId}/archive`, { method: "POST" }).catch(() => null);
    if (response?.ok) {
      setProblem(null);
    } else {
      const reply = (await response?.json().catch(() => null)) as { error?: string } | null | undefined;
      setProblem({ runId, error: reply?.error ?? (response ? `The server answered ${response.status}.` : "Can't reach the app.") });
    }
    await refresh();
  }

  if (runs.length === 0) return null;
  return (
    <SectionCard id="runs" title="Runs">
      <ul className="divide-y text-sm">
        {runs.map((run) => (
          <li key={run.runId} className="space-y-1 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-3">
              <RunJob run={run} />
              <StatusBadge tone={needsText(run) ? "amber" : STATUS_TONES[run.status]}>{stateLabel(run)}</StatusBadge>
              {/* A link of the fetch queue is removed: not fetched, nothing kept. A waiting run is
                  cancelled and stays listed; the running one has its X next to its step (F48). */}
              {run.status !== "running" && stopAction(run) && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={stopAction(run) === "remove" ? "Remove link" : "Cancel"}
                  onClick={() => stop(run.runId)}
                >
                  <Icon name="x" />
                </Button>
              )}
              {/* A run with an application is tried again from its page. */}
              {run.retryable && (
                <Button variant="outline" size="sm" onClick={() => tryAgain(run.runId)}>
                  Try again
                </Button>
              )}
              {/* The page couldn't be fetched, or is an Indeed page the server never requests: the
                  form takes the text and keeps the link, and this same run moves on (F10, F47, F48). */}
              {run.fetchFailed && run.url && (
                <Button variant="outline" size="sm" onClick={() => pasteInstead(run.runId, run.url ?? "")}>
                  Paste the text
                </Button>
              )}
              {/* A cancelled, failed or finished row leaves the list; nothing is deleted (F48). */}
              {run.archivable && (
                <Button variant="outline" size="icon-sm" aria-label="Archive" onClick={() => archive(run.runId)}>
                  <Icon name="archive" />
                </Button>
              )}
            </div>
            {run.status === "running" && <ActiveRun run={run} onEnd={refresh} />}
            {run.status !== "running" && run.steps.length > 0 && (
              <RunSteps
                steps={run.steps}
                warnings={run.warnings}
                ended={run.status === "done" || run.status === "failed" || run.status === "cancelled"}
              />
            )}
            {run.error && <p className="text-destructive">{run.error}</p>}
            {problem?.runId === run.runId && <p className="text-destructive">{problem.error}</p>}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/**
 * The job a row stands for (F46): its title, linked to the application once it exists, with the
 * run's kind as a small label, and the company and platform under it, the company linked to its
 * website when the posting gives one. Until the title is known the row shows the run's link. The
 * details come from the posting's page, which is untrusted (Art. II.7): they are shown as text,
 * and the website becomes a link only as an http or https address.
 */
function RunJob({ run }: { run: RunSummary }) {
  const name = run.title ?? run.url ?? run.applicationId;
  // A link or an ID has no spaces to wrap at.
  const wrap = run.title === undefined ? "break-all" : "break-words";
  const website = webAddress(run.companyUrl);
  const kind = KIND_LABELS[run.kind];
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {run.applicationId ? (
          <Link href={`/applications/${run.applicationId}`} className={`${wrap} font-medium text-primary underline underline-offset-2`}>
            {name}
          </Link>
        ) : (
          <span className={`${wrap} font-medium`}>{name}</span>
        )}
        {kind && <Badge variant="outline">{kind}</Badge>}
      </p>
      {(run.company || run.source) && (
        <p className="text-xs break-words text-muted-foreground">
          {run.company &&
            (website ? (
              <a href={website} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {run.company}
              </a>
            ) : (
              run.company
            ))}
          {run.company && run.source && " · "}
          {run.source}
        </p>
      )}
    </div>
  );
}

/** The steps and progress of the run that is using the model. */
function ActiveRun({ run, onEnd }: { run: RunSummary; onEnd: () => void }) {
  const followed = useRun();
  const { follow } = followed;
  const { runId, kind } = run;

  useEffect(() => {
    const leaving = new AbortController();
    void follow(runId, { kind, signal: leaving.signal }).then(() => {
      if (!leaving.signal.aborted) onEnd();
    });
    return () => leaving.abort();
  }, [follow, runId, kind, onEnd]);

  return <RunProgress run={followed} />;
}
