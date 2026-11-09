import { parseProfileFile, profileFileKind, type ProfileFile, type ProfileFileError } from "./validate";

/** A file read from a profile folder. `file` is relative to the folder, with forward slashes. */
export interface SourceFile {
  file: string;
  source: string;
}

type Item<K extends ProfileFile["kind"]> = Extract<ProfileFile, { kind: K }>;

export interface Profile {
  personal: Item<"personal">;
  summary: Item<"summary">;
  skills: Item<"skills">;
  languages: Item<"languages">;
  experience: Item<"experience">[];
  education: Item<"education">[];
  projects: Item<"project">[];
  certifications: Item<"certification">[];
  extras: Item<"extra">[];
}

export type AssembleProfileResult = { ok: true; profile: Profile } | { ok: false; errors: ProfileFileError[] };

/** Profile folder names are lowercase ASCII kebab-case (Art. IV.4). */
export function isProfileSlug(name: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

export const REQUIRED_PROFILE_FILES = ["personal.md", "summary.md", "skills.md", "languages.md"] as const;

// Folders in a profile that are not profile items (Art. IV.3).
const NON_ITEM_FOLDERS = new Set(["imports", "applications"]);

/** Every file of a profile, in path order. */
export function listProfileFiles(profile: Profile): ProfileFile[] {
  const { personal, summary, skills, languages, experience, education, projects, certifications, extras } = profile;
  return [personal, summary, skills, languages, ...experience, ...education, ...projects, ...certifications, ...extras].sort(
    (a, b) => a.file.localeCompare(b.file),
  );
}

/** True for paths that are not part of the profile's content: hidden files, imports/ and applications/. */
export function isSkippedProfilePath(file: string): boolean {
  const parts = file.split("/");
  return NON_ITEM_FOLDERS.has(parts[0]) || parts.some((part) => part.startsWith("."));
}

/**
 * Validates every file of a profile and groups them. The profile is usable only when
 * every file is valid, the required files exist and nothing sits outside the layout.
 */
export function assembleProfile(sources: SourceFile[]): AssembleProfileResult {
  const errors: ProfileFileError[] = [];
  const files: ProfileFile[] = [];

  for (const { file, source } of sources) {
    if (isSkippedProfilePath(file)) continue;
    const kind = profileFileKind(file);
    if (!kind) {
      errors.push({ file, problems: ["not part of the profile layout (constitution Art. IV.3)"] });
      continue;
    }
    const result = parseProfileFile(kind, file, source);
    if (result.ok) files.push(result.value);
    else errors.push(result.error);
  }

  const present = new Set(sources.map((s) => s.file));
  for (const file of REQUIRED_PROFILE_FILES) {
    if (!present.has(file)) errors.push({ file, problems: ["file is missing"] });
  }

  if (errors.length > 0) {
    return { ok: false, errors: errors.sort((a, b) => a.file.localeCompare(b.file)) };
  }

  files.sort((a, b) => a.file.localeCompare(b.file));
  const single = <K extends ProfileFile["kind"]>(kind: K) => files.find((f): f is Item<K> => f.kind === kind)!;
  const all = <K extends ProfileFile["kind"]>(kind: K) => files.filter((f): f is Item<K> => f.kind === kind);

  return {
    ok: true,
    profile: {
      personal: single("personal"),
      summary: single("summary"),
      skills: single("skills"),
      languages: single("languages"),
      experience: all("experience"),
      education: all("education"),
      projects: all("project"),
      certifications: all("certification"),
      extras: all("extra"),
    },
  };
}
