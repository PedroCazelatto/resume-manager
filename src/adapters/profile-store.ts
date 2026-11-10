import { randomUUID } from "node:crypto";
import { link, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isApplicationId, withCollisionSuffix, type ApplicationFile } from "@/core/application/folder";
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
  /** Folders in the profiles folder that are not used because their name isn't kebab-case. */
  invalidNames: string[];
}

export interface ProfileStore {
  listProfiles(): Promise<ProfileList>;
  /** Reads and validates one profile. Never touches another profile's folder (Art. III.7). */
  loadProfile(slug: string): Promise<AssembleProfileResult>;
  /**
   * Creates applications/<baseName>/ in the profile, or <baseName>-2, -3… when that exists,
   * writes the files, and returns the folder name (F25).
   */
  createApplication(slug: string, baseName: string, files: Partial<Record<ApplicationFile, string>>): Promise<string>;
  /** One file of an application, or null when it doesn't exist. */
  readApplicationFile(slug: string, id: string, file: ApplicationFile): Promise<string | null>;
  /** Adds a file to an application. Fails if it already exists: nothing is overwritten (Art. IV.8). */
  addApplicationFile(slug: string, id: string, file: ApplicationFile, content: string): Promise<void>;
}

const MAX_FOLDER_ATTEMPTS = 100;

export function createFsProfileStore(profilesDir: string): ProfileStore {
  function profileFolder(slug: string): string {
    if (!isProfileSlug(slug)) throw new Error("Invalid profile name");
    // The profiles folder is only known at runtime. turbopackIgnore stops the build from
    // tracing these paths and copying profiles/ into the output (Art. III.3).
    return path.join(/* turbopackIgnore: true */ profilesDir, slug);
  }

  function applicationFolder(slug: string, id: string): string {
    if (!isApplicationId(id)) throw new Error("Invalid application name");
    return path.join(/* turbopackIgnore: true */ profileFolder(slug), "applications", id);
  }

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
      const { sources, unsupported } = await readProfileFolder(profileFolder(slug));
      const result = assembleProfile(sources);
      if (unsupported.length === 0) return result;

      const errors: ProfileFileError[] = [
        ...(result.ok ? [] : result.errors),
        ...unsupported.map((file) => ({ file, problems: ["only regular files and folders are supported"] })),
      ];
      return { ok: false, errors: errors.sort((a, b) => a.file.localeCompare(b.file)) };
    },

    async createApplication(slug, baseName, files) {
      const applications = path.join(/* turbopackIgnore: true */ profileFolder(slug), "applications");
      await mkdir(applications, { recursive: true });

      for (let attempt = 1; attempt <= MAX_FOLDER_ATTEMPTS; attempt++) {
        const id = withCollisionSuffix(baseName, attempt);
        if (!isApplicationId(id)) throw new Error("Invalid application name");
        const folder = path.join(/* turbopackIgnore: true */ applications, id);
        try {
          // mkdir fails when the folder exists, so two runs never share a folder.
          await mkdir(folder);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
          throw error;
        }
        for (const [file, content] of Object.entries(files)) {
          await writeFileAtomic(path.join(/* turbopackIgnore: true */ folder, file), content);
        }
        return id;
      }
      throw new Error(`Too many applications named ${baseName}`);
    },

    async readApplicationFile(slug, id, file) {
      const full = path.join(/* turbopackIgnore: true */ applicationFolder(slug, id), file);
      return readFile(full, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
    },

    async addApplicationFile(slug, id, file, content) {
      const folder = applicationFolder(slug, id);
      const target = path.join(/* turbopackIgnore: true */ folder, file);
      const temp = path.join(/* turbopackIgnore: true */ folder, `.${file}.${randomUUID()}.tmp`);
      try {
        await writeFile(temp, content, { flag: "wx" });
        // link fails when the target exists, so the file appears complete or not at all.
        await link(temp, target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`${file} already exists in ${id}`);
        throw error;
      } finally {
        await rm(temp, { force: true });
      }
    },
  };
}

/** Writes a temp file next to the target, then renames it into place (Art. IV.8). */
async function writeFileAtomic(file: string, content: string): Promise<void> {
  const temp = path.join(/* turbopackIgnore: true */ path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, content, { flag: "wx" });
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

async function readProfileFolder(root: string): Promise<{ sources: SourceFile[]; unsupported: string[] }> {
  const sources: SourceFile[] = [];
  const unsupported: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = prefix + entry.name;
      if (isSkippedProfilePath(file)) continue;
      const full = path.join(/* turbopackIgnore: true */ dir, entry.name);
      if (entry.isDirectory()) await walk(full, `${file}/`);
      // Symlinks are not followed: they could point into another profile (Art. III.7).
      else if (entry.isFile()) sources.push({ file, source: await readFile(full, "utf8") });
      else unsupported.push(file);
    }
  }

  await walk(root, "");
  return { sources, unsupported };
}
