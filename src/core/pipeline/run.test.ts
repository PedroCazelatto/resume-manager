import { describe, expect, it } from "vitest";
import type { ApplicationFile } from "../application/folder";
import { LlmError, type LlmClient, type LlmRequest } from "../llm";
import { parseFrontmatter, patchFrontmatter } from "../markdown/frontmatter";
import { assembleProfile, type Profile, type SourceFile } from "../profile/profile";
import { resumeFixture } from "../resume/fixture.testing";
import type { ResumeContent } from "../resume/schema";
import { parseTemplate } from "../template/template";
import { runApplication, type ApplicationFiles, type RunEvent, type RunInput } from "./run";
import { verifyApplication } from "./verify";

const ACME = "experience/2023-01-acme-senior-developer.md";
const ID = "2026-11-10-globex-backend-engineer";

const sources: SourceFile[] = [
  {
    file: "personal.md",
    source:
      "---\nname: Jane Doe\nemail: jane.doe@example.com\nphone: '+353 87 000 0000'\nlocation: { city: Dublin, country: Ireland }\nwork_authorisation: Stamp 4\nlinks: [{ label: Portfolio, url: 'https://jane-doe.example.com' }]\n---\n",
  },
  { file: "summary.md", source: "---\n---\nBackend developer since 2019.\n" },
  { file: "skills.md", source: "---\n---\n## Languages\n- TypeScript\n- Python\n" },
  { file: "languages.md", source: "---\nlanguages: [{ name: English, level: C1 }]\n---\n" },
  {
    file: ACME,
    source:
      "---\ncompany: Acme\nrole: Senior Developer\nstart: 2023-01\nend: present\n---\n- Cut p95 API latency from 800 ms to 120 ms.\n- Deployed the new services to Amazon EKS.\n",
  },
  {
    file: "education/2015-usp-bsc-computer-science.md",
    source: "---\ninstitution: Universidade de São Paulo\ndegree: Bachelor of Science\nstart: 2015-02\nend: 2018-12\n---\n",
  },
  {
    file: "certifications/2024-06-aws-solutions-architect.md",
    source: "---\nname: AWS Certified Solutions Architect – Associate\nissuer: Amazon Web Services\ndate: 2024-06\n---\n",
  },
];

function profile(): Profile {
  const result = assembleProfile(sources);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.profile;
}

const analysisReply = {
  company: "Globex",
  role: "Backend Engineer",
  location: "Dublin, Ireland",
  language: "en",
  requirements: [{ text: "TypeScript", importance: "must-have", status: "matched", sources: ["skills.md"], note: "Listed." }],
  keywords: ["TypeScript"],
};

function tailorReply(inferences: unknown[] = []) {
  const content: Omit<ResumeContent, "name" | "contact"> & Partial<ResumeContent> = resumeFixture();
  delete content.name;
  delete content.contact;
  return { ...content, inferences };
}

const kubernetes = { skill: "Kubernetes", sources: [ACME], reason: "EKS is managed Kubernetes." };

/** Answers each model call with the next reply; an Error reply fails that call. */
function fakeLlm(replies: unknown[]) {
  const requests: LlmRequest<unknown>[] = [];
  const llm: LlmClient = {
    model: "fake-model",
    async generate<T>(request: LlmRequest<T>): Promise<T> {
      requests.push(request as LlmRequest<unknown>);
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      request.onProgress?.({ phase: "thinking", tokens: 12 });
      return request.schema.parse(reply);
    },
  };
  return { llm, requests };
}

function memoryFiles() {
  const saved = new Map<string, string>();
  const files: ApplicationFiles = {
    async create(baseName, initial) {
      for (const [file, content] of Object.entries(initial)) saved.set(`${baseName}/${file}`, content);
      return baseName;
    },
    async read(id, file) {
      return saved.get(`${id}/${file}`) ?? null;
    },
    async add(id, file, content) {
      if (saved.has(`${id}/${file}`)) throw new Error(`${file} already exists`);
      saved.set(`${id}/${file}`, content);
    },
    async replace(id, file, content) {
      saved.set(`${id}/${file}`, content);
    },
  };
  const data = (file: ApplicationFile) => {
    const parsed = parseFrontmatter(saved.get(`${ID}/${file}`) ?? "");
    if (!parsed.ok) throw new Error(`${file}: ${parsed.problem}`);
    return parsed;
  };
  return { files, saved, data };
}

