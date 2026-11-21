import { parseFrontmatter, stringifyFrontmatter } from "../markdown/frontmatter";
import { validateMarkdownFile, type FileError } from "../markdown/validate";
import { platformName } from "../posting/sites";
import { isDatedApplicationId } from "./folder";
import { jobSchema } from "./schemas";

// Applications saved before F50 are updated once, after the user confirms it in the app
// (Art. IV.8, F50): each old job.md is rewritten to the new fields (F46), each application
// without a link is deleted, and each folder named <YYYY-MM-DD>-<company>-<role> is renamed to
// a new random UUID. These functions only list what the update will do and compute each new
// job.md; the app deletes, rewrites and renames through ProfileStore, in the selected profile
// only (Art. III.7).

/** A saved application as the update reads it: its folder name and its job.md, null when it has none. */
export interface SavedApplication {
  id: string;
  job: string | null;
}

/** What the update will do, application by application, each list sorted by folder name. */
export interface UpdatePlan {
  /** job.md rewritten to the new fields, with its new content. */
  rewrite: { id: string; job: string }[];
  /** Folders renamed to a new random UUID, with everything inside them. */
  rename: string[];
  /** Applications deleted, folder and all: their job.md has no link (made from pasted text). */
  delete: string[];
  /** Old applications left as they are until their job.md is fixed: missing or not valid (Art. IV.6). */
  problems: FileError[];
}

/** Whether the update has anything to do or show. */
export function updateNeeded(plan: UpdatePlan): boolean {
  return plan.rewrite.length + plan.rename.length + plan.delete.length + plan.problems.length > 0;
}

/**
 * job.md with the new fields, or null when it has them already: `role` becomes `title` (unless
 * the file has a `title`), and a `source` of `url` or `paste` becomes the platform named from
 * its `url` (F46). Every other field keeps its value and place, and the body stays as it is
 * (Art. IV.7). `source` must be a valid job.md with a link.
 */
export function updatedJob(source: string): string | null {
  const parsed = parseFrontmatter(source);
  if (!parsed.ok) throw new Error(parsed.problem);
  const { data } = parsed;
  const renamesRole = data.role !== undefined && data.title === undefined;
  const namesSource = (data.source === "url" || data.source === "paste") && typeof data.url === "string";
  if (!renamesRole && !namesSource) return null;
  const fields = Object.entries(data).map(([field, value]): [string, unknown] => {
    if (field === "role" && renamesRole) return ["title", value];
    if (field === "source" && namesSource) return ["source", platformName(new URL(data.url as string))];
    return [field, value];
  });
  return stringifyFrontmatter(Object.fromEntries(fields), parsed.body);
}

/**
 * Lists what the update will do to the profile's applications. An application needs it when its
 * folder has an old dated name, or its job.md has the old fields or no link. One without a link
 * is deleted; any other has its job.md rewritten when its fields are old, and its folder renamed
 * when its name is. An old folder whose job.md is missing or not valid is named with its
 * problems and left alone, never "fixed" (Art. IV.6).
 */
export function planUpdate(applications: readonly SavedApplication[]): UpdatePlan {
  const plan: UpdatePlan = { rewrite: [], rename: [], delete: [], problems: [] };
  for (const { id, job } of [...applications].sort((a, b) => a.id.localeCompare(b.id))) {
    const dated = isDatedApplicationId(id);
    const file = `applications/${id}/job.md`;
    if (job === null) {
      if (dated) plan.problems.push({ file, problems: ["the file doesn't exist"] });
      continue;
    }
    const valid = validateMarkdownFile(jobSchema, file, job);
    if (!valid.ok) {
      if (dated) plan.problems.push(valid.error);
      continue;
    }
    if (valid.data.url === undefined) {
      plan.delete.push(id);
      continue;
    }
    const rewritten = updatedJob(job);
    if (rewritten !== null) plan.rewrite.push({ id, job: rewritten });
    if (dated) plan.rename.push(id);
  }
  return plan;
}
