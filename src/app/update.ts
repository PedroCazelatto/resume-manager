import { randomUUID } from "node:crypto";
import { applicationFolderName } from "@/core/application/folder";
import { planUpdate, type UpdatePlan } from "@/core/application/update";
import { profileStore } from "@/app/profiles";
import { runRegistry } from "@/app/run";

// The one-time update of the applications saved before F50 (Art. IV.8). The home page shows
// what it will do; nothing changes until the user confirms. Everything goes through
// ProfileStore, in the selected profile only (Art. III.7): job.md is replaced atomically, and a
// folder is renamed in one `rename` (Art. IV.8). The new UUIDs are made here, outside core.

/** What the user was shown and confirmed: the folder names in each list. */
export interface ShownUpdate {
  rewrite: string[];
  rename: string[];
  delete: string[];
}

/** What the update will do to the profile's applications. */
export async function readUpdate(slug: string): Promise<UpdatePlan> {
  const store = profileStore();
  const ids = await store.listApplications(slug);
  return planUpdate(await Promise.all(ids.map(async (id) => ({ id, job: await store.readApplicationFile(slug, id, "job.md") }))));
}

/** The lists of a plan as the page shows them: folder names only. */
export function shownUpdate(plan: UpdatePlan): ShownUpdate {
  return { rewrite: plan.rewrite.map(({ id }) => id), rename: plan.rename, delete: plan.delete };
}

/** Whether a request names the same folders as the update would touch now. */
function sameUpdate(shown: ShownUpdate, now: ShownUpdate): boolean {
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
  return same(shown.rewrite, now.rewrite) && same(shown.rename, now.rename) && same(shown.delete, now.delete);
}

/**
 * Updates the profile's old applications once the user confirmed what the page showed
 * (Art. IV.8, F50): the ones without a link are deleted, folder and all; each old job.md is
 * rewritten to the new fields; each old folder is renamed to a new random UUID, with
 * everything inside it. The runs in memory follow the new names. Refused, with nothing changed,
 * when the applications changed since they were shown, or when one of them has a run fetching,
 * waiting or running. An application whose job.md is missing or not valid is left as it is.
 */
export async function applyUpdate(slug: string, shown: ShownUpdate): Promise<{ ok: true } | { ok: false; problems: string[] }> {
  const plan = await readUpdate(slug);
  if (!sameUpdate(shown, shownUpdate(plan))) {
    return { ok: false, problems: ["The applications changed since the update was shown. Look at it again, then confirm."] };
  }
  const registry = runRegistry();
  const touched = new Set([...plan.delete, ...plan.rewrite.map(({ id }) => id), ...plan.rename]);
  if ([...touched].some((id) => registry.busy(slug, { applicationId: id }))) {
    return { ok: false, problems: ["An application to update has a run waiting or running. Confirm the update once it has ended."] };
  }

  const store = profileStore();
  for (const id of plan.delete) {
    await store.deleteApplication(slug, id);
    registry.forget(slug, id);
  }
  for (const { id, job } of plan.rewrite) await store.replaceApplicationFile(slug, id, "job.md", job);
  for (const id of plan.rename) {
    const to = applicationFolderName(randomUUID());
    await store.renameApplication(slug, id, to);
    registry.renamed(slug, id, to);
  }
  return { ok: true };
}
