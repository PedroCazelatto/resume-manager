import { endedRuns, noticeTabTitle, runNotice, showsNotification, type EndedRun } from "@/core/runs/notice";

// Tells the user that a run ended, with a system notification and the tab title (F38).
// Everything happens in the open page: no service worker and no request (Art. III.2).

/** The runs this tab has seen waiting or running. */
let watched: ReadonlySet<string> = new Set();
/** The runs this tab has already told about: the Runs list and a followed stream may both report one. */
const told = new Set<string>();
/** The page's own title while the tab title starts with "Done" or "Failed". */
let normalTitle: string | null = null;

const canNotify = () => typeof window !== "undefined" && "Notification" in window;

/**
 * Asks for the notification permission when a run is started, while the browser has no
 * answer yet. Once it is granted or denied the browser remembers, and nothing is asked.
 */
export function askToNotify() {
  if (!canNotify() || Notification.permission !== "default") return;
  try {
    void Promise.resolve(Notification.requestPermission()).catch(() => {});
  } catch {
    // Without the permission only the tab title tells.
  }
}

/** Remembers a run this tab queued, so its end is told even if it ends before the Runs list shows it. */
export function watchRun(runId: string) {
  watched = new Set(watched).add(runId);
}

function restoreTitle() {
  if (normalTitle !== null) document.title = normalTitle;
  normalTitle = null;
}

/** Tells about a run's end, once per run in this tab. A cancelled run is not told about. */
export function tellRunEnded(runId: string, run: EndedRun) {
  const notice = runNotice(run);
  if (!notice || told.has(runId)) return;
  told.add(runId);

  // A focused tab needs no title change: it would be put back at once.
  if (!document.hasFocus()) {
    normalTitle ??= document.title;
    document.title = noticeTabTitle(notice, normalTitle);
    window.addEventListener("focus", restoreTitle, { once: true });
  }

  // Someone looking at the tab sees the run end there, so nothing is shown.
  if (!showsNotification({ hidden: document.hidden, focused: document.hasFocus() })) return;
  if (!canNotify() || Notification.permission !== "granted") return;
  try {
    // The tag keeps two tabs of the app from stacking two notifications for the same run.
    const shown = new Notification(notice.title, { body: notice.body, tag: runId });
    shown.onclick = () => {
      window.focus();
      shown.close();
    };
  } catch {
    // Some browsers only show notifications from a service worker; the tab title still tells.
  }
}

/** Tells about the runs of the Runs list that ended since this tab saw them waiting or running. */
export function tellEndedRuns(runs: readonly ({ runId: string } & EndedRun)[]) {
  const next = endedRuns(watched, runs);
  watched = next.watched;
  for (const run of next.ended) tellRunEnded(run.runId, run);
}
