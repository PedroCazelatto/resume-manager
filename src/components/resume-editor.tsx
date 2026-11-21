"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { previewResume, saveResume } from "@/app/applications/[id]/actions";
import { ResumePreview } from "@/components/resume-preview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useActiveRun, type ActiveRun } from "@/components/use-active-run";
import { RunProgress, useRun } from "@/components/use-run";

const PREVIEW_DELAY_MS = 400;

interface Props {
  id: string;
  /** The content fields of resume.md, as YAML. */
  yaml: string;
  html: string;
  maxPages?: number;
  /** What still keeps the resume a draft; Print stays disabled until it is empty (F24). */
  blockers: string[];
  /** False when the model review has to run (again) before the resume can be ready. */
  reviewCurrent: boolean;
  /** The "Verify again" run that is already working on this application or waiting for it, if any (F39). */
  active: ActiveRun | null;
}

/** Edit the resume's content with a live preview, verify it again, and print it (F20–F22, F24). */
export function ResumeEditor({ id, yaml, html, maxPages, blockers, reviewCurrent, active }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [text, setText] = useState(yaml);
  const [savedText, setSavedText] = useState(yaml);
  const [edited, setEdited] = useState<{ text: string; html: string } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, startSaving] = useTransition();
  // "Verify again" is a run in the queue, like a generation (F42).
  const router = useRouter();
  const verification = useRun();
  useActiveRun(verification, active);
  // `active` covers the moment before the page starts following it.
  const verifying = verification.running || active !== null;
  const dirty = text !== savedText;
  // While editing, the preview shows the last edit that rendered; otherwise the saved file.
  const preview = dirty ? (edited?.html ?? html) : html;

  useEffect(() => {
    if (!dirty) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await previewResume(id, text);
      if (stale) return;
      if (result.ok) setEdited({ text, html: result.html });
      setProblems(result.ok ? [] : result.problems);
    }, PREVIEW_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [id, text, dirty]);

  function change(value: string) {
    setText(value);
    if (value === savedText) setProblems([]);
  }

  function save() {
    startSaving(async () => {
      const result = await saveResume(id, text);
      if (result.ok) setSavedText(text);
      setProblems(result.ok ? [] : result.problems);
    });
  }

  async function verify() {
    setProblems([]);
    if (await verification.start(`/api/applications/${id}/verification`, {}, "verify")) router.refresh();
  }

  const busy = saving || verifying;
  const shownProblems = verification.error ? [...problems, verification.error] : problems;
  const printBlockers = dirty ? ["you save or discard your changes"] : blockers;

  return (
    <div className="space-y-3">
      {/* Print and Edit come first, so they stay in view above the preview (F35). */}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || printBlockers.length > 0} onClick={() => frame.current?.contentWindow?.print()}>
          Print / Save as PDF
        </Button>
        {!reviewCurrent && (
          <Button variant="outline" disabled={busy || dirty} onClick={verify}>
            {verifying ? "Verifying… this can take minutes" : "Verify again"}
          </Button>
        )}
        {printBlockers.length > 0 && (
          <span className="text-sm text-muted-foreground">Printing unlocks when: {printBlockers.join("; ")}.</span>
        )}
      </div>
      <RunProgress run={verification} cancellable />
      <details className="space-y-2 rounded-lg border px-3 py-2">
        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Edit the resume</summary>
        <Textarea
          aria-label="Resume content"
          className="mt-2 min-h-96 font-mono text-xs"
          spellCheck={false}
          value={text}
          disabled={busy}
          onChange={(e) => change(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={busy || !dirty || problems.length > 0} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" disabled={busy || !dirty} onClick={() => change(savedText)}>
            Discard changes
          </Button>
          <span className="text-sm text-muted-foreground">
            Saving checks names, dates and numbers again; the model review then has to run again.
          </span>
        </div>
      </details>
      {shownProblems.length > 0 && (
        <ul className="list-disc pl-6 text-sm text-destructive">
          {shownProblems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      <ResumePreview html={preview} maxPages={maxPages} frameRef={frame} />
    </div>
  );
}
