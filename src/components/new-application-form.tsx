"use client";

import { useEffect, useState } from "react";
import { addedMessage, uncheckedMessage } from "@/core/posting/known-links";
import { readLinks, refusedMessage, splitLines } from "@/core/posting/links";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { enqueueRuns } from "@/components/use-run";

type Tab = "links" | "paste";

const PASTE_INSTEAD = "paste-posting-instead";

/**
 * Opens the form's "Paste text" tab with this link kept; the Runs list calls it for a run
 * whose fetch failed, or an Indeed link's run. The pasted text then takes that run's place
 * in the list (F10, F47).
 */
export function pasteInstead(runId: string, url: string) {
  window.dispatchEvent(new CustomEvent<FailedFetch>(PASTE_INSTEAD, { detail: { runId, url } }));
}

interface FailedFetch {
  runId: string;
  url: string;
}

/**
 * Give postings' links, one per line, or paste one posting's text, and queue a run for
 * each; the Runs list below follows them (F09, F10, F33, F42). A link the profile already
 * has is skipped, and the form names it (F47).
 */
export function NewApplicationForm() {
  const [tab, setTab] = useState<Tab>("links");
  /** The links as typed, one per line. */
  const [links, setLinks] = useState("");
  const [posting, setPosting] = useState("");
  /** The link saved with a pasted posting; required, since every posting has its link (F47). */
  const [keptLink, setKeptLink] = useState("");
  /** The run whose fetch failed and whose posting is being pasted. */
  const [replaces, setReplaces] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  /**
   * What the last submission added and skipped, and the saved files it couldn't check, until
   * the input changes (F33, F47).
   */
  const [sent, setSent] = useState<{ added: string; unchecked: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Why the form moved to "Paste text" for a run of the Runs list. */
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const paste = (event: Event) => {
      const { runId, url } = (event as CustomEvent<FailedFetch>).detail;
      setTab("paste");
      setKeptLink(url);
      setReplaces(runId);
      setNotice("Paste the posting's text here. Its link is kept with the application.");
      setSent(null);
      setError(null);
      document.getElementById("new-application")?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener(PASTE_INSTEAD, paste);
    return () => window.removeEventListener(PASTE_INSTEAD, paste);
  }, []);

  /** One run per link or pasted posting: the button unlocks again when the input changes. */
  function change(set: (value: string) => void, value: string) {
    set(value);
    setSent(null);
  }

  async function generate() {
    setError(null);
    const lines = splitLines(links);
    if (tab === "links") {
      // Every line is checked before anything starts (F33). An Indeed link is queued like the
      // others: the server lists it as needing its text, without requesting it (F47).
      const read = readLinks(lines);
      if (!read.ok) {
        setError(refusedMessage(read.refused));
        return;
      }
    }
    setSending(true);
    setNotice(null);
    const body: Record<string, string | string[]> =
      tab === "links"
        ? { urls: lines }
        : { posting, url: keptLink, ...(replaces ? { replaces } : {}) };
    const reply = await enqueueRuns("/api/applications", body);
    setSending(false);
    if ("error" in reply) {
      setError(reply.error);
      return;
    }
    setReplaces(null);
    setSent({
      added: addedMessage(reply.runIds.length, reply.skipped),
      unchecked: reply.problems.length > 0 ? uncheckedMessage(reply.problems) : null,
    });
  }

  // Pasted text always goes with its link (F47).
  const empty = tab === "links" ? links.trim() === "" : posting.trim() === "" || keptLink.trim() === "";

  return (
    <SectionCard id="new-application" title="New application" contentClassName="space-y-3">
      <Tabs
        value={tab}
        onValueChange={(next) => {
          setTab(next as Tab);
          setReplaces(null);
          setSent(null);
          setError(null);
          setNotice(null);
        }}
      >
        <TabsList>
          <TabsTrigger value="links">From links</TabsTrigger>
          <TabsTrigger value="paste">Paste text</TabsTrigger>
        </TabsList>
        <TabsContent value="links">
          <Textarea
            aria-label="Links to the job postings, one per line"
            className="min-h-32"
            placeholder="https://… the job postings' pages, one link per line"
            value={links}
            disabled={sending}
            onChange={(e) => change(setLinks, e.target.value)}
          />
        </TabsContent>
        <TabsContent value="paste" className="space-y-3">
          {notice && <p className="text-muted-foreground">{notice}</p>}
          <Textarea
            aria-label="Job posting"
            placeholder="Paste the full job posting here"
            className="min-h-60"
            value={posting}
            disabled={sending}
            onChange={(e) => change(setPosting, e.target.value)}
          />
          <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="text-muted-foreground">Link</span>
            <Input
              type="url"
              required
              placeholder="The posting's page, saved with the application"
              value={keptLink}
              disabled={sending}
              onChange={(e) => change(setKeptLink, e.target.value)}
            />
          </label>
        </TabsContent>
      </Tabs>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={sending || sent !== null || empty} onClick={generate}>
          Generate resume
        </Button>
        {/* The count of runs added, then each skipped line with why (F47). */}
        {sent && <span className="text-sm whitespace-pre-line text-muted-foreground">{sent.added}</span>}
      </div>
      {sent?.unchecked && <p className="text-sm whitespace-pre-line text-destructive">{sent.unchecked}</p>}
      {/* A refused list names one line per line of the message (F33). */}
      {error && <p className="text-sm whitespace-pre-line text-destructive">{error}</p>}
    </SectionCard>
  );
}
