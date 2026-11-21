import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsProfileStore } from "./profile-store";

const EXAMPLE_PROFILES = path.resolve("example-profiles");

describe("createFsProfileStore with example-profiles", () => {
  const store = createFsProfileStore(EXAMPLE_PROFILES);

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
  let profilesDir: string;
  let profileDir: string;

  beforeEach(async () => {
    profilesDir = await mkdtemp(path.join(tmpdir(), "resume-store-"));
    profileDir = path.join(profilesDir, "jane-doe");
    await cp(path.join(EXAMPLE_PROFILES, "jane-doe"), profileDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(profilesDir, { recursive: true, force: true });
  });

  it("returns no profiles when the profiles folder does not exist", async () => {
    const store = createFsProfileStore(path.join(profilesDir, "missing"));

    expect(await store.listProfiles()).toEqual({ slugs: [], invalidNames: [] });
  });

  it("separates folders whose name is not kebab-case and skips hidden ones", async () => {
    await mkdir(path.join(profilesDir, "John Smith"));
    await mkdir(path.join(profilesDir, ".trash"));
    await writeFile(path.join(profilesDir, "notes.md"), "");

    expect(await createFsProfileStore(profilesDir).listProfiles()).toEqual({
      slugs: ["jane-doe"],
      invalidNames: ["John Smith"],
    });
  });

  it.each(["../jane-doe", "Jane-Doe", "jane/doe", ""])("refuses the profile name %j", async (slug) => {
    await expect(createFsProfileStore(profilesDir).loadProfile(slug)).rejects.toThrow("Invalid profile name");
  });

  it("skips imports and applications", async () => {
    await mkdir(path.join(profileDir, "imports"));
    await writeFile(path.join(profileDir, "imports", "cv.pdf"), "%PDF");
    await mkdir(path.join(profileDir, "applications", "2026-11-05-globex-dev"), { recursive: true });
    await writeFile(path.join(profileDir, "applications", "2026-11-05-globex-dev", "job.md"), "not frontmatter");

    expect((await createFsProfileStore(profilesDir).loadProfile("jane-doe")).ok).toBe(true);
  });

  it("reports invalid files and symlinks with their paths", async () => {
    await writeFile(path.join(profileDir, "experience", "2020-01-x.md"), "---\nrole: Dev\n---\n");
    await symlink(path.join(profileDir, "personal.md"), path.join(profileDir, "extras", "link.md"));

    expect(await createFsProfileStore(profilesDir).loadProfile("jane-doe")).toEqual({
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

  describe("replaceProfileFile", () => {
    it("replaces a profile file and leaves no temp file and no other change behind", async () => {
      const store = createFsProfileStore(profilesDir);
      const before = await readdir(profileDir, { recursive: true });
      const summary = await readFile(path.join(profileDir, "summary.md"), "utf8");

      await store.replaceProfileFile("jane-doe", "skills.md", "---\n---\n\n## Data\n- Redis\n");

      expect(await readFile(path.join(profileDir, "skills.md"), "utf8")).toBe("---\n---\n\n## Data\n- Redis\n");
      expect(await readdir(profileDir, { recursive: true })).toEqual(before);
      expect(await readFile(path.join(profileDir, "summary.md"), "utf8")).toBe(summary);
    });

    it("replaces a file in an item folder", async () => {
      const store = createFsProfileStore(profilesDir);
      const [file] = await readdir(path.join(profileDir, "experience"));

      await store.replaceProfileFile("jane-doe", `experience/${file}`, "changed");

      expect(await readFile(path.join(profileDir, "experience", file), "utf8")).toBe("changed");
    });

    it.each([
      "../jane-doe/skills.md",
      "../other/skills.md",
      "/etc/hosts",
      "applications/2026-11-09-globex-dev/resume.md",
      "applications/resume.md",
      "imports/cv.md",
      "experience/../skills.md",
      "experience/.hidden.md",
      "notes.md",
      "skills.txt",
      "",
    ])("refuses the path %j", async (file) => {
      await mkdir(path.join(profilesDir, "other"));
      await writeFile(path.join(profilesDir, "other", "skills.md"), "theirs");

      await expect(createFsProfileStore(profilesDir).replaceProfileFile("jane-doe", file, "x")).rejects.toThrow(
        "Not a profile file",
      );
      expect(await readFile(path.join(profilesDir, "other", "skills.md"), "utf8")).toBe("theirs");
    });

    it("refuses an invalid profile name", async () => {
      await expect(createFsProfileStore(profilesDir).replaceProfileFile("../other", "skills.md", "x")).rejects.toThrow(
        "Invalid profile name",
      );
    });

    it("doesn't create a file that doesn't exist", async () => {
      await rm(path.join(profileDir, "skills.md"));

      await expect(createFsProfileStore(profilesDir).replaceProfileFile("jane-doe", "skills.md", "x")).rejects.toThrow(
        "skills.md doesn't exist",
      );
      expect(await readdir(profileDir)).not.toContain("skills.md");
    });

    it("doesn't write through a symlink into another profile", async () => {
      const other = path.join(profilesDir, "other");
      await mkdir(path.join(other, "experience"), { recursive: true });
      await writeFile(path.join(other, "skills.md"), "theirs");
      await writeFile(path.join(other, "experience", "2020-01-x.md"), "theirs");
      await rm(path.join(profileDir, "skills.md"));
      await symlink(path.join(other, "skills.md"), path.join(profileDir, "skills.md"));
      await rm(path.join(profileDir, "experience"), { recursive: true });
      await symlink(path.join(other, "experience"), path.join(profileDir, "experience"));
      const store = createFsProfileStore(profilesDir);

      await expect(store.replaceProfileFile("jane-doe", "skills.md", "x")).rejects.toThrow("doesn't exist");
      await expect(store.replaceProfileFile("jane-doe", "experience/2020-01-x.md", "x")).rejects.toThrow("doesn't exist");
      expect(await readFile(path.join(other, "skills.md"), "utf8")).toBe("theirs");
      expect(await readFile(path.join(other, "experience", "2020-01-x.md"), "utf8")).toBe("theirs");
    });
  });

  describe("applications", () => {
    const files = { "job.md": "---\nsource: paste\n---\nPosting\n", "analysis.md": "---\nmodel: m\n---\n" };
    const ID = "3f2b8c1e-5a7d-4c9e-9b1a-2d6e8f0c4a73";
    const OTHER = "9c0d4e2a-7b1f-4a3c-8e5d-6f2a1b0c9d8e";

    it("creates the folder named by its UUID with its files", async () => {
      const store = createFsProfileStore(profilesDir);

      await store.createApplication("jane-doe", ID, files);

      const folder = path.join(profileDir, "applications", ID);
      expect((await readdir(folder)).sort()).toEqual(["analysis.md", "job.md"]);
      expect(await readFile(path.join(folder, "job.md"), "utf8")).toBe(files["job.md"]);
    });

    it("never reuses an existing folder (F50)", async () => {
      const store = createFsProfileStore(profilesDir);
      await store.createApplication("jane-doe", ID, files);

      await expect(store.createApplication("jane-doe", ID, { "job.md": "replacement" })).rejects.toThrow(`Application ${ID} already exists`);
      expect(await store.readApplicationFile("jane-doe", ID, "job.md")).toBe(files["job.md"]);
    });

    it("creates the applications folder when the profile has none yet", async () => {
      await rm(path.join(profileDir, "applications"), { recursive: true, force: true });

      await createFsProfileStore(profilesDir).createApplication("jane-doe", ID, files);

      expect(await readdir(path.join(profileDir, "applications"))).toEqual([ID]);
    });

    it("leaves the profile itself valid", async () => {
      const store = createFsProfileStore(profilesDir);
      await store.createApplication("jane-doe", ID, files);

      expect((await store.loadProfile("jane-doe")).ok).toBe(true);
    });

    it("lists the saved applications' folders, new and old names, never a file, a symlink or another name", async () => {
      const store = createFsProfileStore(profilesDir);
      const applications = path.join(profileDir, "applications");
      await rm(applications, { recursive: true, force: true });
      expect(await store.listApplications("jane-doe")).toEqual([]);

      await store.createApplication("jane-doe", OTHER, files);
      await store.createApplication("jane-doe", ID, files);
      // An application saved before F50, still listed until its update is confirmed.
      await mkdir(path.join(applications, "2026-11-08-globex-dev"));
      await writeFile(path.join(applications, "2026-11-07-notes"), "");
      await mkdir(path.join(applications, "Not An Application"));
      await mkdir(path.join(profilesDir, "john-roe", "applications", "2026-11-06-umbrella-dev"), { recursive: true });
      await symlink(path.join(profilesDir, "john-roe", "applications", "2026-11-06-umbrella-dev"), path.join(applications, "2026-11-06-umbrella-dev"));

      expect(await store.listApplications("jane-doe")).toEqual(["2026-11-08-globex-dev", ID, OTHER]);
      await expect(store.listApplications("../john-roe")).rejects.toThrow("Invalid profile name");
    });

    it("reads a file back, or null when it doesn't exist, under a new or an old name", async () => {
      const store = createFsProfileStore(profilesDir);
      await store.createApplication("jane-doe", ID, files);
      const old = "2026-11-08-globex-dev";
      await mkdir(path.join(profileDir, "applications", old));
      await writeFile(path.join(profileDir, "applications", old, "job.md"), files["job.md"]);

      expect(await store.readApplicationFile("jane-doe", ID, "job.md")).toBe(files["job.md"]);
      expect(await store.readApplicationFile("jane-doe", ID, "resume.md")).toBeNull();
      expect(await store.readApplicationFile("jane-doe", OTHER, "job.md")).toBeNull();
      expect(await store.readApplicationFile("jane-doe", old, "job.md")).toBe(files["job.md"]);
    });

    it("adds a file to an existing application", async () => {
      const store = createFsProfileStore(profilesDir);
      await store.createApplication("jane-doe", ID, files);

      await store.addApplicationFile("jane-doe", ID, "resume.md", "---\nstatus: draft\n---\n");

      expect(await store.readApplicationFile("jane-doe", ID, "resume.md")).toBe("---\nstatus: draft\n---\n");
      expect((await readdir(path.join(profileDir, "applications", ID))).sort()).toEqual([
        "analysis.md",
        "job.md",
        "resume.md",
      ]);
    });

    it("never overwrites an existing file", async () => {
      const store = createFsProfileStore(profilesDir);
      await store.createApplication("jane-doe", ID, files);

      await expect(store.addApplicationFile("jane-doe", ID, "job.md", "replacement")).rejects.toThrow(
        `job.md already exists in ${ID}`,
      );
      expect(await store.readApplicationFile("jane-doe", ID, "job.md")).toBe(files["job.md"]);
      expect((await readdir(path.join(profileDir, "applications", ID))).sort()).toEqual(["analysis.md", "job.md"]);
    });

    it("replaces an existing file and leaves no temp file behind", async () => {
      const store = createFsProfileStore(profilesDir);
      await store.createApplication("jane-doe", ID, files);

      await store.replaceApplicationFile("jane-doe", ID, "analysis.md", "---\nmodel: other\n---\n");

      expect(await store.readApplicationFile("jane-doe", ID, "analysis.md")).toBe("---\nmodel: other\n---\n");
      expect((await readdir(path.join(profileDir, "applications", ID))).sort()).toEqual(["analysis.md", "job.md"]);
    });

    it("doesn't create a file when asked to replace one that doesn't exist", async () => {
      const store = createFsProfileStore(profilesDir);
      await store.createApplication("jane-doe", ID, files);

      await expect(store.replaceApplicationFile("jane-doe", ID, "resume.md", "x")).rejects.toThrow(
        `resume.md doesn't exist in ${ID}`,
      );
      expect(await store.readApplicationFile("jane-doe", ID, "resume.md")).toBeNull();
    });

    it.each(["../../other/x", "2026-11-09-Globex", "jane-doe", `../${ID}`, ID.toUpperCase()])("refuses the application name %j", async (id) => {
      const store = createFsProfileStore(profilesDir);

      await expect(store.readApplicationFile("jane-doe", id, "job.md")).rejects.toThrow("Invalid application name");
      await expect(store.createApplication("jane-doe", id, files)).rejects.toThrow("Invalid application name");
    });

    it("makes a new folder only under a UUID, never under an old dated name", async () => {
      await expect(createFsProfileStore(profilesDir).createApplication("jane-doe", "2026-11-09-globex-dev", files)).rejects.toThrow(
        "Invalid application name",
      );
      expect(await readdir(path.join(profileDir, "applications"))).not.toContain("2026-11-09-globex-dev");
    });

    describe("deleting and renaming (F50)", () => {
      /** An application with a file in its archive/, like one whose resume was regenerated. */
      async function withArchive(store: ReturnType<typeof createFsProfileStore>, id: string) {
        await store.createApplication("jane-doe", id, files);
        await mkdir(path.join(profileDir, "applications", id, "archive", "01"), { recursive: true });
        await writeFile(path.join(profileDir, "applications", id, "archive", "01", "resume.md"), "earlier");
      }

      /** Another profile's application, reached from this profile only through a symlink. */
      async function theirs() {
        const target = path.join(profilesDir, "john-roe", "applications", OTHER);
        await mkdir(target, { recursive: true });
        await writeFile(path.join(target, "job.md"), "theirs");
        return target;
      }

      it("deletes an application's folder with everything in it, and nothing else", async () => {
        const store = createFsProfileStore(profilesDir);
        await withArchive(store, ID);
        await store.createApplication("jane-doe", OTHER, files);
        const before = await store.listApplications("jane-doe");

        await store.deleteApplication("jane-doe", ID);

        expect(await store.listApplications("jane-doe")).toEqual(before.filter((id) => id !== ID));
        expect(await readdir(path.join(profileDir, "applications"))).not.toContain(ID);
        expect(await store.readApplicationFile("jane-doe", OTHER, "job.md")).toBe(files["job.md"]);
      });

      it("deletes an old dated folder too", async () => {
        const store = createFsProfileStore(profilesDir);
        await mkdir(path.join(profileDir, "applications", "2026-11-08-globex-dev"));
        await writeFile(path.join(profileDir, "applications", "2026-11-08-globex-dev", "job.md"), "old");

        await store.deleteApplication("jane-doe", "2026-11-08-globex-dev");

        expect(await readdir(path.join(profileDir, "applications"))).not.toContain("2026-11-08-globex-dev");
      });

      it("renames a folder to a new UUID with everything in it, its archive/ included", async () => {
        const store = createFsProfileStore(profilesDir);
        const old = "2026-11-08-globex-dev";
        await mkdir(path.join(profileDir, "applications", old, "archive", "01"), { recursive: true });
        await writeFile(path.join(profileDir, "applications", old, "job.md"), "job");
        await writeFile(path.join(profileDir, "applications", old, "archive", "01", "resume.md"), "earlier");

        await store.renameApplication("jane-doe", old, ID);

        const folder = path.join(profileDir, "applications", ID);
        expect(await readdir(path.join(profileDir, "applications"))).not.toContain(old);
        expect(await readFile(path.join(folder, "job.md"), "utf8")).toBe("job");
        expect(await readFile(path.join(folder, "archive", "01", "resume.md"), "utf8")).toBe("earlier");
      });

      it("never renames over an existing folder, or to a name that isn't a UUID", async () => {
        const store = createFsProfileStore(profilesDir);
        await withArchive(store, ID);
        await mkdir(path.join(profileDir, "applications", OTHER));

        await expect(store.renameApplication("jane-doe", ID, OTHER)).rejects.toThrow(`Application ${OTHER} already exists`);
        await expect(store.renameApplication("jane-doe", ID, "2026-11-08-globex-dev")).rejects.toThrow("Invalid application name");
        await expect(store.renameApplication("jane-doe", ID, "../x")).rejects.toThrow("Invalid application name");
        expect(await readFile(path.join(profileDir, "applications", ID, "archive", "01", "resume.md"), "utf8")).toBe("earlier");
      });

      it.each(["../../john-roe/applications/x", `../${ID}`, "jane-doe", ""])("refuses the application name %j", async (id) => {
        const store = createFsProfileStore(profilesDir);

        await expect(store.deleteApplication("jane-doe", id)).rejects.toThrow("Invalid application name");
        await expect(store.renameApplication("jane-doe", id, OTHER)).rejects.toThrow("Invalid application name");
      });

      it("refuses an application that doesn't exist, and another profile's name", async () => {
        const store = createFsProfileStore(profilesDir);

        await expect(store.deleteApplication("jane-doe", ID)).rejects.toThrow(`Application ${ID} doesn't exist`);
        await expect(store.renameApplication("jane-doe", ID, OTHER)).rejects.toThrow(`Application ${ID} doesn't exist`);
        await expect(store.deleteApplication("../john-roe", ID)).rejects.toThrow("Invalid profile name");
      });

      it("never follows a symlinked application folder into another profile", async () => {
        const store = createFsProfileStore(profilesDir);
        const target = await theirs();
        await symlink(target, path.join(profileDir, "applications", OTHER));

        await expect(store.deleteApplication("jane-doe", OTHER)).rejects.toThrow("doesn't exist");
        await expect(store.renameApplication("jane-doe", OTHER, ID)).rejects.toThrow("doesn't exist");
        expect(await readFile(path.join(target, "job.md"), "utf8")).toBe("theirs");
      });

      it("never follows a symlinked applications folder into another profile", async () => {
        const store = createFsProfileStore(profilesDir);
        const target = await theirs();
        await rm(path.join(profileDir, "applications"), { recursive: true, force: true });
        await symlink(path.dirname(target), path.join(profileDir, "applications"));

        await expect(store.deleteApplication("jane-doe", OTHER)).rejects.toThrow("doesn't exist");
        await expect(store.renameApplication("jane-doe", OTHER, ID)).rejects.toThrow("doesn't exist");
        expect(await readdir(path.dirname(target))).toEqual([OTHER]);
      });
    });
  });
});
