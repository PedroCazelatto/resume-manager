import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  assembleProfile,
  isProfileSlug,
  isSkippedProfilePath,
  type AssembleProfileResult,
  type SourceFile,
} from "@/core/profile/profile";
import type { ProfileFileError } from "@/core/profile/validate";

export interface ProfileList {
  slugs: string[];
  /** Folders under profiles/ that are not used because their name isn't kebab-case. */
  invalidNames: string[];
}

export interface ProfileStore {
  listProfiles(): Promise<ProfileList>;
  /** Reads and validates one profile. Never touches another profile's folder (Art. III.7). */
  loadProfile(slug: string): Promise<AssembleProfileResult>;
}

export function createFsProfileStore(dataDir: string): ProfileStore {
  const profilesDir = path.join(dataDir, "profiles");

  return {
    async listProfiles() {
      const entries = await readdir(profilesDir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      const folders = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name)
        .sort();
      return {
        slugs: folders.filter(isProfileSlug),
        invalidNames: folders.filter((name) => !isProfileSlug(name)),
      };
    },

    async loadProfile(slug) {
      if (!isProfileSlug(slug)) throw new Error("Invalid profile name");
      const root = path.join(profilesDir, slug);
      const { sources, unsupported } = await readProfileFolder(root);
      const result = assembleProfile(sources);
      if (unsupported.length === 0) return result;

      const errors: ProfileFileError[] = [
        ...(result.ok ? [] : result.errors),
        ...unsupported.map((file) => ({ file, problems: ["only regular files and folders are supported"] })),
      ];
      return { ok: false, errors: errors.sort((a, b) => a.file.localeCompare(b.file)) };
    },
  };
}

async function readProfileFolder(root: string): Promise<{ sources: SourceFile[]; unsupported: string[] }> {
  const sources: SourceFile[] = [];
  const unsupported: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = prefix + entry.name;
      if (isSkippedProfilePath(file)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, `${file}/`);
      // Symlinks are not followed: they could point into another profile (Art. III.7).
      else if (entry.isFile()) sources.push({ file, source: await readFile(full, "utf8") });
      else unsupported.push(file);
    }
  }

  await walk(root, "");
  return { sources, unsupported };
}
