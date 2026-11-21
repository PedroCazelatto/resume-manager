import { describe, expect, it } from "vitest";
import { validateMarkdownFile } from "../markdown/validate";
import { analysisSchema, jobSchema } from "./schemas";

describe("jobSchema", () => {
  const job = (...fields: string[]) => ["---", ...fields, "---", "Globex is hiring."].join("\n");

  it("accepts a job.md with every detail (F46)", () => {
    const source = job(
      "title: Senior Backend Engineer",
      "company: Globex",
      "company_url: https://globex.example/",
      "url: https://www.linkedin.com/jobs/view/4321987650",
      "source: LinkedIn",
      "fetched_at: 2026-11-21T14:02:11Z",
      "language: en",
      "location: Dublin, Ireland",
      "salary: €60,000–€70,000 a year",
      "work_model: hybrid",
      "hours: 40 hours a week",
      "archived_at: 2026-11-22T09:00:00Z",
      "my_note: applied by email",
    );

    expect(validateMarkdownFile(jobSchema, "job.md", source)).toMatchObject({
      ok: true,
      data: { title: "Senior Backend Engineer", source: "LinkedIn", work_model: "hybrid", hours: "40 hours a week", my_note: "applied by email" },
      body: "Globex is hiring.",
    });
  });

  it("needs only the link and the platform: the details are filled once known", () => {
    expect(validateMarkdownFile(jobSchema, "job.md", job("url: https://jobs.example.com/7", "source: jobs.example.com"))).toMatchObject({ ok: true });
  });

  it("requires the platform, and the link with it", () => {
    expect(validateMarkdownFile(jobSchema, "job.md", job("url: https://jobs.example.com/7"))).toEqual({
      ok: false,
      error: { file: "job.md", problems: ["source: is required"] },
    });
    expect(validateMarkdownFile(jobSchema, "job.md", job("source: LinkedIn"))).toEqual({
      ok: false,
      error: { file: "job.md", problems: ["url: is required"] },
    });
  });

  it("still reads a job.md written before F46: source url or paste, the title as role, a pasted one without a link", () => {
    const pasted = job("source: paste", "fetched_at: 2026-11-09T14:02:11Z", "company: Globex", "role: Backend Engineer", "language: en", "location: Dublin, Ireland");
    const fetched = job("source: url", "url: https://jobs.example.com/7", "fetched_at: 2026-11-09T14:02:11Z", "company: Globex", "role: Backend Engineer", "language: en");

    expect(validateMarkdownFile(jobSchema, "job.md", pasted)).toMatchObject({
      ok: true,
      data: { source: "paste", company: "Globex", role: "Backend Engineer", language: "en" },
    });
    expect(validateMarkdownFile(jobSchema, "job.md", fetched)).toMatchObject({ ok: true, data: { source: "url", role: "Backend Engineer" } });
  });

  it("takes the company's website and the link only as http or https addresses (Art. II.7)", () => {
    for (const website of ["javascript:alert(1)", "data:text/html,x", "globex.example"]) {
      expect(validateMarkdownFile(jobSchema, "job.md", job("url: https://jobs.example.com/7", "source: jobs.example.com", `company_url: "${website}"`)), website).toEqual({
        ok: false,
        error: { file: "job.md", problems: ["company_url: must be an http or https address"] },
      });
    }
  });

  it("knows three work models", () => {
    const result = validateMarkdownFile(jobSchema, "job.md", job("url: https://jobs.example.com/7", "source: jobs.example.com", "work_model: flexible"));
    expect(result.ok ? [] : result.error.problems).toEqual([expect.stringMatching(/^work_model: /)]);
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
