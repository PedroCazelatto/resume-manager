"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { LanguageSelect } from "@/components/language-select";
import { Button } from "@/components/ui/button";
import { RunProgress, rememberedLanguage, useRun } from "@/components/use-run";

/**
 * Shown while an application's run is incomplete: continues it from the first step that
 * has no saved output (F19). The language only matters while the resume isn't written.
 */
export function RetryRun({ id, needsResume }: { id: string; needsResume: boolean }) {
  const router = useRouter();
  const run = useRun();
  // null until the user picks one; then the language remembered in this browser applies.
  const [chosen, setChosen] = useState<string | null>(null);
  const remembered = useSyncExternalStore(
    () => () => {},
    () => rememberedLanguage(id),
    () => "",
  );
  const language = chosen ?? remembered;

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
      <RunProgress run={run} />
      {run.error && <p className="text-sm text-destructive">{run.error}</p>}
    </section>
  );
}
