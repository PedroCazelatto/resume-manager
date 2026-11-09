import type { z } from "zod";
import { validateMarkdownFile, type FileError } from "../markdown/validate";
import { profileFileSchemas, type ProfileFileKind } from "./schemas";

/** A profile file that passed validation. `file` is relative to the profile folder. */
export type ProfileFile = {
  [K in ProfileFileKind]: {
    kind: K;
    file: string;
    data: z.infer<(typeof profileFileSchemas)[K]>;
    body: string;
    /** The file exactly as written, for prompts. */
    source: string;
  };
}[ProfileFileKind];

/** An invalid file, reported to the user with its path and problems (Art. IV.6). */
export type ProfileFileError = FileError;

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

export function parseProfileFile(kind: ProfileFileKind, file: string, source: string): ParseProfileFileResult {
  const result = validateMarkdownFile(profileFileSchemas[kind], file, source);
  if (!result.ok) return result;
  return { ok: true, value: { kind, file, data: result.data, body: result.body, source } as ProfileFile };
}
