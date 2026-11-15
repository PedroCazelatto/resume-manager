import { runRegistry, selectedProfile } from "@/app/run";

/** Takes a waiting run of the selected profile off the queue (F42). */
export async function DELETE(_request: Request, context: RouteContext<"/api/runs/[runId]">): Promise<Response> {
  const { runId } = await context.params;
  const selected = await selectedProfile();
  if ("error" in selected) return selected.error;

  const result = runRegistry().remove(selected.slug, runId);
  if (result === "unknown") return Response.json({ error: "Unknown run." }, { status: 404 });
  if (result === "not-waiting") {
    return Response.json({ error: "Only a waiting run can be removed." }, { status: 409 });
  }
  return new Response(null, { status: 204 });
}
