import { z } from "zod";

// Frontmatter of the files a run writes in applications/<id>/ (constitution Art. IV.5).

const text = z.string().min(1, "must not be empty");
const timestamp = z.iso.datetime({ offset: true, error: "must be an ISO date-time, e.g. 2026-11-09T14:02:11Z" });

/** Two-letter ISO 639-1 code, e.g. `en`, `pt`. */
export const languageCode = z.string().regex(/^[a-z]{2}$/, "must be a two-letter ISO 639-1 code, e.g. en");

/** How the job is worked, as `job.md`'s `work_model` says it (Art. IV.5). */
export const WORK_MODELS = ["remote", "hybrid", "on-site"] as const;
export type WorkModel = (typeof WORK_MODELS)[number];

/**
 * A job posting's details, named as in `job.md` (Art. IV.5): read from the posting's page, or
 * copied by the model from the posting's text when the page doesn't hold them (Art. VI.2, F46).
 */
export interface JobDetails {
  title?: string;
  company?: string;
  /** The company's website: an http or https address. */
  company_url?: string;
  location?: string;
  /** As the posting writes it, e.g. "€60,000–€70,000 a year". */
  salary?: string;
  work_model?: WorkModel;
  /** As the posting writes it, e.g. "40 hours a week". */
  hours?: string;
}

const webAddress = z.url({ protocol: /^https?$/, error: "must be an http or https address" });

/**
 * job.md: the posting's details, its link and the platform it came from; the posting's text is
 * the body (F46). A file written before F46 is still read, until application-uuids rewrites it:
 * its `source` says how the text arrived (`url` or `paste`), a pasted posting may have no `url`,
 * and its title is `role`.
 */
export const jobSchema = z
  .looseObject({
    title: text.optional(),
    company: text.optional(),
    company_url: webAddress.optional(),
    url: webAddress.optional(),
    /** The job platform ("LinkedIn", "Indeed", otherwise the link's host name without `www.`). */
    source: text,
    fetched_at: timestamp.optional(),
    language: languageCode.optional(),
    location: text.optional(),
    salary: text.optional(),
    work_model: z.enum(WORK_MODELS).optional(),
    hours: text.optional(),
    /** When the application was archived; restoring it removes the field (F48). */
    archived_at: timestamp.optional(),
    /** The title, in a job.md written before F46. */
    role: text.optional(),
  })
  // Every posting has its link (F47); only a file written before F46, whose source is `url` or `paste`, may lack it.
  .refine((job) => job.url !== undefined || job.source === "url" || job.source === "paste", { path: ["url"], message: "is required" });

export const IMPORTANCE = ["must-have", "nice-to-have"] as const;
export const MATCH_STATUS = ["matched", "partial", "missing"] as const;

export const requirementSchema = z.looseObject({
  text,
  importance: z.enum(IMPORTANCE),
  status: z.enum(MATCH_STATUS),
  /** Profile files that support the match, relative to the profile folder. */
  sources: z.array(text),
  note: z.string(),
});

export const analysisSchema = z.looseObject({
  generated_at: timestamp,
  model: text,
  requirements: z.array(requirementSchema),
  keywords: z.array(text),
});

export type Job = z.infer<typeof jobSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
