import { lookup } from "node:dns/promises";
import { htmlToText } from "@/core/posting/html-to-text";
import type { FetchedPosting, JobFetcher } from "@/core/posting/job-fetcher";
import { INDEED_BLOCKED, isIndeedUrl, isLinkedInUrl, rewriteLinkedInUrl } from "@/core/posting/sites";
import { PRIVATE_ADDRESS, checkPostingUrl, hostOf, isIpAddress, isPublicAddress } from "@/core/posting/url";

export type { FetchedPosting, JobFetcher };

export const FETCH_TIMEOUT_MS = 30_000;
export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 5;

// An honest name: the app doesn't pretend to be a browser (Art. V.10).
const USER_AGENT = "ResumeManager/0.1 (local resume tool; fetches a job posting its user submitted)";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** Every address a host name resolves to. */
export type ResolveHost = (hostname: string) => Promise<string[]>;

const resolveWithDns: ResolveHost = async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address);

/** A failed fetch whose message is the reason shown to the user. */
class Refused extends Error {}

/**
 * JobFetcher over plain HTTP (Art. V.10): http and https only, no loopback, private or
 * link-local address at any hop, at most 5 redirects, 30 seconds and 5 MB. Indeed is never
 * requested. Nothing of the page is logged (Art. III.4).
 */
export function createJobFetcher(fetchImpl: typeof fetch = fetch, resolve: ResolveHost = resolveWithDns): JobFetcher {
  /** Refuses a link the app must not request, by its text and by the addresses its name resolves to. */
  async function check(link: string, signal: AbortSignal): Promise<URL> {
    const checked = checkPostingUrl(link);
    if (!checked.ok) throw new Refused(checked.reason);
    // A LinkedIn link copied while logged in becomes the job's public page.
    const url = rewriteLinkedInUrl(checked.url);
    if (isIndeedUrl(url)) throw new Refused(INDEED_BLOCKED);
    const host = hostOf(url);
    if (isIpAddress(host)) return url;
    const addresses = await untilAborted(
      resolve(host).catch(() => []),
      signal,
    );
    if (addresses.length === 0) throw new Refused(`Can't find ${host}. Check the link.`);
    if (!addresses.every(isPublicAddress)) throw new Refused(PRIVATE_ADDRESS);
    return url;
  }

  async function download(link: string, signal: AbortSignal): Promise<FetchedPosting> {
    let url = await check(link, signal);
    for (let redirects = 0; ; redirects++) {
      const response = await fetchImpl(url, { redirect: "manual", signal, headers: { "User-Agent": USER_AGENT } });
      if (REDIRECTS.has(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => {});
        if (location === null) throw new Refused("The page redirects without saying where to.");
        if (redirects === MAX_REDIRECTS) throw new Refused(`The link redirects more than ${MAX_REDIRECTS} times.`);
        // Each redirect is checked like the first link.
        url = await check(new URL(location, url).href, signal);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new Refused(`The page answered ${response.status}.`);
      }
      const type = response.headers.get("content-type") ?? "";
      if (type !== "" && !/html|text\/plain/i.test(type)) {
        await response.body?.cancel().catch(() => {});
        throw new Refused("The link doesn't lead to a web page.");
      }
      const html = decode(await readLimited(response), type);
      const text = htmlToText(html, { linkedIn: isLinkedInUrl(url) });
      if (text === "") throw new Refused("The page has no readable text.");
      return { ok: true, text, url: url.href };
    }
  }

  return {
    async fetchPosting(link, signal) {
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), FETCH_TIMEOUT_MS);
      try {
        return await download(link, signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal);
      } catch (error) {
        if (signal?.aborted) return { ok: false, reason: "The run was cancelled." };
        if (timeout.signal.aborted) {
          return { ok: false, reason: `The page didn't answer within ${FETCH_TIMEOUT_MS / 1000} seconds.` };
        }
        if (error instanceof Refused) return { ok: false, reason: error.message };
        // fetch reports network failures (nothing listening, a closed connection) as a TypeError.
        return { ok: false, reason: "Can't reach the page. Check the link and your connection." };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** The promise's value, or a rejection as soon as the signal aborts: a DNS lookup can't be stopped. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    promise.then(resolve, reject);
  });
}

const TOO_LARGE = `The page is larger than ${MAX_PAGE_BYTES / 1024 / 1024} MB.`;

/** The response body, refused as soon as it passes the size limit. */
async function readLimited(response: Response): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > MAX_PAGE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Refused(TOO_LARGE);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PAGE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Refused(TOO_LARGE);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Decodes the page with the charset its Content-Type names; UTF-8 otherwise. */
function decode(bytes: Uint8Array, contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}
