import { readLanguage, streamRun } from "@/app/run";

const MAX_POSTING_CHARS = 50_000;

/** Starts a run from a pasted posting and streams its progress (F09, F12–F17, F24, F25, F30). */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { posting?: unknown; language?: unknown } | null;
  const posting = typeof body?.posting === "string" ? body.posting.trim() : "";
  if (posting === "") return Response.json({ error: "Paste the job posting first." }, { status: 400 });
  if (posting.length > MAX_POSTING_CHARS) {
    return Response.json({ error: `The posting is longer than ${MAX_POSTING_CHARS} characters.` }, { status: 400 });
  }
  const language = readLanguage(body?.language);
  if ("error" in language) return language.error;

  return streamRun({ posting }, language.language);
}
