import type { RunKind, RunStatus } from "./queue";

// What the browser tells the user when a run ends (F38). These functions only decide the
// words and which runs to tell about; the page shows the notification and sets the title.

/** A run that ended, with the job's company and title when the run got far enough to know them. */
export interface EndedRun {
  kind: RunKind;
  status: RunStatus;
  company?: string;
  title?: string;
  /** The run's fetch failed, or its link is never requested, so it needs the posting's text (F10, F47). */
  fetchFailed?: boolean;
  /** The posting's link. */
  url?: string;
}

/** What a failed fetch says instead of "Run failed" (F48). */
export const FETCH_FAILED_TITLE = "Couldn't read the posting: paste the text";

export interface RunNotice {
  /** The system notification's title. */
  title: "Resume ready" | "Run failed" | "Verification finished" | "Verification failed" | typeof FETCH_FAILED_TITLE;
  /** The company and title, when known; for a failed fetch, the link. */
  body?: string;
  /** What the tab title starts with until the tab is focused again. */
  tab: "Done" | "Failed";
}

/** The notice for a run's end, or null when there is nothing to tell: only a finished or failed run has one. */
export function runNotice(run: EndedRun): RunNotice | null {
  // A run the user cancelled is no news to them, and one still fetching, waiting or running hasn't ended.
  if (run.status !== "done" && run.status !== "failed") return null;
  // A failed fetch asks for the posting's text, and names the link it couldn't read (F48).
  if (run.status === "failed" && run.fetchFailed) {
    return { title: FETCH_FAILED_TITLE, ...(run.url ? { body: run.url } : {}), tab: "Failed" };
  }
  const body = [run.company, run.title].filter(Boolean).join(" · ");
  // "Verify again" writes no resume, so it has its own words.
  const verify = run.kind === "verify";
  const ready = verify ? "Verification finished" : "Resume ready";
  const failed = verify ? "Verification failed" : "Run failed";
  return {
    title: run.status === "done" ? ready : failed,
    ...(body ? { body } : {}),
    tab: run.status === "done" ? "Done" : "Failed",
  };
}

/**
 * Whether the system notification is shown: only while the user isn't looking at the tab,
 * that is, the page is hidden or its window isn't focused.
 */
export function showsNotification(page: { hidden: boolean; focused: boolean }): boolean {
  return page.hidden || !page.focused;
}

/** The tab title while a notice is unseen; `title` is the page's normal title. */
export function noticeTabTitle(notice: RunNotice, title: string): string {
  return `${notice.tab} · ${title}`;
}

/**
 * Compares the Runs list with the runs this tab has seen waiting or running. `watched` is
 * the new set of those, and `ended` the watched runs that are over now, each returned once.
 * A run that was already over when the tab first saw it is never returned.
 */
export function endedRuns<Run extends { runId: string; status: RunStatus }>(
  watched: ReadonlySet<string>,
  runs: readonly Run[],
): { watched: Set<string>; ended: Run[] } {
  const next = new Set(watched);
  const ended: Run[] = [];
  for (const run of runs) {
    if (run.status === "fetching" || run.status === "queued" || run.status === "running") next.add(run.runId);
    else if (next.delete(run.runId)) ended.push(run);
  }
  return { watched: next, ended };
}