const TEMPLATE =
  '<meta name="max-pages" content="1"><script type="text/markdown" id="rules">- Summary: three sentences.</script><h1>{{name}}</h1>';

function input(overrides: Partial<RunInput> & Pick<RunInput, "llm" | "files">): { run: RunInput; events: RunEvent[] } {
  const events: RunEvent[] = [];
  const run: RunInput = {
    profile: profile(),
    loadTemplate: async (country) => parseTemplate(country, `templates/${country}.html`, TEMPLATE),
    template: "ireland",
    start: { posting: "Globex is hiring." },
    language: null,
    now: () => new Date("2026-11-10T10:00:00.000Z"),
    today: () => "2026-11-10",
    send: (event) => events.push(event),
    ...overrides,
  };
  return { run, events };
}

const steps = (events: RunEvent[]) =>
  events.filter((e) => e.type !== "progress").map((e) => (e.type === "step" ? `${e.step}:${e.status}` : e.type));

describe("runApplication", () => {
  it("runs every step, saves each output and marks a clean resume ready", async () => {
    const { llm, requests } = fakeLlm([analysisReply, tailorReply(), { unsupported: [] }]);
    const { files, saved, data } = memoryFiles();
    const { run, events } = input({ llm, files });

    expect(await runApplication(run)).toBe(ID);

    expect(requests).toHaveLength(3);
    expect([...saved.keys()].sort()).toEqual(
      ["analysis.md", "job.md", "resume.md", "verification.md"].map((file) => `${ID}/${file}`),
    );
    expect(data("job.md").body).toBe("Globex is hiring.\n");
    expect(data("resume.md").data).toMatchObject({ status: "ready", language: "en", template: "ireland" });
    expect(data("verification.md").data).toMatchObject({ review: { current: true }, failures: [] });
    expect(steps(events)).toEqual([
      "analyse:running",
      "analyse:done",
      "save:running",
      "save:done",
      "saved",
      "tailor:running",
      "tailor:done",
      "check:running",
      "check:done",
      "review:running",
      "review:done",
      "done",
    ]);
  });

  it("passes on the model's progress with the step it belongs to", async () => {
    const { llm } = fakeLlm([analysisReply, tailorReply(), { unsupported: [] }]);
    const { run, events } = input({ llm, files: memoryFiles().files });

    await runApplication(run);

    expect(events.filter((e) => e.type === "progress")).toEqual(
      ["analyse", "tailor", "review"].map((step) => ({ type: "progress", step, phase: "thinking", tokens: 12 })),
    );
  });

  it("leaves the resume a draft when a check fails or a skill is pending", async () => {
    const reply = tailorReply([kubernetes]);
    reply.summary = "Backend developer with 7 years of experience.";
    const { llm } = fakeLlm([analysisReply, reply, { unsupported: [{ id: "summary", problem: "Not stated." }] }]);
    const { files, data } = memoryFiles();

    await runApplication(input({ llm, files }).run);

    expect(data("resume.md").data).toMatchObject({ status: "draft" });
    expect(data("verification.md").data.failures).toMatchObject([
      { check: "deterministic", where: "summary" },
      { check: "review", where: "summary", problem: "Not stated." },
    ]);
  });

  it("writes the resume in the chosen language instead of the posting's (F14)", async () => {
    const { llm, requests } = fakeLlm([analysisReply, tailorReply(), { unsupported: [] }]);
    const { files, data } = memoryFiles();

    await runApplication(input({ llm, files, language: "pt" }).run);

    expect(data("resume.md").data.language).toBe("pt");
    expect(requests[1].system).toContain("Portuguese (pt)");
  });

  it("stops with a clear message when the template is missing, keeping the analysis (Art. VII.4)", async () => {
    const { llm, requests } = fakeLlm([analysisReply]);
    const { files, saved } = memoryFiles();
    const { run, events } = input({
      llm,
      files,
      loadTemplate: async () => ({ ok: false, error: { file: "templates/ireland.html", problems: ["file is missing"] } }),
    });

    await expect(runApplication(run)).rejects.toThrow("templates/ireland.html isn't ready: file is missing");

    expect(requests).toHaveLength(1);
    expect([...saved.keys()].sort()).toEqual([`${ID}/analysis.md`, `${ID}/job.md`]);
    expect(events).toContainEqual({ type: "saved", id: ID });
  });

  describe("trying again (F19)", () => {
    it("continues after a failed tailor step without analysing again", async () => {
      const { files, saved, data } = memoryFiles();
      const first = fakeLlm([analysisReply, new LlmError("timeout", "The model took too long.")]);
      await expect(runApplication(input({ llm: first.llm, files }).run)).rejects.toThrow("took too long");

      const second = fakeLlm([tailorReply(), { unsupported: [] }]);
      const { run, events } = input({ llm: second.llm, files, start: { id: ID }, language: "pt" });
      await runApplication(run);

      expect(second.requests).toHaveLength(2);
      expect(second.requests[0].prompt).toContain("<posting>\nGlobex is hiring.\n</posting>");
      expect(data("resume.md").data).toMatchObject({ status: "ready", language: "pt" });
      expect(saved.has(`${ID}/verification.md`)).toBe(true);
      expect(steps(events)).toEqual([
        "analyse:done",
        "save:done",
        "saved",
        "tailor:running",
        "tailor:done",
        "check:running",
        "check:done",
        "review:running",
        "review:done",
        "done",
      ]);
    });

    it("continues after a failed review without writing the resume again", async () => {
      const { files, saved, data } = memoryFiles();
      const first = fakeLlm([analysisReply, tailorReply(), new LlmError("unreachable", "Ollama is not running.")]);
      await expect(runApplication(input({ llm: first.llm, files }).run)).rejects.toThrow("not running");
      const resume = saved.get(`${ID}/resume.md`);

      const second = fakeLlm([{ unsupported: [{ id: "summary", problem: "Not stated." }] }]);
      await runApplication(input({ llm: second.llm, files, start: { id: ID } }).run);

      expect(second.requests).toHaveLength(1);
      expect(saved.get(`${ID}/resume.md`)).toBe(resume);
      expect(data("verification.md").data.failures).toMatchObject([{ check: "review", where: "summary" }]);
    });

    it("keeps fields it doesn't know in an edited resume.md when it sets the status", async () => {
      const { files, saved, data } = memoryFiles();
      const first = fakeLlm([analysisReply, tailorReply(), new LlmError("timeout", "The model took too long.")]);
      await expect(runApplication(input({ llm: first.llm, files }).run)).rejects.toThrow();
      saved.set(`${ID}/resume.md`, saved.get(`${ID}/resume.md`)!.replace("---\n", "---\nmy_note: keep me\n"));

      await runApplication(input({ llm: fakeLlm([{ unsupported: [] }]).llm, files, start: { id: ID } }).run);

      expect(data("resume.md").data).toMatchObject({ status: "ready", my_note: "keep me" });
    });

    it("calls no model when every step's output exists", async () => {
      const { files } = memoryFiles();
      await runApplication(input({ llm: fakeLlm([analysisReply, tailorReply(), { unsupported: [] }]).llm, files }).run);

      const again = fakeLlm([]);
      const { run, events } = input({ llm: again.llm, files, start: { id: ID } });
      await runApplication(run);

      expect(again.requests).toHaveLength(0);
      expect(events.at(-1)).toEqual({ type: "done", id: ID });
    });

    it("reports a saved file it can't continue from", async () => {
      const { files, saved } = memoryFiles();
      await runApplication(input({ llm: fakeLlm([analysisReply, tailorReply(), { unsupported: [] }]).llm, files }).run);
      saved.set(`${ID}/job.md`, "---\ncompany: Globex\n---\nGlobex is hiring.\n");

      await expect(runApplication(input({ llm: fakeLlm([]).llm, files, start: { id: ID } }).run)).rejects.toThrow(
        "job.md has problems: source:",
      );
    });

    it("refuses an application without a saved posting", async () => {
      const { files } = memoryFiles();

      await expect(runApplication(input({ llm: fakeLlm([]).llm, files, start: { id: ID } }).run)).rejects.toThrow(
        "no saved posting and analysis",
      );
    });
  });
});

