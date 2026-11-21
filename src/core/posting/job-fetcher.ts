import type { JobDetails } from "../application/schemas";

/**
 * `url` is the page the text was read from, after any rewrite and redirects; `details` are the
 * job's details its HTML holds (F46).
 */
export type FetchedPosting = { ok: true; text: string; url: string; details: JobDetails } | { ok: false; reason: string };

/**
 * Downloads a job posting's page and extracts its readable text (Art. V.10). The
 * implementation lives in src/adapters; tests use fakes. Reasons never include page text.
 */
export interface JobFetcher {
  /** `signal` is aborted when the user cancels the run. */
  fetchPosting(url: string, signal?: AbortSignal): Promise<FetchedPosting>;
}
