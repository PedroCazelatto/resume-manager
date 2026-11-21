import { hostOf, parseLink } from "./url";

// What the app knows about the two job sites that must work (F10).

function onSite(url: URL, site: string): boolean {
  const host = hostOf(url);
  return host === site || host.endsWith(`.${site}`);
}

export const INDEED_BLOCKED = "Indeed blocks automated requests. Paste the posting's text instead.";

/** A link to indeed.com or one of its country subdomains; the server never fetches these. */
export function isIndeedUrl(url: URL): boolean {
  return onSite(url, "indeed.com");
}

/** `isIndeedUrl` for a link as text; text that isn't an http or https link isn't one. */
export function isIndeedLink(link: string): boolean {
  const parsed = parseLink(link);
  return parsed.ok && isIndeedUrl(parsed.url);
}

export function isLinkedInUrl(url: URL): boolean {
  return onSite(url, "linkedin.com");
}

/** The job a LinkedIn jobs link shows in its panel (`/jobs/…?currentJobId=<id>`), or null. */
function currentJobId(url: URL): string | null {
  if (!isLinkedInUrl(url) || !url.pathname.startsWith("/jobs/")) return null;
  const id = url.searchParams.get("currentJobId");
  return id !== null && /^\d+$/.test(id) ? id : null;
}

/**
 * LinkedIn links copied while logged in (`/jobs/collections/…?currentJobId=<id>`,
 * `/jobs/search/?currentJobId=<id>`) show the job in a panel only a logged-in browser gets.
 * Returns the job's public page instead; any other link is returned as it is.
 */
export function rewriteLinkedInUrl(url: URL): URL {
  const id = currentJobId(url);
  return id === null ? url : new URL(`https://www.linkedin.com/jobs/view/${id}`);
}

/**
 * The LinkedIn job a link names, or null: `/jobs/…?currentJobId=<id>`, `/jobs/view/<id>` and
 * `/jobs/view/<words>-<id>` all name job `<id>` (F47).
 */
export function linkedInJobId(url: URL): string | null {
  const current = currentJobId(url);
  if (current !== null) return current;
  if (!isLinkedInUrl(url)) return null;
  return /^\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/.exec(url.pathname)?.[1] ?? null;
}

/**
 * What two links of the same job have in common: the LinkedIn job ID for a LinkedIn job,
 * otherwise the address itself, so `https://Jobs.Example.com` and `https://jobs.example.com/`
 * are the same link (F33, F47).
 */
export function jobKey(url: URL): string {
  const id = linkedInJobId(url);
  return id === null ? url.href : `linkedin-job:${id}`;
}
