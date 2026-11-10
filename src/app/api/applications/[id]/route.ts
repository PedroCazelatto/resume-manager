import { isApplicationId } from "@/core/application/folder";
import { readLanguage, streamRun } from "@/app/run";

/** "Try again": continues a saved application from its first missing step (F19). */
export async function POST(request: Request, context: RouteContext<"/api/applications/[id]">): Promise<Response> {
  const { id } = await context.params;
  if (!isApplicationId(id)) return Response.json({ error: "Unknown application." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { language?: unknown } | null;
  const language = readLanguage(body?.language);
  if ("error" in language) return language.error;

  return streamRun({ id }, language.language);
}
