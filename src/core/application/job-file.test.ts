import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../markdown/frontmatter";
import { validateMarkdownFile } from "../markdown/validate";
import { fetchedJobFile, hasPostingText, newJobFile, pastedJobFile } from "./job-file";
import { jobSchema } from "./schemas";

const FILE = "applications/3f2b8c1e-5a7d-4c9e-9b1a-2d6e8f0c4a73/job.md";
const LINK = "https://www.linkedin.com/jobs/search/?currentJobId=4321987650";
const PAGE = "https://www.linkedin.com/jobs/view/4321987650";
const AT = "2026-11-21T20:45:00.000Z";

const fields = (source: string) => {
  const parsed = parseFrontmatter(source);
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed;
};

const valid = (source: string) => validateMarkdownFile(jobSchema, FILE, source).ok;

describe("newJobFile (F50)", () => {
  it("holds the link and its platform, and no text yet", () => {
    const job = newJobFile("https://www.jobs.example.com/1");

    expect(fields(job)).toEqual({ ok: true, data: { url: "https://www.jobs.example.com/1", source: "jobs.example.com" }, body: "" });
    expect(valid(job)).toBe(true);
    expect(hasPostingText(fields(job).body)).toBe(false);
  });

  it("holds pasted text as the body, with when it arrived", () => {
    const job = newJobFile("https://ie.indeed.com/viewjob?jk=1", { posting: "Globex is hiring.", at: AT });

    expect(fields(job)).toEqual({
      ok: true,
      data: { url: "https://ie.indeed.com/viewjob?jk=1", source: "Indeed", fetched_at: AT },
      body: "Globex is hiring.\n",
    });
    expect(valid(job)).toBe(true);
  });
});

describe("fetchedJobFile (F50)", () => {
  it("writes the address the text was read from, its platform, the page's details, fetched_at and the text", () => {
    const changed = fetchedJobFile(
      newJobFile(LINK),
      FILE,
      { posting: "We build payment systems.", url: PAGE, details: { title: "Backend Engineer", company: "Globex", work_model: "remote", hours: undefined } },
      AT,
    );
    if (!changed.ok) throw new Error(changed.error.problems.join());

    expect(fields(changed.source)).toEqual({
      ok: true,
      data: { url: PAGE, source: "LinkedIn", title: "Backend Engineer", company: "Globex", work_model: "remote", fetched_at: AT },
      body: "We build payment systems.\n",
    });
    expect(valid(changed.source)).toBe(true);
  });

  it("keeps every other field, archived_at and an unknown one included (Art. IV.7)", () => {
    const source = "---\nurl: https://jobs.example.com/1\nsource: jobs.example.com\narchived_at: 2026-11-21T10:00:00.000Z\nmy_note: keep me\n---\n";

    const changed = fetchedJobFile(source, FILE, { posting: "Text.", url: "https://jobs.example.com/1" }, AT);

    expect(changed.ok && fields(changed.source).data).toEqual({
      url: "https://jobs.example.com/1",
      source: "jobs.example.com",
      archived_at: "2026-11-21T10:00:00.000Z",
      my_note: "keep me",
      fetched_at: AT,
    });
  });

  it("reports a job.md that isn't valid, and never rewrites it (Art. IV.6)", () => {
    expect(fetchedJobFile("---\nsource: jobs.example.com\n---\n", FILE, { posting: "Text.", url: "https://jobs.example.com/1" }, AT)).toEqual({
      ok: false,
      error: { file: FILE, problems: ["url: is required"] },
    });
  });
});

describe("pastedJobFile (F50)", () => {
  it("writes the text as the body and when it arrived, keeping every other field, the link included", () => {
    const source = "---\nurl: https://ie.indeed.com/viewjob?jk=1\nsource: Indeed\nmy_note: keep me\n---\n";

    const changed = pastedJobFile(source, FILE, "Globex is hiring.", AT);

    expect(changed.ok && fields(changed.source)).toEqual({
      ok: true,
      data: { url: "https://ie.indeed.com/viewjob?jk=1", source: "Indeed", my_note: "keep me", fetched_at: AT },
      body: "Globex is hiring.\n",
    });
  });

  it("reports a job.md that isn't valid", () => {
    const changed = pastedJobFile("no frontmatter", FILE, "Text.", AT);

    expect(changed).toEqual({ ok: false, error: { file: FILE, problems: ["missing YAML frontmatter: the file must start with a `---` line"] } });
  });
});

describe("hasPostingText", () => {
  it.each([
    ["", false],
    ["\n  \n", false],
    ["Globex is hiring.\n", true],
  ])("%j → %s", (body, has) => {
    expect(hasPostingText(body)).toBe(has);
  });
});
