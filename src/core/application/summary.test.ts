import { describe, expect, it } from "vitest";
import { stringifyFrontmatter } from "../markdown/frontmatter";
import { resumeFixture } from "../resume/fixture.testing";
import type { Inference } from "../resume/schema";
import { summarizeApplication } from "./summary";

// Fictional files only (Art. III.5).
const ID = "3f2b8c1e-5a7d-4c9e-9b1a-2d6e8f0c4a73";
const LINK = "https://www.linkedin.com/jobs/view/4000000001/";

const job = (fields: Record<string, unknown> = {}, body = "Globex is hiring a Backend Engineer.\n") =>
  stringifyFrontmatter(
    {
      title: "Backend Engineer",
      company: "Globex",
      company_url: "https://globex.example.com",
      url: LINK,
      source: "LinkedIn",
      fetched_at: "2026-11-20T10:00:00.000Z",
      ...fields,
    },
    body,
  );
const analysis = stringifyFrontmatter({ generated_at: "2026-11-20T10:05:00Z", model: "fake-model", requirements: [], keywords: [] });
const resume = (status: "draft" | "ready", inferences: Inference[] = []) =>
  stringifyFrontmatter({
    generated_at: "2026-11-20T10:10:00Z",
    model: "fake-model",
    template: "ireland",
    language: "en",
    status,
    inferences,
    ...resumeFixture(),
  });
const verification = (current: boolean) =>
  stringifyFrontmatter({
    checked_at: "2026-11-20T10:12:00Z",
    review: { reviewed_at: "2026-11-20T10:15:00Z", model: "fake-model", current },
    failures: [],
  });

describe("summarizeApplication (F26)", () => {
  it("reads a finished, printable application's details, date and status", () => {
    expect(
      summarizeApplication(ID, { "job.md": job(), "analysis.md": analysis, "resume.md": resume("ready"), "verification.md": verification(true) }),
    ).toEqual({
      id: ID,
      title: "Backend Engineer",
      company: "Globex",
      companyUrl: "https://globex.example.com",
      source: "LinkedIn",
      url: LINK,
      date: "2026-11-20T10:00:00.000Z",
      hasText: true,
      indeed: false,
      finished: true,
      resumeStatus: "ready",
      printBlockers: [],
      problems: [],
    });
  });

  it("says why a finished draft can't be printed yet (Art. VI.7)", () => {
    const pending: Inference = { skill: "Kubernetes", sources: ["experience/a.md"], reason: "EKS", status: "pending" };
    const summary = summarizeApplication(ID, {
      "job.md": job(),
      "analysis.md": analysis,
      "resume.md": resume("draft", [pending]),
      "verification.md": verification(false),
    });

    expect(summary).toMatchObject({ finished: true, resumeStatus: "draft" });
    expect(summary?.printBlockers).toEqual([
      "you approve or reject 1 implied skill",
      "the model review has run on the current content",
    ]);
  });

  it("isn't finished until both resume.md and verification.md exist, and has nothing to print then", () => {
    const written = summarizeApplication(ID, { "job.md": job(), "analysis.md": analysis, "resume.md": resume("draft"), "verification.md": null });

    expect(written).toMatchObject({ finished: false, resumeStatus: "draft" });
    expect(written?.printBlockers).toBeUndefined();
    expect(summarizeApplication(ID, { "job.md": job() })).toMatchObject({ finished: false, hasText: true });
  });

  it("knows an application whose text never arrived, an Indeed one, and an archived one", () => {
    const indeed = job({ title: undefined, company: undefined, company_url: undefined, fetched_at: undefined, url: "https://ie.indeed.com/viewjob?jk=1", source: "Indeed" }, "");

    expect(summarizeApplication(ID, { "job.md": indeed })).toEqual({
      id: ID,
      source: "Indeed",
      url: "https://ie.indeed.com/viewjob?jk=1",
      hasText: false,
      indeed: true,
      finished: false,
      problems: [],
    });
    expect(summarizeApplication(ID, { "job.md": job({ archived_at: "2026-11-21T20:45:00.000Z" }) })).toMatchObject({
      archivedAt: "2026-11-21T20:45:00.000Z",
    });
  });

  it("reads an older job.md's role as the title and names its platform from its link", () => {
    const old = stringifyFrontmatter({ source: "url", url: "https://jobs.example.com/1", role: "Backend Engineer", company: "Globex" }, "Text.\n");

    expect(summarizeApplication("2026-11-10-globex-backend-engineer", { "job.md": old })).toMatchObject({
      title: "Backend Engineer",
      company: "Globex",
      source: "jobs.example.com",
    });
  });

  it("names every invalid file with its path, and a missing job.md, instead of failing (Art. IV.6)", () => {
    const summary = summarizeApplication(ID, {
      "job.md": job({ url: "not a link" }),
      "analysis.md": "---\nmodel: [\n---\n",
      "resume.md": resume("ready"),
      "verification.md": stringifyFrontmatter({ checked_at: "2026-11-20T10:12:00Z" }),
    });

    expect(summary).toMatchObject({ id: ID, finished: true, hasText: false, indeed: false });
    expect(summary?.title).toBeUndefined();
    expect(summary?.printBlockers).toBeUndefined();
    expect(summary?.problems.map((problem) => problem.file)).toEqual([
      `applications/${ID}/job.md`,
      `applications/${ID}/analysis.md`,
      `applications/${ID}/verification.md`,
    ]);
    expect(summarizeApplication(ID, { "resume.md": resume("ready") })?.problems).toEqual([
      { file: `applications/${ID}/job.md`, problems: ["the file doesn't exist"] },
    ]);
  });

  it("skips a folder that holds none of the application's files", () => {
    expect(summarizeApplication(ID, {})).toBeNull();
    expect(summarizeApplication(ID, { "job.md": null, "resume.md": null })).toBeNull();
  });
});
