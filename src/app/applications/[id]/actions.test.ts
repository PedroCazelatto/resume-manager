import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFsProfileStore, type ProfileStore } from "@/adapters/profile-store";
import { createFsTemplateStore } from "@/adapters/template-store";
import { parseFrontmatter, stringifyFrontmatter } from "@/core/markdown/frontmatter";
import { contentYaml } from "@/core/resume/edit";
import { resumeFixture } from "@/core/resume/fixture.testing";
import type { ResumeFile } from "@/core/resume/schema";
import type { Failure, Verification } from "@/core/verification/schema";
import { addSkillToProfile, decideInference, previewResume, saveResume, setFailureDismissed } from "./actions";

// The actions run against a scratch copy of the fictional profile (Art. III.5); the
// cookie and the cache are replaced.
const app = vi.hoisted(() => ({
  profilesDir: "",
  templatesDir: "",
  selected: "jane-doe" as string | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/profiles", () => ({
  profileStore: () => createFsProfileStore(app.profilesDir),
  readSelectedProfile: async () => app.selected,
}));
vi.mock("@/app/templates", () => ({ templateStore: () => createFsTemplateStore(app.templatesDir) }));

const ACME = "experience/2023-01-acme-senior-developer.md";
const INITECH = "experience/2019-03-initech-software-developer.md";

// The example profile's summary.md holds goals only, so the summary cites an experience file.
function content() {
  return { ...resumeFixture(), summary_sources: [INITECH] };
}
const TEMPLATE =
  '<script type="text/markdown" id="rules">- Summary: three sentences.</script><h1>{{name}}</h1><p>{{summary}}</p>{{#each skills}}{{#each items}}<i>{{this}}</i>{{/each}}{{/each}}';

const unsupported: Failure = {
  check: "review",
  where: "experience[0].bullets[0]",
  claim: "Cut p95 API latency from 800 ms to 120 ms.",
  problem: "The file says it was done by redesigning the caching layer.",
  dismissed: false,
};

function resume(): ResumeFile {
  return {
    ...content(),
    generated_at: "2026-11-10T10:05:00.000Z",
    model: "fake-model",
    template: "ireland",
    language: "en",
    status: "draft",
    inferences: [{ skill: "Kubernetes", sources: [ACME], reason: "EKS is managed Kubernetes.", status: "pending" }],
  };
}

function verification(failures: Failure[] = []): Verification {
  return {
    checked_at: "2026-11-10T10:06:00.000Z",
    review: { reviewed_at: "2026-11-10T10:09:00.000Z", model: "fake-model", current: true },
    failures,
  };
}

