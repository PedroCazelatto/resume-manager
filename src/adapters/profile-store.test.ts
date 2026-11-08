import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsProfileStore } from "./profile-store";

const EXAMPLE_DATA = path.resolve("data.example");

describe("createFsProfileStore with data.example", () => {
  const store = createFsProfileStore(EXAMPLE_DATA);

  it("lists the example profile", async () => {
    expect(await store.listProfiles()).toEqual({ slugs: ["jane-doe"], invalidNames: [] });
  });

  it("loads the example profile without problems", async () => {
    const result = await store.loadProfile("jane-doe");

    expect(result.ok ? [] : result.errors).toEqual([]);
    if (!result.ok) return;
    expect(result.profile.personal.data.name).toBe("Jane Doe");
    expect(result.profile.experience).toHaveLength(2);
    expect(result.profile.education).toHaveLength(1);
    expect(result.profile.projects).toHaveLength(1);
    expect(result.profile.certifications).toHaveLength(1);
    expect(result.profile.extras).toHaveLength(1);
  });
});

describe("createFsProfileStore in a scratch folder", () => {
  let dataDir: string;
  let profileDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "resume-store-"));
    profileDir = path.join(dataDir, "profiles", "jane-doe");
    await cp(path.join(EXAMPLE_DATA, "profiles", "jane-doe"), profileDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("returns no profiles when profiles/ does not exist", async () => {
    const store = createFsProfileStore(path.join(dataDir, "missing"));

    expect(await store.listProfiles()).toEqual({ slugs: [], invalidNames: [] });
  });

  it("separates folders whose name is not kebab-case and skips hidden ones", async () => {
    await mkdir(path.join(dataDir, "profiles", "John Smith"));
    await mkdir(path.join(dataDir, "profiles", ".trash"));
    await writeFile(path.join(dataDir, "profiles", "notes.md"), "");

    expect(await createFsProfileStore(dataDir).listProfiles()).toEqual({
      slugs: ["jane-doe"],
      invalidNames: ["John Smith"],
    });
  });

  it.each(["../jane-doe", "Jane-Doe", "jane/doe", ""])("refuses the profile name %j", async (slug) => {
    await expect(createFsProfileStore(dataDir).loadProfile(slug)).rejects.toThrow("Invalid profile name");
  });

  it("skips imports and applications", async () => {
    await mkdir(path.join(profileDir, "imports"));
    await writeFile(path.join(profileDir, "imports", "cv.pdf"), "%PDF");
    await mkdir(path.join(profileDir, "applications", "2026-11-05-globex-dev"), { recursive: true });
    await writeFile(path.join(profileDir, "applications", "2026-11-05-globex-dev", "job.md"), "not frontmatter");

    expect((await createFsProfileStore(dataDir).loadProfile("jane-doe")).ok).toBe(true);
  });

  it("reports invalid files and symlinks with their paths", async () => {
    await writeFile(path.join(profileDir, "experience", "2020-01-x.md"), "---\nrole: Dev\n---\n");
    await symlink(path.join(profileDir, "personal.md"), path.join(profileDir, "extras", "link.md"));

    expect(await createFsProfileStore(dataDir).loadProfile("jane-doe")).toEqual({
      ok: false,
      errors: [
        {
          file: "experience/2020-01-x.md",
          problems: ["company: is required", "start: is required", "end: is required"],
        },
        { file: "extras/link.md", problems: ["only regular files and folders are supported"] },
      ],
    });
  });
});
