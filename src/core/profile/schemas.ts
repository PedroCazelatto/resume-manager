import { z } from "zod";

// Frontmatter schemas for profile files (constitution Art. IV.5).
// Objects are loose: fields the app doesn't know about are kept (Art. IV.7).

const DATE = String.raw`\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?`;
const DATE_MESSAGE = "must be a date in YYYY-MM or YYYY-MM-DD format";
const END_MESSAGE = "must be a date in YYYY-MM or YYYY-MM-DD format, or `present`";

const requiredOr = (message: string) => (issue: { input?: unknown }) =>
  issue.input === undefined ? "is required" : message;

const text = z.string().min(1, "must not be empty");
const date = z.string({ error: requiredOr(DATE_MESSAGE) }).regex(new RegExp(`^${DATE}$`), DATE_MESSAGE);
const endDate = z.string({ error: requiredOr(END_MESSAGE) }).regex(new RegExp(`^(?:${DATE}|present)$`), END_MESSAGE);
const url = z.url({ protocol: /^https?$/, error: requiredOr("must be an http(s) URL") });
const tags = z.array(text);

export const personalSchema = z.looseObject({
  name: text,
  email: z.email({ error: requiredOr("must be an email address") }),
  phone: text.optional(),
  location: z.looseObject({ city: text, country: text }),
  work_authorisation: text.optional(),
  links: z.array(z.looseObject({ label: text, url })).optional(),
});

export const summarySchema = z.looseObject({
  target_roles: z.array(text).optional(),
});

// Skills are written in the body, as `## Category` headings with bullet lists.
export const skillsSchema = z.looseObject({});

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "native"] as const;

export const languagesSchema = z.looseObject({
  languages: z.array(
    z.looseObject({
      name: text,
      level: z.enum(CEFR_LEVELS, { error: requiredOr("must be a CEFR level (A1–C2) or `native`") }),
    }),
  ),
});

export const experienceSchema = z.looseObject({
  company: text,
  role: text,
  location: text.optional(),
  start: date,
  end: endDate,
  employment_type: text.optional(),
  tags: tags.optional(),
});

export const educationSchema = z.looseObject({
  institution: text,
  degree: text,
  field: text.optional(),
  location: text.optional(),
  start: date,
  end: endDate,
  grade: text.optional(),
});

export const projectSchema = z.looseObject({
  name: text,
  role: text.optional(),
  url: url.optional(),
  start: date.optional(),
  end: endDate.optional(),
  tags: tags.optional(),
});

export const certificationSchema = z.looseObject({
  name: text,
  issuer: text,
  date,
  expires: date.optional(),
  credential_url: url.optional(),
});

export const EXTRA_TYPES = ["volunteering", "award", "publication", "interest", "other"] as const;

export const extraSchema = z.looseObject({
  type: z.enum(EXTRA_TYPES, { error: requiredOr(`must be one of: ${EXTRA_TYPES.join(", ")}`) }),
  title: text,
  date: date.optional(),
});

export const profileFileSchemas = {
  personal: personalSchema,
  summary: summarySchema,
  skills: skillsSchema,
  languages: languagesSchema,
  experience: experienceSchema,
  education: educationSchema,
  project: projectSchema,
  certification: certificationSchema,
  extra: extraSchema,
};

export type ProfileFileKind = keyof typeof profileFileSchemas;

export type Personal = z.infer<typeof personalSchema>;
export type Summary = z.infer<typeof summarySchema>;
export type Skills = z.infer<typeof skillsSchema>;
export type Languages = z.infer<typeof languagesSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Certification = z.infer<typeof certificationSchema>;
export type Extra = z.infer<typeof extraSchema>;
