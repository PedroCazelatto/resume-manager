"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { RunSummary } from "@/app/runs";
import { LanguageSelect } from "@/components/language-select";
import { Button } from "@/components/ui/button";
import { RunProgress, rememberedLanguage, useRun } from "@/components/use-run";
import { latestGeneration } from "@/core/runs/queue";

/**
 * Shown while an application's run is incomplete: continues it from the first step that
 * has no saved output (F19). The language only matters while the resume isn't written.
 */
export function RetryRun({ id, needsResume }: { id: string; needsResume: boolean }) {
  const router = useRouter();
  const run = useRun();
  // null until the user picks one. Until then the language of the application's latest run
  // applies, while the server still knows one; after a restart, the one this browser remembers.
  const [chosen, setChosen] = useState<string | null>(null);
  const [queued, setQueued] = useState<string | null>(null);
  const remembered = useSyncExternalStore(
    () => () => {},
    () => rememberedLanguage(id),
    () => "",
  );
  const language = chosen ?? queued ?? remembered;

  useEffect(() => {
    let stale = false;
    void fetch("/api/runs")
      .then((response) => (response.ok ? (response.json() as Promise<{ runs: RunSummary[] }>) : null))
      .then((reply) => {
        const run = reply && latestGeneration(reply.runs, id);
        if (run && !stale) setQueued(run.language ?? "");
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [id]);

  async function retry() {
    if (await run.start(`/api/applications/${id}`, { language }, "retry")) router.refresh();
  }

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">This run didn&apos;t finish</h2>
      <p className="text-sm text-muted-foreground">
        {needsResume ? "The resume has not been written yet." : "The resume has not been verified yet."} The finished
        steps are saved; trying again continues from there.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {needsResume && <LanguageSelect value={language} disabled={run.running} onChange={setChosen} />}
        <Button disabled={run.running} onClick={retry}>
          {run.running ? "Working…" : "Try again"}
        </Button>
      </div>
      <RunProgress run={run} removable />
      {run.error && <p className="text-sm text-destructive">{run.error}</p>}
    </section>
  );
}
