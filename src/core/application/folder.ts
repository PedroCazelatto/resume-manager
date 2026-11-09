// Application folders are named <YYYY-MM-DD>-<company>-<role> (Art. IV.3–4).

const MAX_PART_LENGTH = 60;

/** Lowercase ASCII kebab-case, accents removed, e.g. "São Paulo Café" → "sao-paulo-cafe". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_PART_LENGTH)
    .replace(/-+$/, "");
}

/** Base folder name for a run. The store adds `-2`, `-3`… when it already exists (F25). */
export function applicationFolderName(date: string, company: string, role: string): string {
  return [date, slugify(company) || "company", slugify(role) || "role"].join("-");
}

export function withCollisionSuffix(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}-${attempt}`;
}

/** Application IDs come from URLs, so check them before building any path. */
export function isApplicationId(id: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)+$/.test(id);
}
