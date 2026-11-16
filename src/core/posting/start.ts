import { MAX_POSTING_CHARS } from "./job-fetcher";
import { INDEED_BLOCKED, isIndeedUrl } from "./sites";
import { checkPostingUrl, parseLink } from "./url";

/** How a new run starts: from pasted text, with its link when one was kept, or from a link to fetch. */
export type NewRunStart = { posting: string; url?: string } | { url: string };

/**
 * Reads what the new-application form sent (F09, F10). Pasted text wins over a link: the
 * link is then only saved with it. A link alone must be one the server may fetch.
 */
export function readNewRunStart(body: { posting?: unknown; url?: unknown } | null): { start: NewRunStart } | { error: string } {
  const posting = typeof body?.posting === "string" ? body.posting.trim() : "";
  const link = typeof body?.url === "string" ? body.url.trim() : "";
  if (posting === "" && link === "") return { error: "Give the posting's link or paste its text first." };

  if (posting !== "") {
    if (posting.length > MAX_POSTING_CHARS) return { error: `The posting is longer than ${MAX_POSTING_CHARS} characters.` };
    if (link === "") return { start: { posting } };
    // The link isn't fetched here, so any http or https link can be kept.
    const kept = parseLink(link);
    return kept.ok ? { start: { posting, url: kept.url.href } } : { error: kept.reason };
  }

  const checked = checkPostingUrl(link);
  if (!checked.ok) return { error: checked.reason };
  if (isIndeedUrl(checked.url)) return { error: INDEED_BLOCKED };
  return { start: { url: checked.url.href } };
}
