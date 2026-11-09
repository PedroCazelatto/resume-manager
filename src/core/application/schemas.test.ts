import { describe, expect, it } from "vitest";
import { validateMarkdownFile } from "../markdown/validate";
import { analysisSchema, jobSchema } from "./schemas";

describe("jobSchema", () => {
  it("accepts a pasted posting", () => {
    const source = [
      "---",
      "source: paste",
      "fetched_at: 2026-11-09T14:02:11Z",
      "company: Globex",
      "role: Backend Engineer",
      "language: en",
      "location: Dublin, Ireland",
      "---",
      "Globex is hiring.",
    ].join("\n");

    expect(validateMarkdownFile(jobSchema, "job.md", source)).toMatchObject({
      ok: true,
      data: { source: "paste", company: "Globex", language: "en" },
      body: "Globex is hiring.",
    });
  });

  it("requires an ISO language code and timestamp", () => {
    const source = "---\nsource: paste\nfetched_at: yesterday\ncompany: G\nrole: R\nlanguage: English\n---\n";

    expect(validateMarkdownFile(jobSchema, "job.md", source)).toEqual({
      ok: false,
      error: {
        file: "job.md",
        problems: [
          "fetched_at: must be an ISO date-time, e.g. 2026-11-09T14:02:11Z",
          "language: must be a two-letter ISO 639-1 code, e.g. en",
        ],
      },
    });
  });
});

describe("analysisSchema", () => {
  it("validates each requirement", () => {
    const source = [
      "---",
      "generated_at: 2026-11-09T14:02:11Z",
      "model: test-model",
      "requirements:",
      "  - text: Kubernetes",
      "    importance: required",
      "    status: partial",
      "    sources: [experience/2023-01-acme.md]",
      "    note: EKS only",
      "keywords: [Kubernetes]",
      "---",
    ].join("\n");

    const result = validateMarkdownFile(analysisSchema, "analysis.md", source);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.error.problems).toEqual([
      expect.stringMatching(/^requirements\[0\]\.importance: /),
    ]);
  });
});
