import { pasteApplication } from "@/app/run";

/**
 * The posting's text, pasted with its link (`{ posting, url }`), for an application of the
 * selected profile whose text never arrived and that has no run in memory to take it, as after a
 * restart: the text goes into its job.md and the application starts again (F26).
 */
export async function POST(request: Request, context: RouteContext<"/api/applications/[id]/posting">): Promise<Response> {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { posting?: unknown; url?: unknown } | null;
  return pasteApplication(id, body);
}
