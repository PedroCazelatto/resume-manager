import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFsProfileStore, type ProfileStore } from "@/adapters/profile-store";
import { createFsTemplateStore } from "@/adapters/template-store";
import { LlmError, type LlmClient, type LlmRequest } from "@/core/llm";
import { parseFrontmatter, stringifyFrontmatter } from "@/core/markdown/frontmatter";
import { contentYaml } from "@/core/resume/edit";
import { resumeFixture } from "@/core/resume/fixture.testing";
import type { ResumeFile } from "@/core/resume/schema";
import type { Failure, Verification } from "@/core/verification/schema";
import { decideInference, previewResume, saveResume, setFailureDismissed, verifyResume } from "./actions";

// The actions run against a scratch copy of the fictional profile (Art. III.5); the
// cookie, the cache and the model are replaced.
const app = vi.hoisted(() => ({
  profilesDir: "",
  templatesDir: "",
  selected: "jane-doe" as string | null,
  reply: { unsupported: [] } as unknown,
  requests: [] as unknown[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/profiles", () => ({
  profileStore: () => createFsProfileStore(app.profilesDir),
  readSelectedProfile: async () => app.selected,
}));
vi.mock("@/app/templates", () => ({ templateStore: () => createFsTemplateStore(app.templatesDir) }));
vi.mock("@/app/llm", () => ({
  llmClient: (): LlmClient => ({
    model: "fake-model",
    async generate<T>(request: LlmRequest<T>): Promise<T> {
      app.requests.push(request);
      if (app.reply instanceof Error) throw app.reply;
      return request.schema.parse(app.reply);
    },
  }),
}));

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
    id = await store.createApplication("jane-doe", "2026-11-10-globex-backend-engineer", {
      "job.md": "---\nsource: paste\n---\nGlobex is hiring.\n",
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
    app.reply = { unsupported: [] };
    app.requests = [];
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

  describe("verifyResume", () => {
    it("runs both checks, replaces the failures and marks a clean resume ready", async () => {
      const stale = { ...verification([unsupported]), review: { ...verification().review!, current: false } };
      await application({ resume: { ...resume(), inferences: [] }, verification: stale });

      expect(await verifyResume(id)).toEqual({ ok: true });

      expect(app.requests).toHaveLength(1);
      expect(await read("verification.md")).toMatchObject({ review: { current: true }, failures: [] });
      expect(await read("resume.md")).toMatchObject({ status: "ready" });
    });

    it("keeps a dismissal when the model flags the same claim again", async () => {
      await application({ verification: verification([{ ...unsupported, dismissed: true }]) });
      app.reply = { unsupported: [{ id: unsupported.where, problem: "Still not stated." }] };

      await verifyResume(id);

      expect((await read("verification.md")).failures).toEqual([
        { ...unsupported, problem: "Still not stated.", dismissed: true },
      ]);
    });

    it("reports a model failure and leaves the files as they were", async () => {
      await application({ verification: verification([unsupported]) });
      app.reply = new LlmError("unreachable", "Can't reach Ollama.");

      expect(await verifyResume(id)).toEqual({ ok: false, problems: ["Can't reach Ollama."] });
      expect((await read("verification.md")).failures).toEqual([unsupported]);
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
      await expect(verifyResume("2026-11-10-initech-developer")).rejects.toThrow("no resume yet");
    });
  });
});
