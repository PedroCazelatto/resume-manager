import { hostOf } from "./url";

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

export function isLinkedInUrl(url: URL): boolean {
  return onSite(url, "linkedin.com");
}

/**
 * LinkedIn links copied while logged in (`/jobs/collections/…?currentJobId=<id>`,
 * `/jobs/search/?currentJobId=<id>`) show the job in a panel only a logged-in browser gets.
 * Returns the job's public page instead; any other link is returned as it is.
 */
export function rewriteLinkedInUrl(url: URL): URL {
  if (!isLinkedInUrl(url) || !url.pathname.startsWith("/jobs/")) return url;
  const id = url.searchParams.get("currentJobId");
  if (id === null || !/^\d+$/.test(id)) return url;
  return new URL(`https://www.linkedin.com/jobs/view/${id}`);
}