describe("verifyApplication", () => {
  const flagged = { unsupported: [{ id: "summary", problem: "Not stated." }] };
  const now = () => new Date("2026-11-11T09:00:00.000Z");

  /** An application whose review flagged the summary, so the resume is a draft. */
  async function application() {
    const memory = memoryFiles();
    await runApplication(input({ llm: fakeLlm([analysisReply, tailorReply(), flagged]).llm, files: memory.files }).run);
    return memory;
  }

  it("runs both checks, replaces the failures and marks a clean resume ready", async () => {
    const { files, saved, data } = await application();
    saved.set(`${ID}/resume.md`, saved.get(`${ID}/resume.md`)!.replace("---\n", "---\nmy_note: keep me\n"));
    const { llm, requests } = fakeLlm([{ unsupported: [] }]);
    const events: RunEvent[] = [];

    expect(await verifyApplication({ llm, profile: profile(), files, id: ID, now, send: (e) => events.push(e) })).toBe(ID);

    expect(requests).toHaveLength(1);
    expect(data("verification.md").data).toMatchObject({
      checked_at: "2026-11-11T09:00:00.000Z",
      review: { current: true },
      failures: [],
    });
    expect(data("resume.md").data).toMatchObject({ status: "ready", my_note: "keep me" });
    expect(steps(events)).toEqual(["check:running", "check:done", "review:running", "review:done", "done"]);
    expect(events).toContainEqual({ type: "progress", step: "review", phase: "thinking", tokens: 12 });
  });

  it("keeps a dismissal when the model flags the same claim again", async () => {
    const { files, saved, data } = await application();
    const failures = (data("verification.md").data.failures as object[]).map((f) => ({ ...f, dismissed: true }));
    saved.set(`${ID}/verification.md`, patchFrontmatter(saved.get(`${ID}/verification.md`)!, { failures }));
    const llm = fakeLlm([{ unsupported: [{ id: "summary", problem: "Still not stated." }] }]).llm;

    await verifyApplication({ llm, profile: profile(), files, id: ID, now, send: () => {} });

    expect(data("verification.md").data.failures).toMatchObject([
      { check: "review", where: "summary", problem: "Still not stated.", dismissed: true },
    ]);
  });

  it("starts verification.md when the run never verified the resume", async () => {
    const { files, saved, data } = await application();
    saved.delete(`${ID}/verification.md`);

    await verifyApplication({ llm: fakeLlm([flagged]).llm, profile: profile(), files, id: ID, now, send: () => {} });

    expect(data("verification.md").data.failures).toMatchObject([{ check: "review", where: "summary" }]);
    expect(data("resume.md").data).toMatchObject({ status: "draft" });
  });

  it("fails with the model's error and leaves the files as they were", async () => {
    const { files, saved } = await application();
    const before = new Map(saved);
    const llm = fakeLlm([new LlmError("unreachable", "Can't reach Ollama.")]).llm;

    await expect(verifyApplication({ llm, profile: profile(), files, id: ID, now, send: () => {} })).rejects.toThrow(
      "Can't reach Ollama.",
    );
    expect(saved).toEqual(before);
  });

  it("refuses an application without a resume", async () => {
    const { files } = memoryFiles();
    const { llm, requests } = fakeLlm([]);

    await expect(verifyApplication({ llm, profile: profile(), files, id: ID, now, send: () => {} })).rejects.toThrow(
      "no resume yet",
    );
    expect(requests).toHaveLength(0);
  });
});
