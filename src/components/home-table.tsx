"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Home } from "@/app/home";
import type { HomeRow, HomeTab, RowAction, RowTone } from "@/core/home/table";
import type { RunKind } from "@/core/runs/queue";
import { webAddress } from "@/core/posting/url";
import { LINKS_QUEUED } from "@/components/add-links-dialog";
import { Icon } from "@/components/icon";
import { tellEndedRuns } from "@/components/run-notifications";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { RUNS_CHANGED, RunProgress, RunSteps, enqueueRun, enqueueRuns, useRun } from "@/components/use-run";
import { cn } from "@/lib/utils";

const REFRESH_MS = 2000;

/** What each action reads, as a button or a menu item. */
const ACTION_LABELS: Record<RowAction, string> = {
  remove: "Remove link",
  cancel: "Cancel",
  "try-again": "Try again",
  paste: "Paste the text",
  open: "Open",
  archive: "Archive",
  restore: "Restore",
  "view-pdf": "View PDF",
  delete: "Delete",
};

/** The glowing ball of each status colour (F26, F35). */
const BALL: Record<RowTone, string> = {
  green: "bg-green-500 shadow-[0_0_6px_1px_var(--color-green-500)]",
  red: "bg-red-500 shadow-[0_0_6px_1px_var(--color-red-500)]",
  amber: "bg-amber-500 shadow-[0_0_6px_1px_var(--color-amber-500)]",
  neutral: "bg-zinc-400 shadow-[0_0_6px_1px_var(--color-zinc-400)] dark:bg-zinc-500 dark:shadow-[0_0_6px_1px_var(--color-zinc-500)]",
};

const EMPTY: Record<HomeTab, string> = {
  ready: "No finished resumes yet.",
  generating: "Nothing is waiting or being generated.",
  archived: "Nothing is archived.",
};

/** The row a dialog is open for. */
type Dialogs = { paste: HomeRow | null; delete: HomeRow | null };

/**
 * The home page's table of the selected profile's applications (F26): the generation in
 * progress above the tabs, then Ready, Generating and Archived. It reads `GET /api/runs` every
 * 2 seconds, and at once when this tab queues, cancels, archives or restores something; every
 * refresh tells about the runs that ended (F38).
 */
