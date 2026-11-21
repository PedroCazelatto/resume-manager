import { parseFrontmatter, stringifyFrontmatter } from "../markdown/frontmatter";
import { validateMarkdownFile, type FileError } from "../markdown/validate";
import { jobSchema } from "./schemas";

// An application keeps its archived state in its job.md, as `archived_at`, so it stays archived
// after a restart (F48). These functions only compute the new file; the app writes it through
// ProfileStore, atomically (Art. IV.8).

export type JobChange =
  | { ok: true; source: string }
  /** job.md isn't valid, so it is reported with its path and problems, never rewritten (Art. IV.6). */
  | { ok: false; reason: "invalid"; error: FileError }
  | { ok: false; reason: "archived" | "not archived" };

/** Reads job.md as the archive needs it: valid, and whether it is archived. */
function readJob(source: string, file: string): { archived: boolean } | { error: FileError } {
  const job = validateMarkdownFile(jobSchema, file, source);
  return job.ok ? { archived: job.data.archived_at !== undefined } : { error: job.error };
}

/**
 * job.md with `archived_at` set to `at`, an ISO timestamp like `fetched_at`. Every other field,
 * known to the app or not, and the body stay as they are (Art. IV.7). `file` names job.md in a
 * problem. An application that is already archived is left alone.
 */
export function archivedJob(source: string, file: string, at: string): JobChange {
  const job = readJob(source, file);
  if ("error" in job) return { ok: false, reason: "invalid", error: job.error };
  if (job.archived) return { ok: false, reason: "archived" };
  return { ok: true, source: withFields(source, (data) => ({ ...data, archived_at: at })) };
}

/** job.md without `archived_at`; everything else stays (Art. IV.7). One that isn't archived is left alone. */
export function restoredJob(source: string, file: string): JobChange {
  const job = readJob(source, file);
  if ("error" in job) return { ok: false, reason: "invalid", error: job.error };
  if (!job.archived) return { ok: false, reason: "not archived" };
  return {
    ok: true,
    source: withFields(source, (data) => Object.fromEntries(Object.entries(data).filter(([field]) => field !== "archived_at"))),
  };
}

/** Rewrites the frontmatter's fields and keeps the body. The file was validated, so it parses. */
function withFields(source: string, change: (data: Record<string, unknown>) => Record<string, unknown>): string {
  const parsed = parseFrontmatter(source);
  if (!parsed.ok) throw new Error(parsed.problem);
  return stringifyFrontmatter(change(parsed.data), parsed.body);
}
