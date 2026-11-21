import { platformName } from "../posting/sites";
import type { Job, JobDetails } from "./schemas";

// Reading job.md's details (F46). A file written before F46 is still read until
// application-uuids rewrites it: its title is `role`, and its `source` says how the text
// arrived (`url` or `paste`) instead of naming the platform.

/** What a run tells about its job once its application is saved, for the Runs list and the notifications (F38, F46). */
export interface JobSummary {
  title?: string;
  company?: string;
  /** The company's website, an http or https address. */
  companyUrl?: string;
  /** The job platform. */
  source?: string;
}

/** The job's title; an older file calls it `role`. */
export function jobTitle(job: Job): string | undefined {
  return job.title ?? job.role;
}

/** The job platform; an older file's is named from its link, and one without a link has none. */
export function jobPlatform(job: Job): string | undefined {
  if (job.source !== "url" && job.source !== "paste") return job.source;
  return job.url === undefined ? undefined : platformName(new URL(job.url));
}

/** Only the values that are known. */
function known<T extends object>(values: T): T {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as T;
}

/** The job's details, as the prompts carry them (F46). */
export function jobDetails(job: Job): JobDetails {
  return known({
    title: jobTitle(job),
    company: job.company,
    company_url: job.company_url,
    location: job.location,
    salary: job.salary,
    work_model: job.work_model,
    hours: job.hours,
  });
}

/** What the Runs list shows of the details read from a posting's page, before its analysis is saved (F46). */
export function detailsSummary(details: JobDetails): JobSummary {
  return known({ title: details.title, company: details.company, companyUrl: details.company_url });
}

/** What the run tells about the job once its application is saved. */
export function jobSummary(job: Job): JobSummary {
  return known({ ...detailsSummary(jobDetails(job)), source: jobPlatform(job) });
}
