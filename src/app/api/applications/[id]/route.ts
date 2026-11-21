import { isApplicationId } from "@/core/application/folder";
import { retryApplication } from "@/app/run";

/**
 * "Try again": queues a run that continues a saved application from its first missing step
 * (F19, F42), or fetches its link again while its posting's text never arrived (F50).
 */
export async function POST(_request: Request, context: RouteContext<"/api/applications/[id]">): Promise<Response> {
  const { id } = await context.params;
  if (!isApplicationId(id)) return Response.json({ error: "Unknown application." }, { status: 404 });

  return retryApplication(id);
}
