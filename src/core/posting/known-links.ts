import { jobSchema } from "../application/schemas";
import { validateMarkdownFile, type FileError } from "../markdown/validate";
import type { RunStatus } from "../runs/queue";
import type { ListedLink } from "./links";
import { jobKey } from "./sites";
import { parseLink } from "./url";

// A link the profile already has is skipped (F47): there is no need to write a second resume
// for the same link. Pure functions; the route reads the runs and the saved `job.md` files.

/** A row of the profile's Runs list, as the rule reads it: its state and the link it shows. */
export interface KnownRun {
  status: RunStatus;
  url?: string;
}

/** A saved application's link, from the `url` of its `job.md`. */
export interface SavedLink {
  id: string;
  url: string;
}

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
 * A link is skipped when a row of the Runs list with the same job didn't fail and wasn't
 * cancelled, or when a saved application's `job.md` has the same link. A failed or cancelled
 * row doesn't count, so its link is queued again. Two LinkedIn links to one job are the same.
 */
export function skipKnownLinks(
  links: readonly ListedLink[],
  runs: readonly KnownRun[],
  saved: readonly SavedLink[],
): { links: ListedLink[]; skipped: SkippedLine[] } {
  const listed = new Set(
    runs.filter((run) => run.status !== "failed" && run.status !== "cancelled").map((run) => keyOf(run.url)),
  );
  const applications = new Map<string | null, string>();
  for (const { id, url } of saved) if (!applications.has(keyOf(url))) applications.set(keyOf(url), id);

  const kept: ListedLink[] = [];
  const skipped: SkippedLine[] = [];
  for (const link of links) {
    const key = keyOf(link.url);
    const application = applications.get(key);
    if (key !== null && listed.has(key)) skipped.push({ line: link.line, text: link.text, reason: "Skipped: it is already in the Runs list." });
    else if (key !== null && application !== undefined) {
      skipped.push({ line: link.line, text: link.text, reason: `Skipped: it is already saved in application ${application}.` });
    } else kept.push(link);
  }
  return { links: kept, skipped };
}

/**
 * The links of the saved applications, read from their `job.md` files, which are validated
 * like every file the app reads (Art. IV.6). A file that isn't valid is returned with its
 * problems, to be shown, never skipped silently. An application without a link has none.
 */
export function savedLinks(jobFiles: readonly { id: string; source: string }[]): { saved: SavedLink[]; problems: FileError[] } {
  const saved: SavedLink[] = [];
  const problems: FileError[] = [];
  for (const { id, source } of jobFiles) {
    const job = validateMarkdownFile(jobSchema, `applications/${id}/job.md`, source);
    if (!job.ok) problems.push(job.error);
    else if (job.data.url !== undefined) saved.push({ id, url: job.data.url });
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