export function HomeTable({ initial }: { initial: Home }) {
  const router = useRouter();
  const [home, setHome] = useState(initial);
  const [tab, setTab] = useState<HomeTab>(initial.table.firstTab);
  /** Why the last action on a row didn't work. */
  const [problem, setProblem] = useState<{ key: string; error: string } | null>(null);
  const [dialogs, setDialogs] = useState<Dialogs>({ paste: null, delete: null });

  const refresh = useCallback(async () => {
    const response = await fetch("/api/runs").catch(() => null);
    if (!response?.ok) return;
    const next = (await response.json()) as Home;
    setHome(next);
    // A run that ended since this tab saw it waiting or running is told about (F38).
    tellEndedRuns(next.runs);
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, REFRESH_MS);
    const queued = () => setTab("generating");
    window.addEventListener(RUNS_CHANGED, refresh);
    window.addEventListener(LINKS_QUEUED, queued);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener(RUNS_CHANGED, refresh);
      window.removeEventListener(LINKS_QUEUED, queued);
    };
  }, [refresh]);

  /** Sends a request about a row; its error, if any, is shown under the row. */
  async function send(row: HomeRow, url: string, method: "POST" | "DELETE") {
    const response = await fetch(url, { method }).catch(() => null);
    if (!response?.ok) {
      const reply = (await response?.json().catch(() => null)) as { error?: string } | null | undefined;
      setProblem({ key: row.key, error: reply?.error ?? (response ? `The server answered ${response.status}.` : "Can't reach the app.") });
    }
    await refresh();
  }

  async function act(row: HomeRow, action: RowAction) {
    setProblem(null);
    const id = row.applicationId;
    // A row with an application acts on it; a run without one acts on itself (F48).
    const archive = id === undefined ? `/api/runs/${row.runId}/archive` : `/api/applications/${id}/archive`;
    if (action === "remove" || action === "cancel") {
      // A link of the fetch queue is removed; a waiting run, or an Indeed link that needs its text, is cancelled (F48, F26).
      await send(row, `/api/runs/${row.runId}`, "DELETE");
    } else if (action === "try-again") {
      // "Try again" of the application's page, or of the run itself while it has no application (F19, F50).
      const reply = await enqueueRun(id === undefined ? `/api/runs/${row.runId}` : `/api/applications/${id}`, {});
      if ("error" in reply) setProblem({ key: row.key, error: reply.error });
    } else if (action === "archive" || action === "restore") {
      // Nothing is deleted, so nothing is asked (F48).
      await send(row, archive, action === "archive" ? "POST" : "DELETE");
    } else if (action === "open") {
      router.push(`/applications/${id}`);
    } else if (action === "view-pdf") {
      window.open(`/applications/${id}/pdf`, "_blank", "noopener");
    } else {
      setDialogs((open) => ({ ...open, [action]: row }));
    }
  }

  const { table } = home;
  const { counts } = table;
  return (
    <div className="space-y-6">
      {table.running && (
        <SectionCard title="In progress" contentClassName="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <StatusBall tone="green" pulse className="mt-1.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <RowJob row={table.running} />
              <RowState row={table.running} />
            </div>
          </div>
          {/* Its steps, timer, token counts and X, from its own stream (F30, F39, F48). */}
          <ActiveRun key={table.running.runId} runId={table.running.runId!} kind={table.running.kind!} onEnd={refresh} />
        </SectionCard>
      )}
      <Tabs value={tab} onValueChange={(next) => setTab(next as HomeTab)}>
        <TabsList>
          <TabsTrigger value="ready">Ready</TabsTrigger>
          <TabsTrigger value="generating">
            Generating
            {(counts.waiting > 0 || counts.fetching > 0) && (
              <>
                <span aria-hidden className="text-muted-foreground tabular-nums">
                  {counts.waiting} / {counts.fetching}
                </span>
                <span className="sr-only">
                  : {counts.waiting} waiting for the model, {counts.fetching} being fetched
                </span>
              </>
            )}
            {counts.problems > 0 && (
              <>
                <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-full bg-red-600 text-xs text-white tabular-nums">
                  {counts.problems}
                </span>
                <span className="sr-only">, {counts.problems} with problems</span>
              </>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
        {(["ready", "generating", "archived"] as const).map((name) => (
          <TabsContent key={name} value={name}>
            <Rows rows={table[name]} empty={EMPTY[name]} problem={problem} act={act} />
          </TabsContent>
        ))}
      </Tabs>
      <PasteDialog key={`paste-${dialogs.paste?.key ?? ""}`} row={dialogs.paste} onClose={() => setDialogs((open) => ({ ...open, paste: null }))} />
      <DeleteDialog
        key={`delete-${dialogs.delete?.key ?? ""}`}
        row={dialogs.delete}
        onClose={() => setDialogs((open) => ({ ...open, delete: null }))}
        onDeleted={refresh}
      />
    </div>
  );
}

/** One tab's rows, or what it says when it has none. */
function Rows({
  rows,
  empty,
  problem,
  act,
}: {
  rows: HomeRow[];
  empty: string;
  problem: { key: string; error: string } | null;
  act: (row: HomeRow, action: RowAction) => void;
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-muted-foreground">{empty}</p>;
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8 pl-4">
              <span className="sr-only">Status</span>
            </TableHead>
            <TableHead>Job</TableHead>
            <TableHead className="hidden sm:table-cell">State</TableHead>
            <TableHead className="pr-4 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="w-8 pl-4 align-top">
                <StatusBall tone={row.tone} className="mt-1.5" />
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                <div className="min-w-0 space-y-1">
                  <RowJob row={row} />
                  {/* On narrow screens the state goes under the job (F26). */}
                  <div className="sm:hidden">
                    <RowState row={row} />
                  </div>
                  {row.steps.length > 0 && (
                    <RunSteps steps={row.steps} warnings={row.warnings} ended={row.state !== "fetching the posting"} />
                  )}
                  {row.error && <p className="text-destructive">{row.error}</p>}
                  {problem?.key === row.key && <p className="text-destructive">{problem.error}</p>}
                </div>
              </TableCell>
              <TableCell className="hidden align-top whitespace-normal sm:table-cell">
                <RowState row={row} />
              </TableCell>
              <TableCell className="pr-4 align-top">
                <RowActions row={row} act={act} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** The row's status as a glowing ball in its colour; the state column says it in words (F26). */
function StatusBall({ tone, pulse = false, className }: { tone: RowTone; pulse?: boolean; className?: string }) {
  return <span aria-hidden className={cn("block size-2.5 shrink-0 rounded-full", BALL[tone], pulse && "animate-pulse", className)} />;
}

/**
 * The job a row stands for (F46): its title, linked to the application once it exists, and the
 * company under it in a smaller font, linked to its website when the posting gives one. Until
 * the title is known the row shows its link. The details come from the posting's page, which is
 * untrusted (Art. II.7): they are shown as text, and the website is a link only as an http or
 * https address.
 */
function RowJob({ row }: { row: HomeRow }) {
  const name = row.title ?? row.url ?? row.applicationId ?? row.key;
  // A link or an ID has no spaces to wrap at.
  const wrap = row.title === undefined ? "break-all" : "break-words";
  const website = webAddress(row.companyUrl);
  return (
    <div className="min-w-0">
      {row.applicationId ? (
        <Link href={`/applications/${row.applicationId}`} className={cn(wrap, "font-medium hover:underline hover:underline-offset-2")}>
          {name}
        </Link>
      ) : (
        <span className={cn(wrap, "font-medium")}>{name}</span>
      )}
      {row.company && (
        <p className="text-xs break-words text-muted-foreground">
          {website ? (
            <a href={website} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {row.company}
            </a>
          ) : (
            row.company
          )}
        </p>
      )}
    </div>
  );
}

/** The row's state, with the run's kind as a small label, and the source under it (F26). */
function RowState({ row }: { row: HomeRow }) {
  return (
    <div className="space-y-0.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{row.state}</span>
        {row.label && <Badge variant="outline">{row.label}</Badge>}
      </p>
      {row.source && <p className="text-xs break-words text-muted-foreground">{row.source}</p>}
    </div>
  );
}

/** The row's main action as a visible button, and its other actions in a menu (F26). */
function RowActions({ row, act }: { row: HomeRow; act: (row: HomeRow, action: RowAction) => void }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {row.main && <MainAction row={row} action={row.main} act={act} />}
      {row.menu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}>
            <Icon name="list" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            {row.menu.map((action) => (
              <DropdownMenuItem key={action} onClick={() => act(row, action)}>
                {ACTION_LABELS[action]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function MainAction({ row, action, act }: { row: HomeRow; action: RowAction; act: (row: HomeRow, action: RowAction) => void }) {
  if (action === "remove" || action === "cancel") {
    return (
      <Button variant="outline" size="icon-sm" aria-label={ACTION_LABELS[action]} onClick={() => act(row, action)}>
        <Icon name="x" />
      </Button>
    );
  }
  if (action === "view-pdf") {
    const blockers = row.printBlockers ?? [];
    // A resume that can't be printed yet doesn't open as a printable PDF (Art. VI.7), as the
    // application page's "Print / Save as PDF" stays disabled.
    if (blockers.length > 0) {
      const why = `Printing unlocks when: ${blockers.join("; ")}.`;
      return (
        <span title={why}>
          <Button variant="outline" size="sm" disabled>
            View PDF
          </Button>
        </span>
      );
    }
    return (
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<a href={`/applications/${row.applicationId}/pdf`} target="_blank" rel="noopener noreferrer" />}
      >
        View PDF
      </Button>
    );
  }
  return (
    <Button variant={action === "delete" ? "destructive" : "outline"} size="sm" onClick={() => act(row, action)}>
      {ACTION_LABELS[action]}
    </Button>
  );
}

/** The steps and progress of the run that is using the model, followed through its stream. */
function ActiveRun({ runId, kind, onEnd }: { runId: string; kind: RunKind; onEnd: () => void }) {
  const followed = useRun();
  const { follow } = followed;

  useEffect(() => {
    const leaving = new AbortController();
    void follow(runId, { kind, signal: leaving.signal }).then(() => {
      if (!leaving.signal.aborted) onEnd();
    });
    return () => leaving.abort();
  }, [follow, runId, kind, onEnd]);

  return <RunProgress run={followed} />;
}

/**
 * Takes the posting's text for a row whose fetch failed, Indeed included (F48): it goes to the
 * row's own run, which moves on with it, or to its application when no run of it is in memory
 * (F26). The link is kept with the text, as every posting keeps its link (F47).
 */
function PasteDialog({ row, onClose }: { row: HomeRow | null; onClose: () => void }) {
  const [posting, setPosting] = useState("");
  const [link, setLink] = useState(row?.url ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!row) return;
    setSending(true);
    setError(null);
    const target = row.pasteTo === "run" ? `/api/runs/${row.runId}/posting` : `/api/applications/${row.applicationId}/posting`;
    const reply = await enqueueRuns(target, { posting, url: link });
    setSending(false);
    if ("error" in reply) setError(reply.error);
    else onClose();
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Paste the posting&apos;s text</DialogTitle>
          <DialogDescription>Paste the posting&apos;s text here. Its link is kept with the application.</DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="Job posting"
          placeholder="Paste the full job posting here"
          className="max-h-[50svh] min-h-60"
          value={posting}
          disabled={sending}
          onChange={(e) => setPosting(e.target.value)}
        />
        <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-muted-foreground">Link</span>
          <Input
            type="url"
            required
            placeholder="The posting's page, saved with the application"
            value={link}
            disabled={sending}
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
        {error && <p className="text-sm whitespace-pre-line text-destructive">{error}</p>}
        <DialogFooter>
          <Button disabled={sending || posting.trim() === "" || link.trim() === ""} onClick={send}>
            Generate resume
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Asks before deleting an archived row that never finished, and says plainly that it can't be
 * recovered (Art. IV.8, F26). Confirming deletes the application's whole folder; a row without
 * an application only leaves the list.
 */
function DeleteDialog({ row, onClose, onDeleted }: { row: HomeRow | null; onClose: () => void; onDeleted: () => Promise<void> }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = row ? (row.title ?? row.url ?? row.applicationId ?? row.key) : "";

  async function confirm() {
    if (!row) return;
    setWorking(true);
    setError(null);
    const url = row.applicationId === undefined ? `/api/runs/${row.runId}` : `/api/applications/${row.applicationId}`;
    const response = await fetch(url, { method: "DELETE" }).catch(() => null);
    setWorking(false);
    if (response?.ok) {
      onClose();
      await onDeleted();
      return;
    }
    const reply = (await response?.json().catch(() => null)) as { error?: string } | null | undefined;
    setError(reply?.error ?? (response ? `The server answered ${response.status}.` : "Can't reach the app."));
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="leading-snug break-words">Delete “{name}”?</DialogTitle>
          <DialogDescription className="break-words">
            {row?.applicationId === undefined
              ? "This job leaves the list for good. It can't be recovered."
              : `This deletes everything about this job: its folder applications/${row.applicationId}/, with the posting and anything saved for it. It can't be recovered.`}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={working} onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" disabled={working} onClick={confirm}>
            {working ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
