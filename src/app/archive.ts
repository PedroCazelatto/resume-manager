import { archivedJob, restoredJob, type JobChange } from "@/core/application/archive";
import { isApplicationId } from "@/core/application/folder";
import type { ArchiveTarget } from "@/core/runs/queue";
import { profileStore } from "@/app/profiles";
import { runRegistry, selectedProfile } from "@/app/run";

// Archiving and restoring a row (F48). An application keeps its archived state as `archived_at`
// in its job.md, written through ProfileStore, atomically, for the selected profile only
// (Art. III.7, IV.7, IV.8); a run without an application keeps it in memory. Nothing is deleted,
// so no confirmation is asked. Every answer is 204 when it worked.

const unknownRun = () => Response.json({ error: "Unknown run." }, { status: 404 });
const unknownApplication = () => Response.json({ error: "Unknown application." }, { status: 404 });
const refused = (error: string) => Response.json({ error }, { status: 409 });
const done = () => new Response(null, { status: 204 });

type JobResult = "changed" | "unchanged" | Response;

/**
 * Rewrites an application's job.md with `change`. "unchanged" when it was already as asked
 * (archived, or not archived); a response when the application is unknown or its job.md isn't
 * valid, which is named with its path and problems and left as it is (Art. IV.6).
 */
async function changeJob(slug: string, id: string, change: (source: string, file: string) => JobChange): Promise<JobResult> {
  if (!isApplicationId(id)) return unknownApplication();
  const store = profileStore();
  const source = await store.readApplicationFile(slug, id, "job.md");
  if (source === null) return unknownApplication();
  const changed = change(source, `applications/${id}/job.md`);
  if (!changed.ok) {
    if (changed.reason !== "invalid") return "unchanged";
    return refused(`${changed.error.file} has problems: ${changed.error.problems.join("; ")}`);
  }
  await store.replaceApplicationFile(slug, id, "job.md", changed.source);
  return "changed";
}

/** Writes the target's application, if it has one; a response when that didn't work. */
async function writeTarget(slug: string, target: ArchiveTarget, change: (source: string, file: string) => JobChange) {
  if (!("applicationId" in target)) return null;
  const result = await changeJob(slug, target.applicationId, change);
  return result instanceof Response ? result : null;
}

/**
 * The archive button of a run of the selected profile: its application gets `archived_at` and
 * every run of it leaves the Runs list, or the run alone does, in memory, while it has no
 * application. 404 for an unknown or another profile's run; 409 for a run that hasn't ended,
 * is archived already, or whose application still has a run waiting or running, and for an
 * application whose job.md isn't valid.
 */
export async function archiveRun(runId: string): Promise<Response> {
  const selected = await selectedProfile();
  if ("error" in selected) return selected.error;
  const registry = runRegistry();
  const target = registry.archiveTarget(selected.slug, runId);
  if (target === "unknown") return unknownRun();
  if (target === "refused") {
    return refused("Only a run that ended can be archived, and not while a run of its application is waiting or running.");
  }

  const at = new Date().toISOString();
  // An application archived from elsewhere keeps its time; its runs still leave the list.
  const failed = await writeTarget(selected.slug, target, (source, file) => archivedJob(source, file, at));
  if (failed) return failed;
  registry.archive(selected.slug, target, at);
  return done();
}

/**
 * Restores an archived run of the selected profile: its application loses `archived_at`, and the
 * run comes back to the Runs list, as cancelled when it hadn't finished. 404 for an unknown or
 * another profile's run; 409 for one that isn't archived, or whose job.md isn't valid.
 */
export async function restoreRun(runId: string): Promise<Response> {
  const selected = await selectedProfile();
  if ("error" in selected) return selected.error;
  const registry = runRegistry();
  const target = registry.restoreTarget(selected.slug, runId);
  if (target === "unknown") return unknownRun();
  if (target === "refused") return refused("This run isn't archived.");

  const failed = await writeTarget(selected.slug, target, restoredJob);
  if (failed) return failed;
  registry.restore(selected.slug, target);
  return done();
}

/**
 * Archives an application of the selected profile by its ID, with or without a run in memory:
 * `archived_at` goes into its job.md, and its runs leave the Runs list. 404 for an unknown
 * application; 409 when it is archived already, has a run waiting or running, or its job.md
 * isn't valid.
 */
export async function archiveApplication(id: string): Promise<Response> {
  const selected = await selectedProfile();
  if ("error" in selected) return selected.error;
  const registry = runRegistry();
  const target = { applicationId: id };
  if (registry.busy(selected.slug, target)) return refused("This application has a run waiting or running.");

  const at = new Date().toISOString();
  const result = await changeJob(selected.slug, id, (source, file) => archivedJob(source, file, at));
  if (result instanceof Response) return result;
  if (result === "unchanged") return refused("This application is already archived.");
  registry.archive(selected.slug, target, at);
  return done();
}

/**
 * Restores an application of the selected profile by its ID: `archived_at` leaves its job.md,
 * and its runs come back to the Runs list. 404 for an unknown application; 409 when it isn't
 * archived or its job.md isn't valid.
 */
export async function restoreApplication(id: string): Promise<Response> {
  const selected = await selectedProfile();
  if ("error" in selected) return selected.error;

  const result = await changeJob(selected.slug, id, restoredJob);
  if (result instanceof Response) return result;
  if (result === "unchanged") return refused("This application isn't archived.");
  runRegistry().restore(selected.slug, { applicationId: id });
  return done();
}
