import { describe, expect, it } from "vitest";
import { parseTemplate, type ResumeTemplate } from "../template/template";
import { resumeFixture } from "./fixture.testing";
import { formatDate, renderResume } from "./render";
import { resumeFileSchema, type Inference } from "./schema";

function template(layout: string): ResumeTemplate {
  const result = parseTemplate("test", "templates/test.html", `<script type="text/markdown" id="rules">r</script>${layout}`);
  if (!result.ok) throw new Error(result.error.problems.join("; "));
  return result.template;
}

const inference = (skill: string, status: Inference["status"]): Inference => ({
  skill,
  sources: ["experience/2023-01-acme-senior-developer.md"],
  reason: "Deployed services to Amazon EKS.",
  status,
});

describe("renderResume", () => {
  it("fills placeholders and formats dates in the resume's language", () => {
    const html = renderResume(
      template("<h1>{{name}}</h1>{{#each experience}}<p>{{company}} — {{date start}} – {{date end}}</p>{{/each}}"),
      { content: resumeFixture(), language: "en", inferences: [] },
    );

    expect(html).toBe("<h1>Jane Doe</h1><p>Acme — Jan 2023 – Present</p>");
  });

  it("can show years only", () => {
    const html = renderResume(template("{{#each education}}{{date start 'year'}}–{{date end 'year'}}{{/each}}"), {
      content: resumeFixture(),
      language: "en",
      inferences: [],
    });

    expect(html).toBe("2015–2018");
  });

  it("escapes content so it can't inject markup", () => {
    const content = { ...resumeFixture(), name: '<img src=x onerror="alert(1)">' };

    const html = renderResume(template("<h1>{{name}}</h1>"), { content, language: "en", inferences: [] });

    expect(html).toBe("<h1>&lt;img src&#x3D;x onerror&#x3D;&quot;alert(1)&quot;&gt;</h1>");
  });

  it.each([
    ["pending", "TypeScript, Python"],
    ["rejected", "TypeScript, Python"],
    ["approved", "TypeScript, Python, Kubernetes"],
  ] as const)("shows an implied skill only once approved (%s)", (status, expected) => {
    const html = renderResume(
      template("{{#each skills}}{{#each items}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}{{/each}}"),
      { content: resumeFixture(), language: "en", inferences: [inference("Kubernetes", status)] },
    );

    expect(html).toBe(expected);
  });

  it("drops a skill group left empty by hidden inferences", () => {
    const content = { ...resumeFixture(), skills: [{ category: "Cloud", items: ["Kubernetes"] }] };

    const html = renderResume(template("{{#each skills}}[{{category}}]{{/each}}"), {
      content,
      language: "en",
      inferences: [inference("kubernetes", "pending")],
    });

    expect(html).toBe("");
  });

  it("still opens and renders an older resume written in another language as it is (F51)", () => {
    const fixture = resumeFixture();
    const older = resumeFileSchema.parse({
      ...fixture,
      labels: { ...fixture.labels, experience: "Experiência profissional", present: "Atual" },
      generated_at: "2026-11-10T10:05:00.000Z",
      model: "fake-model",
      template: "ireland",
      language: "pt",
      status: "ready",
      inferences: [],
    });

    const html = renderResume(
      template('<html lang="{{language}}"><h2>{{labels.experience}}</h2>{{#each experience}}{{date start}} – {{date end}}{{/each}}</html>'),
      { content: older, language: older.language, inferences: older.inferences },
    );

    expect(html).toMatch(/^<html lang="pt"><h2>Experiência profissional<\/h2>jan.* 2023 – Atual<\/html>$/i);
  });
});

describe("formatDate", () => {
  it.each([
    ["2025-01", "month", "en", "Jan 2025"],
    ["2025-10-15", "month", "en", "Oct 2025"],
    ["2025-01", "year", "en", "2025"],
    ["present", "month", "pt", "Atual"],
  ])("%s (%s, %s) → %s", (value, format, language, expected) => {
    expect(formatDate(value, format, language, "Atual")).toBe(expected);
  });

  it("uses the language's month names", () => {
    expect(formatDate("2025-10", "month", "pt", "Atual")).toMatch(/out/i);
  });
});
