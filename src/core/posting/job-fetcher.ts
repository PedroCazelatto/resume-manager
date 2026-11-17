/** The longest posting a run accepts, pasted or fetched from a link (F09, F10). */
export const MAX_POSTING_CHARS = 50_000;

/** `url` is the page the text was read from, after any rewrite and redirects. */
export type FetchedPosting = { ok: true; text: string; url: string } | { ok: false; reason: string };

/**
 * Downloads a job posting's page and extracts its readable text (Art. V.10). The
 * implementation lives in src/adapters; tests use fakes. Reasons never include page text.
 */
export interface JobFetcher {
  /** `signal` is aborted when the user cancels the run. */
  fetchPosting(url: string, signal?: AbortSignal): Promise<FetchedPosting>;
}
