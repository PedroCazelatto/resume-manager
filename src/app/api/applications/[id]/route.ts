import { isApplicationId } from "@/core/application/folder";
import { enqueueRun, readLanguage } from "@/app/run";

/** "Try again": queues a run that continues a saved application from its first missing step (F19, F42). */
export async function POST(request: Request, context: RouteContext<"/api/applications/[id]">): Promise<Response> {
  const { id } = await context.params;
  if (!isApplicationId(id)) return Response.json({ error: "Unknown application." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { language?: unknown } | null;
  const language = readLanguage(body?.language);
  if ("error" in language) return language.error;

  return enqueueRun("retry", { start: { id }, language: language.language });
}
