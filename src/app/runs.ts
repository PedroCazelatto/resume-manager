import { detailsSummary, type JobSummary } from "@/core/application/job";
import type { RunEvent, RunStep } from "@/core/pipeline/run";
import type { FetchedPosting, JobFetcher } from "@/core/posting/job-fetcher";
import { INDEED_BLOCKED, isIndeedLink, linkPlatform } from "@/core/posting/sites";
import { fetchedStart, type PastedStart, type PostingStart } from "@/core/posting/start";
import {
  addNotFetched,
  archiveRuns,
  archiveTarget,
  canArchive,
  cancelRun,
  offersTryAgain,
  triedAgain,
  enqueue,
  enqueueFetch,
  failFetch,
  fetchDone,
  fetchFailed,
  findRun,
  finishRun,
  forgetApplication,
  madeApplication,
  moveApplication,
  nextFetch,
  nextRun,
  pasteText,
  recordEvent,
  removeLink,
  restoreRuns,
  runsOf,
  runSteps,
  startFetch,
  startRun,
  targetBusy,
  type ArchiveTarget,
  type QueueEvent,
  type QueuedRun,
  type RunKind,
  type RunStatus,
  type RunStepState,
} from "@/core/runs/queue";

// The runs the server knows about (F42). They live in memory only and are gone after a
// restart (Art. IV.1). One run uses the model at a time; the others wait their turn. A run
// started from a link has its posting fetched first, in a queue of its own that doesn't
// wait for the model, and joins the run queue only when the fetch worked (F10). Its
// application's folder and job.md are made when its fetch starts, so what it got survives a
// restart (F50).

/**
 * What a run was asked to do. It stays with the run after it ends, so "Try again" can queue
 * the same posting or link. The posting is never logged or listed (Art. III.4).
 */
export interface RunRequest {
  /**
   * A link alone is fetched first; the fetched posting then takes its place (F10). A posting
   * (fetched or pasted) is also in its application's job.md, which the pipeline reads (F50).
   * `{ id }` continues a saved application.
   */
  start: PostingStart | { id: string } | { url: string };
  /**
   * The application the run works on when its folder exists already: an Indeed link's or pasted
   * text's, made when it was added, or a link fetched again into its application (F50).
   */
  applicationId?: string;
}

/**
 * The application folders the fetch queue makes and writes, in the run's profile only
 * (Art. III.7, F50). The app writes them through ProfileStore; tests may leave them out, and
 * then nothing is saved before the pipeline.
 */
export interface RunFolders {
  /** Makes a new application's folder and job.md, holding the link and its platform; returns its ID. */
  create(profile: string, url: string): Promise<string>;
  /**
   * Writes a fetched posting into its application's job.md: the address it was read from, the
   * page's details, when it arrived, and its text. Answers the problem that kept it from being
   * written, an invalid job.md named with its path (Art. IV.6), or null once written.
   */
  fetched(profile: string, id: string, posting: PostingStart): Promise<string | null>;
  /** Deletes the folder made when a link's fetch started, once the link was removed with the X. */
  remove(profile: string, id: string): Promise<void>;
}

/** Why a link's fetch failed when its application's folder couldn't be made or written. */
export const FOLDER_FAILED = "Couldn't save the application's folder. See the server console.";

export type AppRun = QueuedRun<RunRequest>;

/**
 * Does a run's work, sending its events; throws when the run fails. `signal` is aborted
 * when the user cancels the run, and the work then stops as soon as it can (F32).
 */
export type ExecuteRun = (run: AppRun, send: (event: RunEvent) => void, signal: AbortSignal) => Promise<void>;

/** A run as the Runs list shows it. */
export interface RunSummary {
  runId: string;
  kind: RunKind;
  status: RunStatus;
  /** When the run started, in milliseconds since the epoch (F39). */
  startedAt?: number;
  applicationId?: string;
  /**
   * The job's title, company and company website, once known: read from the posting's page once
   * its fetch worked, then from job.md once the application is saved (F38, F46). Page text, never
   * the posting's.
   */
  title?: string;
  company?: string;
  companyUrl?: string;
  /** The job platform: named from the run's link, then as job.md says it (F46). */
  source?: string;
  error?: string;
  /** The steps the run went through and their context-size warnings (F30, F40). */
  steps: RunStepState[];
  warnings: Partial<Record<RunStep, string>>;
  /** The Runs list offers "Try again" on the run itself: it ended before its analysis was saved (F19, F50). */
  retryable: boolean;
  /**
   * The posting's link: the link as given until its fetch worked, then the address the text was
   * read from, after the LinkedIn rewrite and any redirects, which is the `url` saved in
   * `job.md` (F10, F47). For pasted text, the link kept with it.
   */
  url?: string;
  /**
   * The run's fetch failed, or its link is one the server never requests: it needs the posting's
   * text, and the list offers "Paste the text" (F10, F47, F48).
   */
  fetchFailed: boolean;
  /** The row has the archive button: the run was cancelled, failed or finished (F48). */
  archivable: boolean;
}

