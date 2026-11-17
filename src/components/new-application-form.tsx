"use client";

import { useEffect, useState } from "react";
import { INDEED_BLOCKED, isIndeedUrl } from "@/core/posting/sites";
import { parseLink } from "@/core/posting/url";
import { LanguageSelect } from "@/components/language-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { enqueueRun } from "@/components/use-run";

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
 * Give a posting's link or paste its text, and queue the run; the Runs list below follows
 * it (F09, F10, F42).
 */
export function NewApplicationForm() {
  const [tab, setTab] = useState<Tab>("links");
  const [link, setLink] = useState("");
  const [posting, setPosting] = useState("");
  /** The link saved with a pasted posting. */
  const [keptLink, setKeptLink] = useState("");
  /** The run whose fetch failed and whose posting is being pasted. */
  const [replaces, setReplaces] = useState<string | null>(null);
  const [language, setLanguage] = useState("");
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState(false);
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
    setQueued(false);
    setError(null);
  }

  /** One run per link or pasted posting: the button unlocks again when the input changes. */
  function change(set: (value: string) => void, value: string) {
    set(value);
    setQueued(false);
  }

  async function generate() {
    setError(null);
    if (tab === "links") {
      // Indeed answers the server with a security check, so its links aren't queued (F10).
      const parsed = parseLink(link);
      if (parsed.ok && isIndeedUrl(parsed.url)) {
        openPaste(link.trim(), `${INDEED_BLOCKED} The link is kept with the application.`);
        return;
      }
    }
    setSending(true);
    setNotice(null);
    const body: Record<string, string> =
      tab === "links"
        ? { url: link, language }
        : { posting, language, ...(keptLink.trim() ? { url: keptLink } : {}), ...(replaces ? { replaces } : {}) };
    const reply = await enqueueRun("/api/applications", body);
    setSending(false);
    setQueued("runId" in reply);
    if ("error" in reply) setError(reply.error);
    else setReplaces(null);
  }

  const empty = tab === "links" ? link.trim() === "" : posting.trim() === "";

  return (
    <section id="new-application" className="space-y-3">
      <h2 className="font-medium">New application</h2>
      <Tabs
        value={tab}
        onValueChange={(next) => {
          setTab(next as Tab);
          setReplaces(null);
          setQueued(false);
          setError(null);
          setNotice(null);
        }}
      >
        <TabsList>
          <TabsTrigger value="links">From links</TabsTrigger>
          <TabsTrigger value="paste">Paste text</TabsTrigger>
        </TabsList>
        <TabsContent value="links">
          <Input
            type="url"
            aria-label="Link to the job posting"
            placeholder="https://… the job posting's page"
            value={link}
            disabled={sending}
            onChange={(e) => change(setLink, e.target.value)}
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
          <label className="flex items-center gap-3">
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
        <LanguageSelect value={language} disabled={sending} onChange={setLanguage} />
        <Button disabled={sending || queued || empty} onClick={generate}>
          Generate resume
        </Button>
        {queued && <span className="text-sm text-muted-foreground">Added to the runs below.</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
