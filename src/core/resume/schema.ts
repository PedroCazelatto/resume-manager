import { z } from "zod";
import { languageCode } from "../application/schemas";

// The resume content a template renders (constitution Art. VII.1) and resume.md stores
// (Art. IV.5). It mirrors the profile; every item lists the profile files it comes from
// (Art. II.4). Dates stay as in the profile and templates format them.

const text = z.string().min(1, "must not be empty");
const DATE = String.raw`\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?`;
const date = z.string().regex(new RegExp(`^${DATE}$`), "must be a date in YYYY-MM or YYYY-MM-DD format");
const endDate = z
  .string()
  .regex(new RegExp(`^(?:${DATE}|present)$`), "must be a date in YYYY-MM or YYYY-MM-DD format, or `present`");
const url = z.url({ protocol: /^https?$/, error: "must be an http(s) URL" });
/** Profile files the item comes from, relative to the profile folder. */
const sources = z.array(text);

/** Section headings and fixed words, written in the resume's language (Art. VIII.1). */
export const LABEL_KEYS = [
  "summary",
  "skills",
  "experience",
  "education",
  "projects",
  "certifications",
  "languages",
  "volunteering",
  "awards",
  "publications",
  "interests",
  "availability",
  "other",
  "present",
] as const;

const extra = z.object({ title: text, date: date.optional(), bullets: z.array(text), sources });

export const resumeContentSchema = z.object({
  name: text,
  contact: z.object({
    email: text,
    phone: text.optional(),
    location: z.object({ city: text, country: text }),
    work_authorisation: text.optional(),
    links: z.array(z.object({ label: text, url })),
  }),
  labels: z.object(Object.fromEntries(LABEL_KEYS.map((key) => [key, text])) as Record<(typeof LABEL_KEYS)[number], typeof text>),
  summary: text,
  summary_sources: sources,
  skills: z.array(z.object({ category: text, items: z.array(text) })),
  experience: z.array(
    z.object({
      role: text,
      company: text,
      location: text.optional(),
      start: date,
      end: endDate,
      bullets: z.array(text),
      sources,
    }),
  ),
  education: z.array(
    z.object({
      degree: text,
      field: text.optional(),
      institution: text,
      location: text.optional(),
      start: date,
      end: endDate,
      grade: text.optional(),
      bullets: z.array(text),
      sources,
    }),
  ),
  projects: z.array(
    z.object({
      name: text,
      role: text.optional(),
      url: url.optional(),
      start: date.optional(),
      end: endDate.optional(),
      bullets: z.array(text),
      sources,
    }),
  ),
  certifications: z.array(z.object({ name: text, issuer: text, date, sources })),
  languages: z.array(z.object({ name: text, level: text, sources })),
  extras: z.object({
    volunteering: z.array(extra),
    award: z.array(extra),
    publication: z.array(extra),
    interest: z.array(extra),
    availability: z.array(extra),
    other: z.array(extra),
  }),
});

export const INFERENCE_STATUS = ["pending", "approved", "rejected"] as const;

/** A skill the profile implies but doesn't state; it needs the user's approval (Art. II.3). */
export const inferenceSchema = z.object({
  skill: text,
  sources,
  /** Why the sources imply the skill, quoting their text. */
  reason: text,
  status: z.enum(INFERENCE_STATUS),
});

/** resume.md frontmatter: run metadata plus the content (Art. IV.5). */
export const resumeFileSchema = resumeContentSchema.extend({
  generated_at: z.iso.datetime({ offset: true, error: "must be an ISO date-time, e.g. 2026-11-09T14:02:11Z" }),
  model: text,
  template: text,
  language: languageCode,
  status: z.enum(["draft", "ready"]),
  inferences: z.array(inferenceSchema),
});

export type ResumeContent = z.infer<typeof resumeContentSchema>;
export type Inference = z.infer<typeof inferenceSchema>;
export type ResumeFile = z.infer<typeof resumeFileSchema>;
