"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LanguageSelect } from "@/components/language-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RunProgress, useRun } from "@/components/use-run";

/** Paste a posting and follow the run step by step (F09, F30). */
export function NewApplicationForm() {
  const router = useRouter();
  const run = useRun();
  const [posting, setPosting] = useState("");
  const [language, setLanguage] = useState("");

  async function start(url: string, body: Record<string, string>) {
    const id = await run.start(url, body);
    if (id) router.push(`/applications/${id}`);
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium">New application</h2>
      <Textarea
        aria-label="Job posting"
        placeholder="Paste the full job posting here"
        className="min-h-60"
        value={posting}
        disabled={run.running}
        onChange={(e) => setPosting(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <LanguageSelect value={language} disabled={run.running} onChange={setLanguage} />
        <Button
          disabled={run.running || posting.trim() === ""}
          onClick={() => start("/api/applications", { posting, language })}
        >
          {run.running ? "Working…" : "Generate resume"}
        </Button>
      </div>

      <RunProgress run={run} />
      {run.error && (
        <div className="space-y-2 text-sm">
          <p className="text-destructive">{run.error}</p>
          {run.savedId && (
            <div className="flex flex-wrap items-center gap-3">
              {/* The finished steps are saved, so trying again continues from the failed one (F19). */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => start(`/api/applications/${run.savedId}`, { language })}
              >
                Try again
              </Button>
              <Link href={`/applications/${run.savedId}`} className="underline">
                See what was saved
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
