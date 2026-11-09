import { z } from "zod";

// Frontmatter of the files a run writes in applications/<id>/ (constitution Art. IV.5).

const text = z.string().min(1, "must not be empty");
const timestamp = z.iso.datetime({ offset: true, error: "must be an ISO date-time, e.g. 2026-11-09T14:02:11Z" });

/** Two-letter ISO 639-1 code, e.g. `en`, `pt`. */
export const languageCode = z.string().regex(/^[a-z]{2}$/, "must be a two-letter ISO 639-1 code, e.g. en");

export const jobSchema = z.looseObject({
  source: z.enum(["url", "paste"]),
  url: z.url({ protocol: /^https?$/ }).optional(),
  fetched_at: timestamp,
  company: text,
  role: text,
  language: languageCode,
  location: text.optional(),
});

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
