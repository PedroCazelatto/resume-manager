"use client";

import { useEffect, useState } from "react";
import { readLinks, refusedMessage, splitLines } from "@/core/posting/links";
import { INDEED_BLOCKED, isIndeedUrl } from "@/core/posting/sites";
import { parseLink } from "@/core/posting/url";
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
 * whose fetch failed. The pasted text then takes that run's place in the list (F10).
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
 * each; the Runs list below follows them (F09, F10, F33, F42).
 */
export function NewApplicationForm() {
  const [tab, setTab] = useState<Tab>("links");
  /** The links as typed, one per line. */
  const [links, setLinks] = useState("");
  const [posting, setPosting] = useState("");
  /** The link saved with a pasted posting. */
  const [keptLink, setKeptLink] = useState("");
  /** The run whose fetch failed and whose posting is being pasted. */
  const [replaces, setReplaces] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  /** How many runs the last submission queued. */
  const [queued, setQueued] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** Why the form moved to "Paste text" by itself. */
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const paste = (event: Event) => {
      const { runId, url } = (event as CustomEvent<FailedFetch>).detail;
      openPaste(url, "Paste the posting's text here. Its link is kept with the application.");
      setReplaces(runId);
      document.getElementById("new-application")?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener(PASTE_INSTEAD, paste);
    return () => window.removeEventListener(PASTE_INSTEAD, paste);
  }, []);

  function openPaste(url: string, why: string) {
    setTab("paste");
    setKeptLink(url);
    setReplaces(null);
    setNotice(why);
    setQueued(0);
    setError(null);
  }

  /** One run per link or pasted posting: the button unlocks again when the input changes. */
  function change(set: (value: string) => void, value: string) {
    set(value);
    setQueued(0);
  }

  async function generate() {
    setError(null);
    const lines = splitLines(links);
    if (tab === "links") {
      // Indeed answers the server with a security check, so its links aren't queued. One
      // given alone moves to "Paste text" (F10); in a list it is refused like an invalid line.
      const given = lines.map((line) => line.trim()).filter((line) => line !== "");
      const only = given.length === 1 ? parseLink(given[0]) : null;
      if (only?.ok && isIndeedUrl(only.url)) {
        openPaste(given[0], `${INDEED_BLOCKED} The link is kept with the application.`);
        return;
      }
      // Every line is checked before anything starts (F33).
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
        : { posting, ...(keptLink.trim() ? { url: keptLink } : {}), ...(replaces ? { replaces } : {}) };
    const reply = await enqueueRuns("/api/applications", body);
    setSending(false);
    setQueued("runIds" in reply ? reply.runIds.length : 0);
    if ("error" in reply) setError(reply.error);
    else setReplaces(null);
  }

  const empty = tab === "links" ? links.trim() === "" : posting.trim() === "";

  return (
    <SectionCard id="new-application" title="New application" contentClassName="space-y-3">
      <Tabs
        value={tab}
        onValueChange={(next) => {
          setTab(next as Tab);
          setReplaces(null);
          setQueued(0);
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
              placeholder="Optional: the posting's page, saved with the application"
              value={keptLink}
              disabled={sending}
              onChange={(e) => change(setKeptLink, e.target.value)}
            />
          </label>
        </TabsContent>
      </Tabs>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={sending || queued > 0 || empty} onClick={generate}>
          Generate resume
        </Button>
        {queued > 0 && (
          <span className="text-sm text-muted-foreground">
            {queued === 1 ? "Added to the runs below." : `Added ${queued} runs to the runs below.`}
          </span>
        )}
      </div>
      {/* A refused list names one line per line of the message (F33). */}
      {error && <p className="text-sm whitespace-pre-line text-destructive">{error}</p>}
    </SectionCard>
  );
}
