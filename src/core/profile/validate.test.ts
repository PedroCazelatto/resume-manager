import { describe, expect, it } from "vitest";
import { parseProfileFile, profileFileKind } from "./validate";

const md = (frontmatter: string, body = "") => `---\n${frontmatter}\n---\n${body}`;

describe("profileFileKind", () => {
  it.each([
    ["personal.md", "personal"],
    ["summary.md", "summary"],
    ["skills.md", "skills"],
    ["languages.md", "languages"],
    ["experience/2023-01-acme-senior-developer.md", "experience"],
    ["education/2015-usp-bsc-computer-science.md", "education"],
    ["projects/resume-manager.md", "project"],
    ["certifications/2024-06-aws-solutions-architect.md", "certification"],
    ["extras/marathon.md", "extra"],
  ])("maps %s to %s", (file, kind) => {
    expect(profileFileKind(file)).toBe(kind);
  });

  it.each([
    "notes.md",
    "imports/cv.pdf",
    "applications/2026-11-05-globex-backend-engineer/job.md",
    "experience/old/2019-01-x.md",
    "experience/2023-01-acme.txt",
  ])("ignores %s", (file) => {
    expect(profileFileKind(file)).toBeUndefined();
  });
});

describe("parseProfileFile", () => {
  it("parses a valid experience file and keeps its body", () => {
    const source = md(
      "company: Acme\nrole: Senior Developer\nlocation: Dublin, Ireland\nstart: 2023-01\nend: present\ntags: [typescript, aws]",
      "\n- Led the billing migration.\n",
    );

    expect(parseProfileFile("experience", "experience/2023-01-acme.md", source)).toEqual({
      ok: true,
      value: {
        kind: "experience",
        file: "experience/2023-01-acme.md",
        data: {
          company: "Acme",
          role: "Senior Developer",
          location: "Dublin, Ireland",
          start: "2023-01",
          end: "present",
          tags: ["typescript", "aws"],
        },
        body: "\n- Led the billing migration.\n",
        source,
      },
    });
  });

  it("keeps frontmatter fields it does not know about", () => {
    const result = parseProfileFile("summary", "summary.md", md("target_roles: [Engineer]\nmood: sunny"));

    expect(result).toMatchObject({ ok: true, value: { data: { target_roles: ["Engineer"], mood: "sunny" } } });
  });

  it("accepts skills.md with empty frontmatter", () => {
    const result = parseProfileFile("skills", "skills.md", md("", "## Cloud\n- AWS\n"));

    expect(result).toMatchObject({ ok: true, value: { kind: "skills", data: {}, body: "## Cloud\n- AWS\n" } });
  });

  it("accepts full dates and `present` as an end date", () => {
    const result = parseProfileFile(
      "education",
      "education/2015-usp.md",
      md("institution: USP\ndegree: BSc Computer Science\nstart: 2015-02-01\nend: 2018-12"),
    );

    expect(result.ok).toBe(true);
  });

  it("lists every problem with the field that has it", () => {
    const result = parseProfileFile("experience", "experience/x.md", md("role: Developer\nstart: 2023\nend: soon"));

    expect(result).toEqual({
      ok: false,
      error: {
        file: "experience/x.md",
        problems: [
          "company: is required",
          "start: must be a date in YYYY-MM or YYYY-MM-DD format",
          "end: must be a date in YYYY-MM or YYYY-MM-DD format, or `present`",
        ],
      },
    });
  });

  it("rejects impossible months", () => {
    const result = parseProfileFile(
      "certification",
      "certifications/x.md",
      md("name: AWS SAA\nissuer: AWS\ndate: 2024-13"),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { problems: ["date: must be a date in YYYY-MM or YYYY-MM-DD format"] },
    });
  });

  it("explains numbers where text is expected", () => {
    const result = parseProfileFile(
      "personal",
      "personal.md",
      md("name: Jane\nemail: jane@example.com\nphone: 0871234567\nlocation: { city: Dublin, country: Ireland }"),
    );

    expect(result).toMatchObject({ ok: false, error: { problems: ["phone: must be text (put the value in quotes)"] } });
  });

  it("validates personal.md email, location and link URLs", () => {
    const result = parseProfileFile(
      "personal",
      "personal.md",
      md(
        [
          "name: Jane",
          "email: not-an-email",
          "location: { city: Dublin }",
          "links:",
          "  - { label: Site, url: 'javascript:alert(1)' }",
        ].join("\n"),
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        problems: [
          "email: must be an email address",
          "location.country: is required",
          "links[0].url: must be an http(s) URL",
        ],
      },
    });
  });

  it("validates language levels", () => {
    const result = parseProfileFile(
      "languages",
      "languages.md",
      md("languages:\n  - { name: English, level: C1 }\n  - { name: Portuguese, level: fluent }"),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { problems: ["languages[1].level: must be a CEFR level (A1–C2) or `native`"] },
    });
  });

  it("validates the extras type", () => {
    const result = parseProfileFile("extra", "extras/x.md", md("type: hobby\ntitle: Chess"));

    expect(result).toMatchObject({
      ok: false,
      error: { problems: ["type: must be one of: volunteering, award, publication, interest, availability, other"] },
    });
  });

  it("reports frontmatter problems with the file path", () => {
    expect(parseProfileFile("skills", "skills.md", "## Cloud\n")).toEqual({
      ok: false,
      error: { file: "skills.md", problems: ["missing YAML frontmatter: the file must start with a `---` line"] },
    });
  });
});
