"use client";

import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { useActiveRun, type ActiveRun } from "@/components/use-active-run";
import { RunProgress, useRun } from "@/components/use-run";

/**
 * Shown while an application's run is incomplete: continues it from the first step that
 * has no saved output (F19). `active` is the run that is already working on the application
 * or waiting for it, if any: its progress is shown instead (F39).
 */
export function RetryRun({ id, needsResume, active }: { id: string; needsResume: boolean; active: ActiveRun | null }) {
  const router = useRouter();
  const run = useRun();
  useActiveRun(run, active);
  // `active` covers the moment before the page starts following it.
  const working = run.running || active !== null;

  async function retry() {
    if (await run.start(`/api/applications/${id}`, {}, "retry")) router.refresh();
  }

  return (
    <SectionCard
      title={working ? "This run is in progress" : "This run didn’t finish"}
      description={
        <>
          {needsResume ? "The resume has not been written yet." : "The resume has not been verified yet."}
          {!working && " The finished steps are saved; trying again continues from there."}
        </>
      }
      contentClassName="space-y-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={working} onClick={retry}>
          {working ? "Working…" : "Try again"}
        </Button>
      </div>
      <RunProgress run={run} removable />
      {run.error && <p className="text-sm text-destructive">{run.error}</p>}
    </SectionCard>
  );
}
