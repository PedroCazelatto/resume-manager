import { describe, expect, it } from "vitest";
import { contentYaml, parseContentYaml } from "./edit";
import { resumeFixture } from "./fixture.testing";

describe("contentYaml and parseContentYaml", () => {
  it("round-trips the content and leaves the run metadata out", () => {
    const resume = { ...resumeFixture(), generated_at: "2026-11-10T10:05:00.000Z", status: "draft", inferences: [] };

    const yaml = contentYaml(resume);

    expect(yaml).toMatch(/^name: Jane Doe\n/);
    expect(yaml).not.toContain("generated_at");
    expect(yaml).not.toContain("inferences");
    expect(parseContentYaml(yaml)).toEqual({ ok: true, content: resumeFixture() });
  });

  it("reports invalid YAML with its line", () => {
    const result = parseContentYaml("name: Jane Doe\nsummary: [unclosed\n");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.problems[0]).toContain("invalid YAML on line");
  });

  it("reports the fields that don't fit the resume schema", () => {
    const content = resumeFixture();
    content.experience[0].start = "January 2023";
    const yaml = contentYaml(content).replace(/^summary: .*\n/m, "");

    const result = parseContentYaml(yaml);

    expect(result).toEqual({
      ok: false,
      error: {
        file: "resume.md",
        problems: ["summary: is required", "experience[0].start: must be a date in YYYY-MM or YYYY-MM-DD format"],
      },
    });
  });
});