/** Receives a run's events; `close` is called once, after the last one. */
export interface RunFollower {
  event(event: QueueEvent): void;
  close(): void;
}

export type RunRegistry = ReturnType<typeof createRunRegistry>;

/** The link of a run that still has to fetch its posting, or null. */
function linkToFetch(start: RunRequest["start"]): string | null {
  return "posting" in start || "id" in start ? null : start.url;
}

/** Used where no run starts from a link. */
const noFetcher: JobFetcher["fetchPosting"] = async () => ({ ok: false, reason: "Links can't be fetched here." });

/** `now` is the clock that says when a run started; `folders` saves what the fetch queue gets (F50). */
export function createRunRegistry(
  execute: ExecuteRun,
  fetchPosting: JobFetcher["fetchPosting"] = noFetcher,
  now: () => number = Date.now,
  folders?: RunFolders,
) {
  let runs: AppRun[] = [];
  const followers = new Map<string, Set<RunFollower>>();
  /** The running run and what cancels it (F32). */
  let active: { runId: string; cancel: AbortController } | null = null;
  /** The run whose posting is being fetched and what stops the fetch (F10). */
  let fetching: { runId: string; cancel: AbortController } | null = null;

  /** Sends a run's latest event to everyone following it. */
  function publish(runId: string) {
    const event = runs.find((run) => run.runId === runId)?.events.at(-1);
    if (event) for (const follower of followers.get(runId) ?? []) follower.event(event);
  }

  function close(runId: string) {
    for (const follower of followers.get(runId) ?? []) follower.close();
    followers.delete(runId);
  }

  /** Runs the waiting runs one after another; does nothing while one is running. */
  async function work() {
    for (let run = nextRun(runs); run; run = nextRun(runs)) {
      const { runId } = run;
      runs = startRun(runs, runId, now());
      publish(runId);
      const cancel = new AbortController();
      active = { runId, cancel };
      let error: string | null = null;
      try {
        await execute(
          run,
          (event) => {
            runs = recordEvent(runs, runId, event);
            publish(runId);
          },
          cancel.signal,
        );
      } catch (thrown) {
        error = thrown instanceof Error ? thrown.message : "Something went wrong. See the server console.";
      }
      active = null;
      // A run that stopped after the user cancelled it didn't fail. One that still got
      // to its end is finished.
      const cancelled = error !== null && cancel.signal.aborted;
      runs = cancelled ? cancelRun(runs, runId) : finishRun(runs, runId, error);
      if (error !== null) publish(runId);
      close(runId);
    }
  }

  /**
   * Fetches the postings of the runs started from a link, one after another, whether or
   * not a run is using the model. A run whose fetch worked joins the run queue; the others
   * end as failed and never reach the model (F10). A new link's application folder is made
   * when its fetch starts, and gets the posting once fetched; a link removed meanwhile has the
   * folder made for it deleted again, so nothing of it is left (F50).
   */
  async function fetchWork() {
    if (fetching) return;
    for (let run = nextFetch(runs); run; run = nextFetch(runs)) {
      const { runId, profile, input } = run;
      const cancel = new AbortController();
      fetching = { runId, cancel };
      runs = startFetch(runs, runId);
      publish(runId);
      const link = linkToFetch(input.start) ?? "";
      const removed = () => !runs.some((other) => other.runId === runId);
      /** The folder this fetch made, the only one the X deletes. */
      let made: string | null = null;
      let failure: string | null = null;
      let read: { start: PostingStart } | { error: string } | null = null;
      try {
        if (folders && run.applicationId === undefined) {
          made = await folders.create(profile, link);
          if (!removed()) runs = madeApplication(runs, runId, made);
        }
        if (!removed()) read = fetchedStart(await fetchOne(link, cancel.signal));
        const applicationId = made ?? run.applicationId;
        if (read && "start" in read && folders && applicationId !== undefined && !removed()) {
          failure = await folders.fetched(profile, applicationId, read.start);
        }
      } catch (error) {
        // Folder errors carry file paths at most, never posting text (Art. III.4).
        console.error(error);
        failure = FOLDER_FAILED;
      }
      fetching = null;
      if (removed()) {
        if (made !== null) await folders?.remove(profile, made).catch((error: unknown) => console.error(error));
        continue;
      }
      if (failure !== null || read === null || "error" in read) {
        runs = failFetch(runs, runId, failure ?? (read && "error" in read ? read.error : FOLDER_FAILED));
        publish(runId);
        close(runId);
      } else {
        runs = fetchDone(runs, runId, { ...input, start: read.start });
        publish(runId);
        void work();
      }
    }
  }

  /** Fetches one link; a fetcher that throws is a failed fetch. */
  async function fetchOne(link: string, signal: AbortSignal): Promise<FetchedPosting> {
    try {
      return await fetchPosting(link, signal);
    } catch {
      return { ok: false, reason: "Something went wrong while fetching the posting." };
    }
  }

  /**
   * Adds a run and returns its ID right away. One started from a link goes to the fetch
   * queue first, except an Indeed link, which is never requested: it asks for its posting's
   * text at once (F47). Any other run goes to the run queue and starts when its turn comes.
   * A run whose application exists already keeps its ID (F50).
   */
  function add(profile: string, kind: RunKind, input: RunRequest): string {
    const runId = crypto.randomUUID();
    const link = linkToFetch(input.start);
    const applicationId = input.applicationId ?? ("id" in input.start ? input.start.id : undefined);
    const run = { runId, profile, kind, input, ...(applicationId === undefined ? {} : { applicationId }) };
    if (link !== null && isIndeedLink(link)) {
      runs = addNotFetched(runs, run, INDEED_BLOCKED);
      return runId;
    }
    if (link !== null) {
      runs = enqueueFetch(runs, run);
      void fetchWork();
      return runId;
    }
    runs = enqueue(runs, run);
    void work();
    return runId;
  }

  return {
    enqueue(profile: string, kind: RunKind, input: RunRequest): string {
      return add(profile, kind, input);
    },

    /**
     * Whether a run of this profile takes the posting's pasted text: its fetch failed, or it is
     * an Indeed link's run, and it isn't archived (F48). Answers the application whose job.md
     * gets the text, when it has one (F50).
     */
    pasteTarget(profile: string, runId: string): { applicationId?: string } | "refused" | "unknown" {
      const run = findRun(runs, profile, runId);
      if (!run) return "unknown";
      if (!fetchFailed(run) || run.archivedAt !== undefined) return "refused";
      return run.applicationId === undefined ? {} : { applicationId: run.applicationId };
    },

    /**
     * The posting's text, pasted with its link, for a run of this profile that needs it: its
     * fetch failed, or it is an Indeed link's run. The same run joins the end of the run queue
     * and keeps its ID; no new run takes its place (F48). The app has written the text into the
     * run's application, `applicationId`, first (F50).
     */
    paste(profile: string, runId: string, start: PastedStart, applicationId?: string): "queued" | "refused" | "unknown" {
      if (!findRun(runs, profile, runId)) return "unknown";
      const result = pasteText(runs, profile, runId, { start, ...(applicationId === undefined ? {} : { applicationId }) });
      if (!result.pasted) return "refused";
      runs = applicationId === undefined ? result.runs : madeApplication(result.runs, runId, applicationId);
      void work();
      return "queued";
    },

    /** The profile's own runs, in the order the Runs list shows them (Art. III.7). */
    list(profile: string): RunSummary[] {
      return runsOf(runs, profile).map((run) => {
        const { start } = run.input;
        const url = "url" in start ? start.url : undefined;
        // The page's details come with the fetched posting; job.md's, once saved, come after (F46).
        const job: JobSummary = { ...("details" in start && start.details ? detailsSummary(start.details) : {}), ...run.job };
        return {
          runId: run.runId,
          kind: run.kind,
          status: run.status,
          startedAt: run.startedAt,
          applicationId: run.applicationId,
          title: job.title,
          company: job.company,
          companyUrl: job.companyUrl,
          source: job.source ?? (url === undefined ? undefined : linkPlatform(url)),
          error: run.error,
          ...runSteps(run.events),
          retryable: offersTryAgain(runs, run),
          url,
          fetchFailed: fetchFailed(run),
          archivable: canArchive(runs, run),
        };
      });
    },

    /**
     * What a run of this profile's archive button archives: its application, with every run of
     * it, or the run alone while it has none (F48). "refused" for a run that hasn't ended, is
     * archived already, or whose application still has a run waiting or running.
     */
    archiveTarget(profile: string, runId: string): ArchiveTarget | "refused" | "unknown" {
      const run = findRun(runs, profile, runId);
      if (!run) return "unknown";
      return canArchive(runs, run) ? archiveTarget(run) : "refused";
    },

    /** What restoring an archived run of this profile restores; "refused" for a run that isn't archived (F48). */
    restoreTarget(profile: string, runId: string): ArchiveTarget | "refused" | "unknown" {
      const run = findRun(runs, profile, runId);
      if (!run) return "unknown";
      return run.archivedAt === undefined ? "refused" : archiveTarget(run);
    },

    /** Whether the profile has a run of this application still being fetched, waiting or running (F48). */
    busy(profile: string, target: ArchiveTarget): boolean {
      return targetBusy(runs, profile, target);
    },

    /** Archives a row of this profile at `at`, an ISO timestamp: its runs that ended leave the list (F48). */
    archive(profile: string, target: ArchiveTarget, at: string): void {
      runs = archiveRuns(runs, profile, target, at);
    },

    /** Restores a row of this profile: an unfinished run comes back as cancelled, a finished one as it was (F48). */
    restore(profile: string, target: ArchiveTarget): void {
      runs = restoreRuns(runs, profile, target);
    },

    /**
     * An application of this profile was renamed by the one-time update (F50): its runs, and
     * what they were asked to do, name its new folder.
     */
    renamed(profile: string, from: string, to: string): void {
      const rename = (id: string | undefined) => (id === from ? to : id);
      runs = moveApplication(runs, profile, from, to).map((run) => {
        if (run.applicationId !== to) return run;
        const { start, applicationId } = run.input;
        const input: RunRequest = { ...run.input, start: "id" in start ? { id: rename(start.id)! } : start };
        if (applicationId !== undefined) input.applicationId = rename(applicationId);
        return { ...run, input };
      });
    },

    /** An application of this profile was deleted by the one-time update: its runs leave the list (F50). */
    forget(profile: string, applicationId: string): void {
      runs = forgetApplication(runs, profile, applicationId);
    },

    /**
     * "Try again" for a run of this profile that ended before its analysis was saved:
     * queues a new run with the same posting, and returns its ID (F19). A run whose fetch
     * failed has its link fetched again (F10), into the same application (F50). The button is
     * used once: it comes back only when the run it queued is no longer listed.
     */
    retry(profile: string, runId: string): { runId: string } | "refused" | "unknown" {
      const run = findRun(runs, profile, runId);
      if (!run) return "unknown";
      if (!offersTryAgain(runs, run)) return "refused";
      // Its application, once made, is the one tried again: a failed fetch fetches its link
      // again into it, any other run continues it from its job.md (F50).
      const input = run.applicationId === undefined ? run.input : { ...run.input, applicationId: run.applicationId };
      const again = add(profile, "new", input);
      runs = triedAgain(runs, runId, again);
      return { runId: again };
    },

    /**
     * Replays a run's events so far, then follows it until it ends. Returns how to stop
     * following, or null when the profile has no such run.
     */
    follow(profile: string, runId: string, follower: RunFollower): (() => void) | null {
      const run = findRun(runs, profile, runId);
      if (!run) return null;
      for (const event of run.events) follower.event(event);
      if (run.status !== "fetching" && run.status !== "queued" && run.status !== "running") {
        follower.close();
        return () => {};
      }
      // The page shows "Remove" only once it knows the run is really waiting (F42).
      if (run.status === "queued") follower.event({ type: "waiting" });
      const following = followers.get(runId) ?? new Set();
      followers.set(runId, following.add(follower));
      return () => following.delete(follower);
    },

    /**
     * Stops a run of this profile. A link in the fetch queue leaves it and the list: it is not
     * fetched, its fetch is stopped if it had begun, and nothing is kept (F10, F48). A waiting
     * run is cancelled at once and never starts; it stays listed as cancelled (F48). The running
     * one is told to stop: it ends as `cancelled` once its model call has stopped, and the next
     * run starts then (F32).
     */
    remove(profile: string, runId: string): "removed" | "cancelled" | "cancelling" | "ended" | "unknown" {
      const run = findRun(runs, profile, runId);
      if (!run) return "unknown";
      if (run.status === "running" && active?.runId === runId) {
        active.cancel.abort();
        return "cancelling";
      }
      if (run.status === "queued") {
        runs = cancelRun(runs, runId);
        publish(runId);
        close(runId);
        return "cancelled";
      }
      const result = removeLink(runs, profile, runId);
      if (!result.removed) return "ended";
      if (fetching?.runId === runId) fetching.cancel.abort();
      runs = result.runs;
      for (const follower of followers.get(runId) ?? []) follower.event({ type: "removed" });
      close(runId);
      return "removed";
    },
  };
}
