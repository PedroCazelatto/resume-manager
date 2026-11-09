import type { z } from "zod";
import { parseFrontmatter } from "./frontmatter";

/** A Markdown file whose frontmatter failed to parse or validate, reported with its path (Art. IV.6). */
export interface FileError {
  file: string;
  problems: string[];
}

export type ValidatedFile<T> = { ok: true; data: T; body: string } | { ok: false; error: FileError };

const errorMap: z.core.$ZodErrorMap = (issue) => {
  if (issue.code !== "invalid_type") return undefined;
  if (issue.input === undefined) return "is required";
  if (issue.expected === "string") return "must be text (put the value in quotes)";
  if (issue.expected === "array") return "must be a list";
  if (issue.expected === "object") return "must be a group of `field: value` lines";
  return undefined;
};

function formatPath(path: readonly PropertyKey[]): string {
  return path.map((key, i) => (typeof key === "number" ? `[${key}]` : `${i > 0 ? "." : ""}${String(key)}`)).join("");
}

/** Parses a Markdown file's frontmatter and validates it against a schema. */
export function validateMarkdownFile<T>(schema: z.ZodType<T>, file: string, source: string): ValidatedFile<T> {
  const parsed = parseFrontmatter(source);
  if (!parsed.ok) return { ok: false, error: { file, problems: [parsed.problem] } };

  const result = schema.safeParse(parsed.data, { error: errorMap });
  if (!result.success) {
    const problems = result.error.issues.map((issue) =>
      issue.path.length > 0 ? `${formatPath(issue.path)}: ${issue.message}` : issue.message,
    );
    return { ok: false, error: { file, problems } };
  }
  return { ok: true, data: result.data, body: parsed.body };
}
