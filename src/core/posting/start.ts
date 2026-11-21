import type { FetchedPosting } from "./job-fetcher";
import { readLinks, refusedMessage } from "./links";
import { INDEED_BLOCKED, isIndeedUrl } from "./sites";
import { checkPostingUrl, parseLink } from "./url";

/** A posting a run can start from: pasted, with its link when one was kept, or `fetched` from `url`. */
export type PostingStart = { posting: string; url?: string; fetched?: boolean };

/** How a new run starts: from a posting, or from a link whose posting is fetched first. */
export type NewRunStart = PostingStart | { url: string };

/**
 * What a run starts from once its link was fetched, or why it can't. The text goes on whole,
 * however long: a posting has no character limit (F47).
 */
export function fetchedStart(fetched: FetchedPosting): { start: PostingStart } | { error: string } {
  if (!fetched.ok) return { error: fetched.reason };
  return { start: { posting: fetched.text, url: fetched.url, fetched: true } };
}

/**
 * Reads what the new-application form sent (F09, F10). Pasted text wins over a link: the
 * link is then only saved with it. A link alone must be one the server may fetch.
 */
export function readNewRunStart(body: { posting?: unknown; url?: unknown } | null): { start: NewRunStart } | { error: string } {
  const posting = typeof body?.posting === "string" ? body.posting.trim() : "";
  const link = typeof body?.url === "string" ? body.url.trim() : "";
  if (posting === "" && link === "") return { error: "Give the posting's link or paste its text first." };

  if (posting !== "") {
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

/**
 * Reads a list of links sent by the "From links" tab (F33): one run per link, in the order
 * given. Nothing starts when one of them can't be fetched; the error names each such line.
 */
export function readLinkStarts(urls: unknown): { starts: { url: string }[] } | { error: string } {
  if (!Array.isArray(urls) || !urls.every((url): url is string => typeof url === "string")) {
    return { error: "The links must be a list of lines of text." };
  }
  const read = readLinks(urls);
  if (!read.ok) return { error: refusedMessage(read.refused) };
  if (read.urls.length === 0) return { error: "Give the posting's link or paste its text first." };
  return { starts: read.urls.map((url) => ({ url })) };
}
