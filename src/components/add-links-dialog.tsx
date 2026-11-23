"use client";

import { useState } from "react";
import { addedMessage, uncheckedMessage } from "@/core/posting/known-links";
import { readLinks, refusedMessage, splitLines } from "@/core/posting/links";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { enqueueRuns } from "@/components/use-run";

/** Tells the home table that links were queued from the modal, so it shows the Generating tab. */
export const LINKS_QUEUED = "links-queued";

/**
 * The button at the top right of the home page and its modal: give postings' links, one per
 * line, and queue a run for each, as the form's "From links" tab did (F26, F33). A link the
 * profile already has is skipped, and the modal names it (F47).
 */
export function AddLinksDialog() {
  const [open, setOpen] = useState(false);
  /** The links as typed, one per line. */
  const [links, setLinks] = useState("");
  const [sending, setSending] = useState(false);
  /** What the last submission added and skipped, and the saved files it couldn't check, until the links change. */
  const [sent, setSent] = useState<{ added: string; unchecked: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openChange(next: boolean) {
    setOpen(next);
    // Each opening starts empty.
    if (!next) {
      setLinks("");
      setSent(null);
      setError(null);
    }
  }

  async function generate() {
    setError(null);
    const lines = splitLines(links);
    // Every line is checked before anything starts (F33). An Indeed link is queued like the
    // others: the server lists it as needing its text, without requesting it (F47).
    const read = readLinks(lines);
    if (!read.ok) {
      setError(refusedMessage(read.refused));
      return;
    }
    setSending(true);
    const reply = await enqueueRuns("/api/applications", { urls: lines });
    setSending(false);
    if ("error" in reply) {
      setError(reply.error);
      return;
    }
    setSent({
      added: addedMessage(reply.runIds.length, reply.skipped),
      unchecked: reply.problems.length > 0 ? uncheckedMessage(reply.problems) : null,
    });
    if (reply.runIds.length > 0) window.dispatchEvent(new Event(LINKS_QUEUED));
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger render={<Button />}>
        <Icon name="plus" />
        Add links
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add links</DialogTitle>
          <DialogDescription>Each job posting&apos;s link becomes its own application.</DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="Links to the job postings, one per line"
          className="min-h-32"
          placeholder="https://… the job postings' pages, one link per line"
          value={links}
          disabled={sending}
          onChange={(e) => {
            // One run per link: the button unlocks again when the links change.
            setLinks(e.target.value);
            setSent(null);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={sending || sent !== null || links.trim() === ""} onClick={generate}>
            Generate resume
          </Button>
          {/* The count of runs added, then each skipped line with why (F47). */}
          {sent && <span className="text-sm whitespace-pre-line text-muted-foreground">{sent.added}</span>}
        </div>
        {sent?.unchecked && <p className="text-sm whitespace-pre-line text-destructive">{sent.unchecked}</p>}
        {/* A refused list names one line per line of the message (F33). */}
        {error && <p className="text-sm whitespace-pre-line text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
