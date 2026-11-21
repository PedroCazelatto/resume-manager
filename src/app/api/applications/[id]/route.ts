import { isApplicationId } from "@/core/application/folder";
import { enqueueRun } from "@/app/run";

/** "Try again": queues a run that continues a saved application from its first missing step (F19, F42). */
export async function POST(_request: Request, context: RouteContext<"/api/applications/[id]">): Promise<Response> {
  const { id } = await context.params;
  if (!isApplicationId(id)) return Response.json({ error: "Unknown application." }, { status: 404 });

  return enqueueRun("retry", { start: { id } });
}
