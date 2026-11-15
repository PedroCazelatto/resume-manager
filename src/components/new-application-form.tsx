"use client";

import { useState } from "react";
import { LanguageSelect } from "@/components/language-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enqueueRun } from "@/components/use-run";

/** Paste a posting and queue its run; the Runs list below follows it (F09, F42). */
export function NewApplicationForm() {
  const [posting, setPosting] = useState("");
  const [language, setLanguage] = useState("");
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function change(value: string) {
    setPosting(value);
    setQueued(false);
  }

  async function generate() {
    setSending(true);
    setError(null);
    const reply = await enqueueRun("/api/applications", { posting, language });
    setSending(false);
    setQueued("runId" in reply);
    if ("error" in reply) setError(reply.error);
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium">New application</h2>
      <Textarea
        aria-label="Job posting"
        placeholder="Paste the full job posting here"
        className="min-h-60"
        value={posting}
        disabled={sending}
        onChange={(e) => change(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <LanguageSelect value={language} disabled={sending} onChange={setLanguage} />
        {/* One run per pasted posting: the button unlocks again when the text changes. */}
        <Button disabled={sending || queued || posting.trim() === ""} onClick={generate}>
          Generate resume
        </Button>
        {queued && <span className="text-sm text-muted-foreground">Added to the runs below.</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