describe("application actions", () => {
  let store: ProfileStore;
  let id: string;

  /** Creates an application; resume.md also carries a field the app doesn't know (Art. IV.7). */
  async function application(files: { resume?: ResumeFile; verification?: Verification | null } = {}) {
    id = "3f2b8c1e-5a7d-4c9e-9b1a-2d6e8f0c4a73";
    await store.createApplication("jane-doe", id, {
      "job.md": "---\nurl: https://jobs.example.com/1\nsource: jobs.example.com\n---\nGlobex is hiring.\n",
      "resume.md": stringifyFrontmatter({ ...(files.resume ?? resume()), my_note: "keep me" }),
      ...(files.verification === null
        ? {}
        : { "verification.md": stringifyFrontmatter(files.verification ?? verification()) }),
    });
  }

  async function read(file: "resume.md" | "verification.md") {
    const source = await store.readApplicationFile("jane-doe", id, file);
    const parsed = parseFrontmatter(source ?? "");
    if (!parsed.ok) throw new Error(`${file}: ${parsed.problem}`);
    return parsed.data as Record<string, unknown> & { failures: Failure[]; inferences: ResumeFile["inferences"] };
  }

  beforeEach(async () => {
    const root = await mkdtemp(path.join(tmpdir(), "resume-actions-"));
    app.profilesDir = path.join(root, "profiles");
    app.templatesDir = path.join(root, "templates");
    app.selected = "jane-doe";
    await cp(path.resolve("example-profiles/jane-doe"), path.join(app.profilesDir, "jane-doe"), {
      recursive: true,
      filter: (source) => !source.includes(`${path.sep}applications`),
    });
    await mkdir(app.templatesDir);
    await writeFile(path.join(app.templatesDir, "ireland.html"), TEMPLATE);
    store = createFsProfileStore(app.profilesDir);
  });

  afterEach(async () => {
    await rm(path.dirname(app.profilesDir), { recursive: true, force: true });
  });

  describe("decideInference", () => {
    it("approves an implied skill and marks a verified resume ready", async () => {
      await application();

      await decideInference(id, "Kubernetes", "approved");

      expect(await read("resume.md")).toMatchObject({
        status: "ready",
        inferences: [{ skill: "Kubernetes", status: "approved" }],
        my_note: "keep me",
      });
    });

    it("keeps the resume a draft while a failed check is open", async () => {
      await application({ verification: verification([unsupported]) });
      await decideInference(id, "Kubernetes", "rejected");
      expect(await read("resume.md")).toMatchObject({ status: "draft", inferences: [{ status: "rejected" }] });
    });

    it("refuses a skill that isn't an implied skill of this resume", async () => {
      await application();

      await expect(decideInference(id, "Go", "approved")).rejects.toThrow("Unknown implied skill");
    });
  });

  describe("addSkillToProfile", () => {
    const approved = (): ResumeFile => ({ ...resume(), inferences: [{ ...resume().inferences[0], status: "approved" }] });
    const profileDir = () => path.join(app.profilesDir, "jane-doe");
    const skillsFile = () => readFile(path.join(profileDir(), "skills.md"), "utf8");

    /** Every file of the profile except skills.md and the applications, with its content. */
    async function otherFiles() {
      const files: Record<string, string> = {};
      for (const entry of await readdir(profileDir(), { recursive: true, withFileTypes: true })) {
        const file = path.relative(profileDir(), path.join(entry.parentPath, entry.name));
        if (!entry.isFile() || file === "skills.md" || file.startsWith("applications")) continue;
        files[file] = await readFile(path.join(profileDir(), file), "utf8");
      }
      return files;
    }

    const STALE = { ok: false, problems: ["Your profile or this resume changed. Reload the page."] };
    const under = (heading: string) => ({ heading, isNew: false });
    const inNew = (heading: string) => ({ heading, isNew: true });

    it("adds one bullet under the chosen heading and touches no other file", async () => {
      await application({ resume: approved() });
      const [before, others, resumeBefore] = [await skillsFile(), await otherFiles(), await read("resume.md")];
      // A second profile that must stay out of reach (Art. III.7).
      await cp(profileDir(), path.join(app.profilesDir, "john-roe"), { recursive: true });

      expect(await addSkillToProfile(id, "Kubernetes", under("Languages"))).toEqual({ ok: true });

      expect(await skillsFile()).toBe(before.replace("- SQL\n", "- SQL\n- Kubernetes\n"));
      expect(await otherFiles()).toEqual(others);
      expect(await read("resume.md")).toEqual(resumeBefore);
      expect(await readFile(path.join(app.profilesDir, "john-roe", "skills.md"), "utf8")).toBe(before);
      expect((await store.loadProfile("jane-doe")).ok).toBe(true);
    });

    it("adds the bullet under another heading than the resume's category when the user chose it", async () => {
      await application({ resume: approved() });
      const before = await skillsFile();

      expect(await addSkillToProfile(id, "Kubernetes", under("Cloud and infrastructure"))).toEqual({ ok: true });

      expect(await skillsFile()).toBe(before.replace("- Docker\n", "- Docker\n- Kubernetes\n"));
    });

    it("adds a new section at the end, under the name the user gave it", async () => {
      await application({ resume: approved() });
      const before = await skillsFile();

      expect(await addSkillToProfile(id, "Kubernetes", inNew("Orquestração"))).toEqual({ ok: true });

      expect(await skillsFile()).toBe(`${before}\n## Orquestração\n- Kubernetes\n`);
    });

    it("doesn't add the skill twice", async () => {
      await application({ resume: approved() });
      await addSkillToProfile(id, "Kubernetes", under("Languages"));
      const once = await skillsFile();

      expect(await addSkillToProfile(id, "Kubernetes", under("Languages"))).toEqual(STALE);
      expect(await addSkillToProfile(id, "Kubernetes", inNew("Tools"))).toEqual(STALE);
      expect(await skillsFile()).toBe(once);
    });

    it("writes nothing for a skill a bullet of skills.md already holds", async () => {
      // The example profile lists `AWS (Lambda, RDS, SQS)`.
      const lambda = { ...resume().inferences[0], skill: "Lambda", status: "approved" as const };
      await application({ resume: { ...resume(), skills: [{ category: "Data", items: ["Lambda"] }], inferences: [lambda] } });
      const before = await skillsFile();

      expect(await addSkillToProfile(id, "Lambda", under("Data"))).toEqual(STALE);
      expect(await skillsFile()).toBe(before);
    });

    it.each(["pending", "rejected"] as const)("writes nothing for a %s skill", async (status) => {
      await application({ resume: { ...resume(), inferences: [{ ...resume().inferences[0], status }] } });
      const before = await skillsFile();

      expect(await addSkillToProfile(id, "Kubernetes", under("Languages"))).toMatchObject({ ok: false });
      expect(await skillsFile()).toBe(before);
    });

    it("writes nothing for a skill that isn't implied", async () => {
      await application({ resume: approved() });
      const before = await skillsFile();

      expect(await addSkillToProfile(id, "Go", under("Languages"))).toEqual(STALE);
      expect(await skillsFile()).toBe(before);
    });

    it("writes nothing when the chosen heading is no longer in skills.md", async () => {
      await application({ resume: approved() });
      // The file changed after the confirmation was opened.
      const renamed = (await skillsFile()).replace("## Data", "## Databases");
      await writeFile(path.join(profileDir(), "skills.md"), renamed);

      expect(await addSkillToProfile(id, "Kubernetes", under("Data"))).toEqual(STALE);
      expect(await addSkillToProfile(id, "Kubernetes", under("Tools"))).toEqual(STALE);
      expect(await skillsFile()).toBe(renamed);
    });

    it("writes nothing for a new section without a name or named like an existing heading", async () => {
      await application({ resume: approved() });
      const before = await skillsFile();

      expect(await addSkillToProfile(id, "Kubernetes", inNew("  "))).toEqual(STALE);
      expect(await addSkillToProfile(id, "Kubernetes", inNew("data"))).toEqual(STALE);
      expect(await addSkillToProfile(id, "Kubernetes", inNew("Tools\n## More"))).toEqual(STALE);
      expect(await skillsFile()).toBe(before);
    });

    it("writes nothing when the profile has problems", async () => {
      await application({ resume: approved() });
      await writeFile(path.join(profileDir(), "personal.md"), "---\n---\n");
      const before = await skillsFile();

      expect(await addSkillToProfile(id, "Kubernetes", under("Languages"))).toMatchObject({ ok: false });
      expect(await skillsFile()).toBe(before);
    });
  });

  describe("setFailureDismissed", () => {
    const decided = () => ({ ...resume(), inferences: [] });

    it("dismisses a failure, then restores it, updating the status each time", async () => {
      await application({ resume: decided(), verification: verification([unsupported]) });

      await setFailureDismissed(id, 0, unsupported.where, true);
      expect((await read("verification.md")).failures).toMatchObject([{ dismissed: true }]);
      expect(await read("resume.md")).toMatchObject({ status: "ready", my_note: "keep me" });

      await setFailureDismissed(id, 0, unsupported.where, false);
      expect((await read("verification.md")).failures).toMatchObject([{ dismissed: false }]);
      expect(await read("resume.md")).toMatchObject({ status: "draft" });
    });

    it("refuses when the page is older than the file", async () => {
      await application({ resume: decided(), verification: verification([unsupported]) });

      await expect(setFailureDismissed(id, 0, "summary", true)).rejects.toThrow("Reload the page");
      await expect(setFailureDismissed(id, 3, unsupported.where, true)).rejects.toThrow("Reload the page");
      expect((await read("verification.md")).failures).toMatchObject([{ dismissed: false }]);
    });
  });

  describe("previewResume", () => {
    it("renders edited content without saving it", async () => {
      await application();
      const edited = { ...content(), summary: "Edited <summary>." };

      const result = await previewResume(id, contentYaml(edited));

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      expect(result.html).toContain("<p>Edited &lt;summary&gt;.</p>");
      // The pending implied skill stays out of the preview (Art. II.3).
      expect(result.html).not.toContain("Kubernetes");
      expect((await read("resume.md")).summary).toBe("Backend developer since 2019.");
    });

    it("reports content that doesn't fit the resume schema", async () => {
      await application();

      expect(await previewResume(id, "name: Jane Doe\n")).toMatchObject({ ok: false });
    });
  });

  describe("saveResume", () => {
    it("saves the content, checks it again and sends the resume back to draft", async () => {
      await application({ resume: { ...resume(), inferences: [], status: "ready" } });
      const edited = { ...content(), summary: "Backend developer with 7 years of experience." };

      expect(await saveResume(id, contentYaml(edited))).toEqual({ ok: true });

      expect(await read("resume.md")).toMatchObject({
        summary: "Backend developer with 7 years of experience.",
        status: "draft",
        generated_at: "2026-11-10T10:05:00.000Z",
        my_note: "keep me",
      });
      expect(await read("verification.md")).toMatchObject({
        review: { current: false },
        failures: [{ check: "deterministic", where: "summary", problem: `the number 7 isn't in ${INITECH}` }],
      });
    });

    it("starts verification.md when the run never verified the resume", async () => {
      await application({ verification: null });

      expect(await saveResume(id, contentYaml(content()))).toEqual({ ok: true });

      const saved = await read("verification.md");
      expect(saved.failures).toEqual([]);
      expect(saved).not.toHaveProperty("review");
    });

    it("saves nothing when the content is invalid", async () => {
      await application();

      const result = await saveResume(id, "name: Jane Doe\nsummary: [unclosed\n");

      expect(result.ok).toBe(false);
      expect((await read("resume.md")).summary).toBe("Backend developer since 2019.");
    });
  });

  describe("every action", () => {
    it("refuses an invalid application name", async () => {
      await expect(decideInference("../../other", "Kubernetes", "approved")).rejects.toThrow("Invalid application name");
      await expect(saveResume("jane-doe", contentYaml(content()))).rejects.toThrow("Invalid application name");
    });

    it("needs a selected profile and an existing resume", async () => {
      await application();
      app.selected = null;
      await expect(decideInference(id, "Kubernetes", "approved")).rejects.toThrow("Choose a profile first.");

      app.selected = "jane-doe";
      await expect(decideInference("2026-11-10-initech-developer", "Kubernetes", "approved")).rejects.toThrow(
        "no resume yet",
      );
    });
  });
});
