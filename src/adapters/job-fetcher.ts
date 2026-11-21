import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
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

/** One GET request, made to addresses the fetcher has already checked. */
export interface PageRequest {
  url: URL;
  /** The checked addresses of the URL's host: the connection goes to one of them, and the name is never resolved again. */
  addresses: string[];
  headers: Record<string, string>;
  /** Aborted by the timeout or by the user cancelling; it also stops reading the body. */
  signal: AbortSignal;
}

/** What the fetcher reads of an answer. */
export interface PageResponse {
  status: number;
  /** A header's value by its lowercase name, or null. */
  header(name: string): string | null;
  /** The body, chunk by chunk. */
  body: AsyncIterable<Uint8Array>;
  /** Drops the answer without reading the rest of its body. */
  discard(): void;
}

/** Sends one request; rejects when the page can't be reached. Tests pass a fake, so no test opens a socket (Art. IX.2). */
export type SendRequest = (request: PageRequest) => Promise<PageResponse>;

/**
 * A `lookup` for one connection that answers with addresses already checked, so the request
 * connects to one of them and never resolves the name a second time.
 */
export function checkedLookup(addresses: readonly string[]): LookupFunction {
  const entries = addresses.map((address) => ({ address, family: isIP(address) }));
  return (hostname, options, callback) => {
    const family = options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : (options.family ?? 0);
    const usable = family === 0 ? entries : entries.filter((entry) => entry.family === family);
    if (usable.length === 0) {
      const error: NodeJS.ErrnoException = new Error(`No checked IPv${family} address for ${hostname}`);
      error.code = "ENOTFOUND";
      callback(error, "", undefined);
    } else if (options.all) callback(null, usable);
    else callback(null, usable[0].address, usable[0].family);
  };
}

/**
 * Sends the request with `node:http` or `node:https`, on a connection of its own to one of
 * the checked addresses. HTTPS still checks the certificate against the link's host name.
 */
const sendWithNode: SendRequest = ({ url, addresses, headers, signal }) =>
  new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = send(
      url,
      // No pooled socket, which could have been opened for another address.
      { headers, signal, agent: false, lookup: checkedLookup(addresses) },
      (response) => resolve(fromNode(response, signal)),
    );
    request.on("error", reject);
    request.end();
  });

function fromNode(response: IncomingMessage, signal: AbortSignal): PageResponse {
  // A timeout or a cancel after the answer has begun stops reading its body too.
  const stop = () => response.destroy(new Error("aborted"));
  signal.addEventListener("abort", stop, { once: true });
  response.once("close", () => signal.removeEventListener("abort", stop));
  // Errors reach the fetcher through the body it reads; one on a body it dropped is of no use.
  response.on("error", () => {});
  return {
    status: response.statusCode ?? 0,
    header(name) {
      const value = response.headers[name];
      if (value === undefined) return null;
      return Array.isArray(value) ? value.join(", ") : value;
    },
    body: response,
    discard: () => response.destroy(),
  };
}

/** A failed fetch whose message is the reason shown to the user. */
class Refused extends Error {}

/**
 * JobFetcher over plain HTTP (Art. V.10): http and https only, no loopback, private or
 * link-local address at any hop, at most 5 redirects, 30 seconds and 5 MB. Each hop's name
 * is resolved once, and the request connects to an address that was checked. Indeed is never
 * requested. Nothing of the page is logged (Art. III.4).
 */
export function createJobFetcher(send: SendRequest = sendWithNode, resolve: ResolveHost = resolveWithDns): JobFetcher {
  /**
   * Refuses a link the app must not request, by its text and by the addresses its name
   * resolves to, and returns the addresses to connect to.
   */
  async function check(link: string, signal: AbortSignal): Promise<{ url: URL; addresses: string[] }> {
    const checked = checkPostingUrl(link);
    if (!checked.ok) throw new Refused(checked.reason);
    // A LinkedIn link copied while logged in becomes the job's public page.
    const url = rewriteLinkedInUrl(checked.url);
    if (isIndeedUrl(url)) throw new Refused(INDEED_BLOCKED);
    const host = hostOf(url);
    if (isIpAddress(host)) return { url, addresses: [host] };
    const addresses = await untilAborted(
      resolve(host).catch(() => []),
      signal,
    );
    if (addresses.length === 0) throw new Refused(`Can't find ${host}. Check the link.`);
    if (!addresses.every(isPublicAddress)) throw new Refused(PRIVATE_ADDRESS);
    return { url, addresses };
  }

  async function download(link: string, signal: AbortSignal): Promise<FetchedPosting> {
    let { url, addresses } = await check(link, signal);
    for (let redirects = 0; ; redirects++) {
      const response = await send({ url, addresses, signal, headers: { "User-Agent": USER_AGENT } });
      if (REDIRECTS.has(response.status)) {
        const location = response.header("location");
        response.discard();
        if (location === null) throw new Refused("The page redirects without saying where to.");
        if (redirects === MAX_REDIRECTS) throw new Refused(`The link redirects more than ${MAX_REDIRECTS} times.`);
        // Each redirect is checked like the first link, with a lookup of its own.
        ({ url, addresses } = await check(new URL(location, url).href, signal));
        continue;
      }
      if (response.status < 200 || response.status > 299) {
        response.discard();
        throw new Refused(`The page answered ${response.status}.`);
      }
      const type = response.header("content-type") ?? "";
      if (type !== "" && !/html|text\/plain/i.test(type)) {
        response.discard();
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
        // A failed connection: nothing listening, a closed connection, a certificate that doesn't match the name.
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
async function readLimited(response: PageResponse): Promise<Uint8Array> {
  if (Number(response.header("content-length")) > MAX_PAGE_BYTES) {
    response.discard();
    throw new Refused(TOO_LARGE);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_PAGE_BYTES) {
      // Leaving the loop stops the body; discarding drops the connection.
      response.discard();
      throw new Refused(TOO_LARGE);
    }
    chunks.push(chunk);
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
