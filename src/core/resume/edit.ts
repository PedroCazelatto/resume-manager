import { stringify } from "yaml";
import { validateMarkdownFile, type FileError } from "../markdown/validate";
import { resumeContentSchema, type ResumeContent } from "./schema";

// Editing resume.md in the app (F21): the text area holds the content fields as YAML,
// exactly as the file stores them, without the run metadata.

const CONTENT_KEYS = Object.keys(resumeContentSchema.shape) as (keyof ResumeContent)[];

/** The content fields of a resume as YAML, in the schema's order. */
export function contentYaml(resume: ResumeContent): string {
  return stringify(Object.fromEntries(CONTENT_KEYS.map((key) => [key, resume[key]])), { lineWidth: 0 });
}

export type ParseContentResult = { ok: true; content: ResumeContent } | { ok: false; error: FileError };

/** Parses and validates edited content; problems name the field (Art. IV.6). */
export function parseContentYaml(yaml: string): ParseContentResult {
  const result = validateMarkdownFile(resumeContentSchema, "resume.md", `---\n${yaml}\n---\n`);
  return result.ok ? { ok: true, content: result.data } : result;
}
