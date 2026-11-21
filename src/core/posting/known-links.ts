import { jobSchema } from "../application/schemas";
import { validateMarkdownFile, type FileError } from "../markdown/validate";
import type { RunStatus } from "../runs/queue";
import type { ListedLink } from "./links";
import { jobKey } from "./sites";
import { parseLink } from "./url";

// One application per link (F47, F50): there is no need to write a second resume for the same
// link. A link the profile already has is skipped, unless its application failed or was
// cancelled: that same application starts again. Pure functions; the route reads the runs and
// the saved `job.md` files.

/**
 * A row of the profile's Runs list, as the rule reads it: its state, the link it shows, and the
 * application it works on, once it has one.
 */
export interface KnownRun {
  status: RunStatus;
  url?: string;
  applicationId?: string;
}

/**
 * A saved application's link, from the `url` of its `job.md`, and whether its generation
 * finished (`generationFinished`).
 */
export interface SavedLink {
  id: string;
  url: string;
  finished: boolean;
}

/** A link of the list to queue: a new application, or one that starts again, `applicationId` (F50). */
export type KeptLink = ListedLink & { applicationId?: string };

/** A link of the list that wasn't queued: its line in the text as given, the line's text, and why. */
export interface SkippedLine {
  line: number;
  text: string;
  reason: string;
}

/** The job a link names (`jobKey`), or null for text that isn't an http or https link. */
function keyOf(link: string | undefined): string | null {
  const parsed = link === undefined ? null : parseLink(link);
  return parsed?.ok ? jobKey(parsed.url) : null;
}

/**
 * Splits the links of a list into the ones to queue and the ones skipped, in the order given.
 * A link is skipped when a row of the Runs list with the same job is fetching, waiting, running
 * or finished, or a run of its application is fetching, waiting or running ("already in the Runs
 * list", named first); or when a saved application with the same link finished ("already
 * saved"). A failed or cancelled row doesn't count. An application with the same link that
 * didn't finish, archived or not, starts again: the link is queued with its `applicationId`, so
 * no second folder is made (F50). Two LinkedIn links to one job are the same (F47).
 */
export function skipKnownLinks(
  links: readonly ListedLink[],
  runs: readonly KnownRun[],
  saved: readonly SavedLink[],
): { links: KeptLink[]; skipped: SkippedLine[] } {
  const going = (status: RunStatus) => status === "fetching" || status === "queued" || status === "running";
  const listed = new Set(
    runs.filter((run) => run.status !== "failed" && run.status !== "cancelled").map((run) => keyOf(run.url)),
  );
  const busy = new Set(runs.filter((run) => going(run.status)).map((run) => run.applicationId));
  // A link's finished application wins over one that didn't finish; otherwise the first by ID.
  const applications = new Map<string | null, SavedLink>();
  for (const application of [...saved].sort((a, b) => Number(b.finished) - Number(a.finished))) {
    if (!applications.has(keyOf(application.url))) applications.set(keyOf(application.url), application);
  }

  const kept: KeptLink[] = [];
  const skipped: SkippedLine[] = [];
  for (const link of links) {
    const key = keyOf(link.url);
    const application = key === null ? undefined : applications.get(key);
    if ((key !== null && listed.has(key)) || (application !== undefined && busy.has(application.id))) {
      skipped.push({ line: link.line, text: link.text, reason: "Skipped: it is already in the Runs list." });
    } else if (application?.finished) {
      skipped.push({ line: link.line, text: link.text, reason: `Skipped: it is already saved in application ${application.id}.` });
    } else kept.push(application === undefined ? link : { ...link, applicationId: application.id });
  }
  return { links: kept, skipped };
}

/**
 * The links of the saved applications, read from their `job.md` files, which are validated
 * like every file the app reads (Art. IV.6), with whether each one's generation finished. A file
 * that isn't valid is returned with its problems, to be shown, never skipped silently. An
 * application without a link has none.
 */
export function savedLinks(
  jobFiles: readonly { id: string; source: string; finished: boolean }[],
): { saved: SavedLink[]; problems: FileError[] } {
  const saved: SavedLink[] = [];
  const problems: FileError[] = [];
  for (const { id, source, finished } of jobFiles) {
    const job = validateMarkdownFile(jobSchema, `applications/${id}/job.md`, source);
    if (!job.ok) problems.push(job.error);
    else if (job.data.url !== undefined) saved.push({ id, url: job.data.url, finished });
  }
  return { saved, problems };
}

/**
 * What the form says once a list was sent: how many runs were added, then each skipped line
 * with why, one per line. A list where every link was skipped added nothing, which isn't an error.
 */
export function addedMessage(added: number, skipped: readonly SkippedLine[]): string {
  const count =
    added === 0 ? "Nothing was added: every link is already there." : added === 1 ? "Added to the runs below." : `Added ${added} runs to the runs below.`;
  return [count, ...skipped.map(({ line, text, reason }) => `Line ${line} (${text}): ${reason}`)].join("\n");
}

/** Names the saved applications whose `job.md` couldn't be read, so their links weren't checked. */
export function uncheckedMessage(problems: readonly FileError[]): string {
  return [
    "These applications couldn't be checked for the same link:",
    ...problems.map(({ file, problems: found }) => `${file}: ${found.join("; ")}`),
  ].join("\n");
}
