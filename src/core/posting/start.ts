import type { FetchedPosting } from "./job-fetcher";
import { readLinks, refusedMessage } from "./links";
import { parseLink } from "./url";

/** A posting a run can start from: pasted, with its link when one was kept, or `fetched` from `url`. */
export type PostingStart = { posting: string; url?: string; fetched?: boolean };

/** Pasted text with its link: every posting has its link (F47). */
export type PastedStart = { posting: string; url: string };

/**
 * What a run starts from once its link was fetched, or why it can't. The text goes on whole,
 * however long: a posting has no character limit (F47).
 */
export function fetchedStart(fetched: FetchedPosting): { start: PostingStart } | { error: string } {
  if (!fetched.ok) return { error: fetched.reason };
  return { start: { posting: fetched.text, url: fetched.url, fetched: true } };
}

/**
 * Reads a pasted posting and its link, as the form sends them (F09, F47). The link is
 * required, since every posting has its link. A link alone is not a request: links come as a
 * list (`readLinkStarts`).
 */
export function readNewRunStart(body: { posting?: unknown; url?: unknown } | null): { start: PastedStart } | { error: string } {
  const posting = typeof body?.posting === "string" ? body.posting.trim() : "";
  const link = typeof body?.url === "string" ? body.url.trim() : "";
  if (posting === "") return { error: "Paste the posting's text first." };
  if (link === "") return { error: "Give the posting's link with its text: every posting keeps its link." };
  // The link isn't fetched here, so any http or https link can be kept.
  const kept = parseLink(link);
  return kept.ok ? { start: { posting, url: kept.url.href } } : { error: kept.reason };
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
