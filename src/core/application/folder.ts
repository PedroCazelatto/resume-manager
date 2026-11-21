// Application folders are named by a random lowercase UUID, so an application can exist before
// its title and company are known (Art. IV.3–4, F50). Folders saved before that are named
// <YYYY-MM-DD>-<company>-<role>; they still list and open until the user confirms their update.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATED = /^\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)+$/;

/**
 * A new application's folder name: the random UUID, made outside core and handed in (Art. V.3),
 * in lowercase (Art. IV.4, F50).
 */
export function applicationFolderName(uuid: string): string {
  const id = uuid.toLowerCase();
  if (!UUID.test(id)) throw new Error("An application's folder is named by a UUID");
  return id;
}

/** A folder named by a lowercase UUID, as every new application's is (F50). */
export function isUuidApplicationId(id: string): boolean {
  return UUID.test(id);
}

/** A folder named <YYYY-MM-DD>-<company>-<role>, as the applications saved before F50 are. */
export function isDatedApplicationId(id: string): boolean {
  return DATED.test(id);
}

/**
 * Application IDs come from URLs and requests, so check them before building any path: a UUID,
 * or an older dated name until the user confirms its update; never `..`, a slash or anything else.
 */
export function isApplicationId(id: string): boolean {
  return isUuidApplicationId(id) || isDatedApplicationId(id);
}

/** The files a run writes in its application folder (Art. IV.3). */
export const APPLICATION_FILES = ["job.md", "analysis.md", "resume.md", "verification.md"] as const;
export type ApplicationFile = (typeof APPLICATION_FILES)[number];
