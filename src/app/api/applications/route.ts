import { readLinkStarts, readNewRunStart } from "@/core/posting/start";
import { enqueueRun, enqueueRuns, readLanguage } from "@/app/run";

/**
 * Queues a run from a pasted posting, or from a link whose posting is fetched first, and answers its `runId`
 * (F09, F10, F12–F17, F24, F25, F42). A list of links (`urls`) queues one run per link and answers their
 * `runIds`, or queues nothing when one of them can't be fetched (F33).
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    posting?: unknown;
    url?: unknown;
    urls?: unknown;
    language?: unknown;
    replaces?: unknown;
  } | null;
  const language = readLanguage(body?.language);

  if (body?.urls !== undefined) {
    const links = readLinkStarts(body.urls);
    if ("error" in links) return Response.json({ error: links.error }, { status: 400 });
    if ("error" in language) return language.error;
    // The chosen language applies to every link.
    return enqueueRuns(links.starts.map((start) => ({ start, language: language.language })));
  }

  const read = readNewRunStart(body);
  if ("error" in read) return Response.json({ error: read.error }, { status: 400 });
  if ("error" in language) return language.error;

  // Pasted text can stand for a run whose fetch failed; a link can't.
  const replaces = "posting" in read.start && typeof body?.replaces === "string" ? body.replaces : undefined;
  return enqueueRun("new", { start: read.start, language: language.language }, replaces);
}
