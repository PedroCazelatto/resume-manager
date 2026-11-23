import { retryRun, runRegistry, selectedProfile } from "@/app/run";

/**
 * Stops a run of the selected profile (F48): a link in the fetch queue leaves it and the list,
 * and a waiting run is cancelled, both at once (204), as is an Indeed link's run that needs its
 * text (F26); the running one is cancelled and ends once its model call has stopped (202, F32).
 */
export async function DELETE(_request: Request, context: RouteContext<"/api/runs/[runId]">): Promise<Response> {
  const { runId } = await context.params;
  const selected = await selectedProfile();
  if ("error" in selected) return selected.error;

  const result = runRegistry().remove(selected.slug, runId);
  if (result === "unknown") return Response.json({ error: "Unknown run." }, { status: 404 });
  if (result === "ended") return Response.json({ error: "This run has already ended." }, { status: 409 });
  // The running run's stream says when it has stopped.
  return new Response(null, { status: result === "cancelling" ? 202 : 204 });
}

/**
 * "Try again" for a run of the selected profile that failed or was cancelled before its
 * application was saved: queues a new run with the same posting (F19).
 */
export async function POST(_request: Request, context: RouteContext<"/api/runs/[runId]">): Promise<Response> {
  const { runId } = await context.params;
  return retryRun(runId);
}
