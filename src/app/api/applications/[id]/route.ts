import { isApplicationId } from "@/core/application/folder";
import { deleteApplication } from "@/app/archive";
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

/**
 * Deletes an archived application that never finished, folder and all, once the user confirmed
 * it in the home page's dialog (Art. IV.8, F26). 204; 404 for an unknown application; 409 when
 * it can't be deleted.
 */
export async function DELETE(_request: Request, context: RouteContext<"/api/applications/[id]">): Promise<Response> {
  const { id } = await context.params;
  return deleteApplication(id);
}
