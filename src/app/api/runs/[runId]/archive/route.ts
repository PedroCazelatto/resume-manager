import { archiveRun, restoreRun } from "@/app/archive";

/**
 * The archive button of a run of the selected profile: a cancelled, failed or finished run, with
 * its application if it has one, leaves the Runs list; nothing is deleted (F48).
 */
export async function POST(_request: Request, context: RouteContext<"/api/runs/[runId]/archive">): Promise<Response> {
  const { runId } = await context.params;
  return archiveRun(runId);
}

/** Restores an archived run of the selected profile, with its application if it has one (F48). */
export async function DELETE(_request: Request, context: RouteContext<"/api/runs/[runId]/archive">): Promise<Response> {
  const { runId } = await context.params;
  return restoreRun(runId);
}
