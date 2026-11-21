import { isApplicationId } from "@/core/application/folder";
import { enqueueRun } from "@/app/run";

/** "Verify again": queues a run of both checks on the saved resume (Art. II.5, F15, F17, F42). */
export async function POST(
  _request: Request,
  context: RouteContext<"/api/applications/[id]/verification">,
): Promise<Response> {
  const { id } = await context.params;
  if (!isApplicationId(id)) return Response.json({ error: "Unknown application." }, { status: 404 });

  return enqueueRun("verify", { start: { id } });
}
