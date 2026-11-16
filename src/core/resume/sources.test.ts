import { describe, expect, it } from "vitest";
import { resumeFixture } from "./fixture.testing";
import { citedFileTexts, listSourcedItems } from "./sources";

describe("listSourcedItems", () => {
  it("lists every item of the resume with its sources, in the schema's order", () => {
    const resume = resumeFixture();
    resume.projects = [{ name: "Ledger CLI", bullets: [], sources: ["projects/ledger-cli.md", "skills.md"] }];
    resume.extras.volunteering = [{ title: "Coding mentor", bullets: [], sources: ["extras/coding-mentor.md"] }];
    resume.extras.award = [{ title: "Hackathon winner", date: "2022-05", bullets: [], sources: ["extras/hackathon.md"] }];

    expect(listSourcedItems(resume)).toEqual([
      { section: "Summary", sources: ["summary.md"] },
      {
        section: "Experience",
        title: "Senior Developer · Acme",
        sources: ["experience/2023-01-acme-senior-developer.md"],
      },
      {
        section: "Education",
        title: "Bachelor of Science · Universidade de São Paulo",
        sources: ["education/2015-usp-bsc-computer-science.md"],
      },
      { section: "Project", title: "Ledger CLI", sources: ["projects/ledger-cli.md", "skills.md"] },
      {
        section: "Certification",
        title: "AWS Certified Solutions Architect – Associate",
        sources: ["certifications/2024-06-aws-solutions-architect.md"],
      },
      { section: "Language", title: "English", sources: ["languages.md"] },
      { section: "Volunteering", title: "Coding mentor", sources: ["extras/coding-mentor.md"] },
      { section: "Award", title: "Hackathon winner", sources: ["extras/hackathon.md"] },
    ]);
  });

  it("keeps an item that cites nothing", () => {
    const resume = resumeFixture();
    resume.summary_sources = [];
    expect(listSourcedItems(resume)[0]).toEqual({ section: "Summary", sources: [] });
  });

  it("covers every extra type", () => {
    const resume = resumeFixture();
    for (const type of Object.keys(resume.extras) as (keyof typeof resume.extras)[]) {
      resume.extras[type] = [{ title: type, bullets: [], sources: [`extras/${type}.md`] }];
    }
    const sources = listSourcedItems(resume).flatMap((item) => item.sources);
    for (const type of Object.keys(resume.extras)) expect(sources).toContain(`extras/${type}.md`);
  });
});

describe("citedFileTexts", () => {
  const items = [
    { section: "Summary", sources: ["summary.md", "skills.md"] },
    { section: "Language", title: "English", sources: ["languages.md"] },
    { section: "Project", title: "Ledger CLI", sources: ["projects/ledger-cli.md", "skills.md"] },
  ];
  const profileFiles = [
    { file: "personal.md", source: "---\nname: Jane Doe\n---\n" },
    { file: "summary.md", source: "summary text" },
    { file: "skills.md", source: "skills text" },
    { file: "languages.md", source: "" },
  ];

  it("returns the text of the cited files only", () => {
    const texts = citedFileTexts(items, profileFiles);
    expect(texts["summary.md"]).toBe("summary text");
    expect(texts["skills.md"]).toBe("skills text");
    expect(Object.keys(texts).sort()).toEqual(["languages.md", "projects/ledger-cli.md", "skills.md", "summary.md"]);
  });

  it("also returns the files only implied skills cite", () => {
    const inferences = [
      { skill: "Kubernetes", sources: ["personal.md", "skills.md"], reason: "EKS.", status: "pending" },
      { skill: "Go", sources: ["projects/gone.md"], reason: "A Go project.", status: "rejected" },
    ];

    const texts = citedFileTexts([...items, ...inferences], profileFiles);

    expect(texts["personal.md"]).toBe("---\nname: Jane Doe\n---\n");
    expect(texts["projects/gone.md"]).toBeNull();
    expect(Object.keys(texts).sort()).toEqual([
      "languages.md",
      "personal.md",
      "projects/gone.md",
      "projects/ledger-cli.md",
      "skills.md",
      "summary.md",
    ]);
  });

  it("marks a cited file the profile no longer has as null, and keeps an empty file", () => {
    const texts = citedFileTexts(items, profileFiles);
    expect(texts["projects/ledger-cli.md"]).toBeNull();
    expect(texts["languages.md"]).toBe("");
  });
});
