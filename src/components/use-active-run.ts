"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { RunSummary } from "@/app/runs";
import type { Run } from "@/components/use-run";

/** The run that was working on an application, or waiting for it, when its page was rendered. */
export type ActiveRun = Pick<RunSummary, "runId" | "kind" | "language">;

/**
 * Follows the run the page found for its application when it was opened or reloaded, as if
 * the page had started it, and reloads the page's content when the run ends (F39).
 */
export function useActiveRun(run: Run, active: ActiveRun | null) {
  const router = useRouter();
  const { follow } = run;
  // The run this page already follows, because it started it or picked it up before.
  const followed = useRef(run.runId);
  useEffect(() => {
    followed.current = run.runId;
  });

  const runId = active?.runId;
  const kind = active?.kind;
  // Only a new application's language is news; "Try again" already remembered its own.
  const language = kind === "new" ? (active?.language ?? "") : undefined;

  useEffect(() => {
    if (runId === undefined || kind === undefined || followed.current === runId) return;
    const leaving = new AbortController();
    void follow(runId, { kind, language, signal: leaving.signal }).then(() => {
      if (!leaving.signal.aborted) router.refresh();
    });
    return () => leaving.abort();
  }, [follow, runId, kind, language, router]);
}
