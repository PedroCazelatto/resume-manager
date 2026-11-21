import { parseFrontmatter, stringifyFrontmatter } from "../markdown/frontmatter";
import { validateMarkdownFile, type FileError } from "../markdown/validate";
import { platformName } from "../posting/sites";
import { jobSchema, type JobDetails } from "./schemas";

// job.md is written as soon as an application's folder is made, holding the posting's link and
// its platform. The posting's text, when it arrived (`fetched_at`) and the details read from its
// page are written once they are known (Art. IV.5, F50). These functions only compute the file;
// the app writes it through ProfileStore, atomically (Art. IV.8).

export type JobFileChange = { ok: true; source: string } | { ok: false; error: FileError };

/** Whether job.md's body holds the posting's text yet (F50). */
export function hasPostingText(body: string): boolean {
  return body.trim() !== "";
}

/**
 * A new application's job.md: its link and the platform named from it (F46). A posting whose
 * text is already known (pasted) has it as the body, with `fetched_at` saying when it arrived.
 */
export function newJobFile(url: string, text?: { posting: string; at: string }): string {
  const fields = { url, source: platformName(new URL(url)) };
  return text ? stringifyFrontmatter({ ...fields, fetched_at: text.at }, `${text.posting}\n`) : stringifyFrontmatter(fields);
}

/**
 * job.md once its link's posting was fetched: `url` is the address the text was read from
 * (after the LinkedIn rewrite and any redirects, F47), `source` the platform named from it,
 * the details the page holds are kept as it gives them (Art. VI.2), `fetched_at` is `at`, and the
 * text is the body. Every other field stays (Art. IV.7). `file` names job.md in a problem.
 */
export function fetchedJobFile(
  source: string,
  file: string,
  posting: { posting: string; url: string; details?: JobDetails },
  at: string,
): JobFileChange {
  const page = Object.fromEntries(Object.entries(posting.details ?? {}).filter(([, value]) => value !== undefined));
  return rewrite(source, file, posting.posting, (data) => ({
    ...data,
    url: posting.url,
    source: platformName(new URL(posting.url)),
    ...page,
    fetched_at: at,
  }));
}

/**
 * job.md with the posting's pasted text as its body and `fetched_at` set to `at`. Every other
 * field, its link included, stays as it is (Art. IV.7).
 */
export function pastedJobFile(source: string, file: string, posting: string, at: string): JobFileChange {
  return rewrite(source, file, posting, (data) => ({ ...data, fetched_at: at }));
}

/** Rewrites a valid job.md's fields and body; one that isn't valid is reported, never rewritten (Art. IV.6). */
function rewrite(
  source: string,
  file: string,
  posting: string,
  change: (data: Record<string, unknown>) => Record<string, unknown>,
): JobFileChange {
  const job = validateMarkdownFile(jobSchema, file, source);
  if (!job.ok) return { ok: false, error: job.error };
  const parsed = parseFrontmatter(source);
  if (!parsed.ok) throw new Error(parsed.problem);
  return { ok: true, source: stringifyFrontmatter(change(parsed.data), `${posting}\n`) };
}
