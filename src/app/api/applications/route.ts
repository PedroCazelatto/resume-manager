import { readNewRunStart } from "@/core/posting/start";
import { enqueueRun, readLanguage } from "@/app/run";

/**
 * Queues a run from a pasted posting or from a link to one, and answers its `runId`
 * (F09, F10, F12–F17, F24, F25, F42).
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { posting?: unknown; url?: unknown; language?: unknown } | null;
  const read = readNewRunStart(body);
  if ("error" in read) return Response.json({ error: read.error }, { status: 400 });
  const language = readLanguage(body?.language);
  if ("error" in language) return language.error;

  return enqueueRun("new", { start: read.start, language: language.language });
}
