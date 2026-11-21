import type { JobDetails } from "../application/schemas";
import type { FetchedPosting } from "./job-fetcher";
import { readLinks, refusedMessage, type ListedLink } from "./links";
import { parseLink } from "./url";

/**
 * A posting a run can start from: its text and its link, pasted, or fetched from the link with
 * the details read from its page (F10, F46).
 */
export type PostingStart = { posting: string; url: string; details?: JobDetails };

/** Pasted text with its link: every posting has its link (F47). */
export type PastedStart = { posting: string; url: string };

/**
 * What a run starts from once its link was fetched, or why it can't. The text goes on whole,
 * however long: a posting has no character limit (F47).
 */
export function fetchedStart(fetched: FetchedPosting): { start: PostingStart } | { error: string } {
  if (!fetched.ok) return { error: fetched.reason };
  return { start: { posting: fetched.text, url: fetched.url, details: fetched.details } };
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
 * Reads a list of links sent by the "From links" tab (F33): the links to start a run for, in
 * the order given, each with its line, so a skipped one can be named (F47). Nothing starts
 * when one of them can't be fetched; the error names each such line.
 */
export function readLinkStarts(urls: unknown): { links: ListedLink[] } | { error: string } {
  if (!Array.isArray(urls) || !urls.every((url): url is string => typeof url === "string")) {
    return { error: "The links must be a list of lines of text." };
  }
  const read = readLinks(urls);
  if (!read.ok) return { error: refusedMessage(read.refused) };
  if (read.links.length === 0) return { error: "Give the posting's link or paste its text first." };
  return { links: read.links };
}
