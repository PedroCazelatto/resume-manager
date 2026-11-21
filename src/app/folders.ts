import { randomUUID } from "node:crypto";
import { applicationFolderName } from "@/core/application/folder";
import { fetchedJobFile, newJobFile, pastedJobFile, type JobFileChange } from "@/core/application/job-file";
import type { ProfileStore } from "@/adapters/profile-store";
import type { RunFolders } from "@/app/runs";

// An application's folder and job.md are made and written before its run reaches the model
// (F50): when its link's fetch starts, when an Indeed link or pasted text is added, and when the
// posting's text is pasted. Everything goes through ProfileStore, in the run's profile only
// (Art. III.7), and every write is atomic (Art. IV.8). The UUID and the clock are made here,
// outside core (Art. V.3).

export interface ApplicationFolders extends RunFolders {
  /**
   * Makes a new application's folder and job.md for a link, with the posting's text when it is
   * already known (pasted); returns the application's ID.
   */
  create(profile: string, url: string, text?: string): Promise<string>;
  /**
   * Writes pasted text into an application's job.md. Answers the problem that kept it from being
   * written, an invalid or missing job.md named with its path (Art. IV.6), or null once written.
   */
  pasted(profile: string, id: string, text: string): Promise<string | null>;
}

/** `store` gives the profile store each time, so a test can point it at a scratch copy of the profiles. */
export function createApplicationFolders(
  store: () => ProfileStore,
  now: () => Date = () => new Date(),
  newId: () => string = randomUUID,
): ApplicationFolders {
  /** Rewrites job.md, unless it is missing or not valid: then it is left as it is and named. */
  async function changeJob(profile: string, id: string, change: (source: string, file: string) => JobFileChange) {
    const file = `applications/${id}/job.md`;
    const source = await store().readApplicationFile(profile, id, "job.md");
    if (source === null) return `${file} doesn't exist.`;
    const changed = change(source, file);
    if (!changed.ok) return `${changed.error.file} has problems: ${changed.error.problems.join("; ")}`;
    await store().replaceApplicationFile(profile, id, "job.md", changed.source);
    return null;
  }

  return {
    async create(profile, url, text) {
      const id = applicationFolderName(newId());
      const job = newJobFile(url, text === undefined ? undefined : { posting: text, at: now().toISOString() });
      await store().createApplication(profile, id, { "job.md": job });
      return id;
    },
    fetched: (profile, id, posting) => changeJob(profile, id, (source, file) => fetchedJobFile(source, file, posting, now().toISOString())),
    pasted: (profile, id, text) => changeJob(profile, id, (source, file) => pastedJobFile(source, file, text, now().toISOString())),
    async remove(profile, id) {
      await store().deleteApplication(profile, id);
    },
  };
}
