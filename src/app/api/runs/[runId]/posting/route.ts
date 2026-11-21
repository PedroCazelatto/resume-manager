import { pasteRun } from "@/app/run";

/**
 * The posting's text, pasted with its link (`{ posting, url }`), for a run of the selected
 * profile whose fetch failed or that is an Indeed link's run: the same run joins the run queue
 * and keeps its ID (F48).
 */
export async function POST(request: Request, context: RouteContext<"/api/runs/[runId]/posting">): Promise<Response> {
  const { runId } = await context.params;
  const body = (await request.json().catch(() => null)) as { posting?: unknown; url?: unknown } | null;
  return pasteRun(runId, body);
}
