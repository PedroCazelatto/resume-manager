import type { z } from "zod";
import { validateMarkdownFile, type FileError } from "../markdown/validate";
import { isIndeedLink } from "../posting/sites";
import { printBlockers } from "../resume/print";
import { resumeFileSchema, type ResumeFile } from "../resume/schema";
import { verificationSchema } from "../verification/schema";
import { APPLICATION_FILES, generationFinished, type ApplicationFile } from "./folder";
import { jobSummary } from "./job";
import { hasPostingText } from "./job-file";
import { analysisSchema, jobSchema } from "./schemas";

// What the home page's table needs to know about one saved application, read from its files
// (F26). Every file is validated as it is read (Art. IV.6): an invalid one is named with its path
// and problems, and the row says "has problems" instead of breaking the page.

/** One application of the profile, as its files tell it. */
export interface ApplicationSummary {
  /** The folder's name, which is the application's ID (F50). */
  id: string;
  /** The job's details from job.md (F46). */
  title?: string;
  company?: string;
  /** The company's website, an http or https address. */
  companyUrl?: string;
  /** The job platform. */
  source?: string;
  /** The posting's link. */
  url?: string;
  /** job.md's `fetched_at`: when the posting's text arrived, the application's date (F50). */
  date?: string;
  /** job.md's `archived_at`, while the application is archived (F48). */
  archivedAt?: string;
  /** job.md holds the posting's text. */
  hasText: boolean;
  /** The posting's link is an Indeed link, which the server never requests (F47). */
  indeed: boolean;
  /** resume.md and verification.md both exist: its generation finished (F50). */
  finished: boolean;
  /** resume.md's status, once it is there and valid (F24). */
  resumeStatus?: ResumeFile["status"];
  /**
   * Why the resume can't be printed yet, empty once it can (Art. VI.7); only for a finished
   * application whose resume.md and verification.md are valid.
   */
  printBlockers?: string[];
  /** The application's files that aren't valid, or job.md when it is missing (Art. IV.6). */
  problems: FileError[];
}

/** An application's files as read: each file's text, or null (or left out) when it doesn't exist. */
export type ApplicationSources = Partial<Record<ApplicationFile, string | null>>;

/**
 * Reads one application's files into what its row shows. Null for a folder that holds none of
 * them: one being made at this moment, or deleted.
 */
export function summarizeApplication(id: string, files: ApplicationSources): ApplicationSummary | null {
  const present = APPLICATION_FILES.filter((file) => typeof files[file] === "string");
  if (present.length === 0) return null;

  const problems: FileError[] = [];
  function read<T>(schema: z.ZodType<T>, file: ApplicationFile) {
    const source = files[file];
    if (typeof source !== "string") return null;
    const validated = validateMarkdownFile(schema, `applications/${id}/${file}`, source);
    if (validated.ok) return validated;
    problems.push(validated.error);
    return null;
  }

  if (!present.includes("job.md")) problems.push({ file: `applications/${id}/job.md`, problems: ["the file doesn't exist"] });
  const job = read(jobSchema, "job.md");
  read(analysisSchema, "analysis.md");
  const resume = read(resumeFileSchema, "resume.md");
  const verification = read(verificationSchema, "verification.md");
  const finished = generationFinished(present);

  return {
    id,
    ...(job ? jobSummary(job.data) : {}),
    ...(job?.data.url === undefined ? {} : { url: job.data.url }),
    ...(job?.data.fetched_at === undefined ? {} : { date: job.data.fetched_at }),
    ...(job?.data.archived_at === undefined ? {} : { archivedAt: job.data.archived_at }),
    hasText: job ? hasPostingText(job.body) : false,
    indeed: job?.data.url !== undefined && isIndeedLink(job.data.url),
    finished,
    ...(resume ? { resumeStatus: resume.data.status } : {}),
    ...(finished && resume && verification ? { printBlockers: printBlockers(resume.data, verification.data) } : {}),
    problems,
  };
}
