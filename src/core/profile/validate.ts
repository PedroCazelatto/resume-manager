import { z } from "zod";
import { parseFrontmatter } from "../markdown/frontmatter";
import { profileFileSchemas, type ProfileFileKind } from "./schemas";

/** A profile file that passed validation. `file` is relative to the profile folder. */
export type ProfileFile = {
  [K in ProfileFileKind]: {
    kind: K;
    file: string;
    data: z.infer<(typeof profileFileSchemas)[K]>;
    body: string;
  };
}[ProfileFileKind];

/** An invalid file, reported to the user with its path and problems (Art. IV.6). */
export interface ProfileFileError {
  file: string;
  problems: string[];
}

export type ParseProfileFileResult = { ok: true; value: ProfileFile } | { ok: false; error: ProfileFileError };

const SINGLE_FILES: Record<string, ProfileFileKind> = {
  "personal.md": "personal",
  "summary.md": "summary",
  "skills.md": "skills",
  "languages.md": "languages",
};

const ITEM_FOLDERS: Record<string, ProfileFileKind> = {
  experience: "experience",
  education: "education",
  projects: "project",
  certifications: "certification",
  extras: "extra",
};

/**
 * Maps a path relative to the profile folder (forward slashes) to its file kind,
 * following the layout in Art. IV.3. Returns undefined for anything else.
 */
export function profileFileKind(file: string): ProfileFileKind | undefined {
  const parts = file.split("/");
  if (parts.length === 1) return SINGLE_FILES[file];
  if (parts.length === 2 && parts[1].endsWith(".md")) return ITEM_FOLDERS[parts[0]];
  return undefined;
}

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

export function parseProfileFile(kind: ProfileFileKind, file: string, source: string): ParseProfileFileResult {
  const parsed = parseFrontmatter(source);
  if (!parsed.ok) return { ok: false, error: { file, problems: [parsed.problem] } };

  const result = profileFileSchemas[kind].safeParse(parsed.data, { error: errorMap });
  if (!result.success) {
    const problems = result.error.issues.map((issue) =>
      issue.path.length > 0 ? `${formatPath(issue.path)}: ${issue.message}` : issue.message,
    );
    return { ok: false, error: { file, problems } };
  }

  return { ok: true, value: { kind, file, data: result.data, body: parsed.body } as ProfileFile };
}
