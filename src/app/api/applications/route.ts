import { readLinkStarts, readNewRunStart } from "@/core/posting/start";
import { enqueueLinks, enqueueRun } from "@/app/run";

/**
 * Queues the runs of a list of links (`urls`) and answers their `runIds`, with the links skipped
 * because the profile already has them (F47), or queues nothing when one of them can't be
 * fetched (F33). Pasted text (`posting`) comes with its link (`url`) and queues one run,
 * answering its `runId` (F09, F10, F42). A link alone is refused (F47). Text pasted for a run
 * whose fetch failed goes to that run instead: `POST /api/runs/[runId]/posting` (F48).
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    posting?: unknown;
    url?: unknown;
    urls?: unknown;
  } | null;

  if (body?.urls !== undefined) {
    const links = readLinkStarts(body.urls);
    if ("error" in links) return Response.json({ error: links.error }, { status: 400 });
    return enqueueLinks(links.links);
  }

  const read = readNewRunStart(body);
  if ("error" in read) return Response.json({ error: read.error }, { status: 400 });

  return enqueueRun("new", { start: read.start });
}
