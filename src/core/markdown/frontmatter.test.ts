import { describe, expect, it } from "vitest";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("splits frontmatter fields from the body", () => {
    const result = parseFrontmatter("---\ncompany: Acme\nrole: Developer\n---\n\n- Built things.\n");

    expect(result).toEqual({
      ok: true,
      data: { company: "Acme", role: "Developer" },
      body: "\n- Built things.\n",
    });
  });

  it("keeps dates as strings instead of converting them to Date", () => {
    const result = parseFrontmatter("---\nstart: 2023-01\nend: 2024-05-15\n---\n");

    expect(result).toMatchObject({ ok: true, data: { start: "2023-01", end: "2024-05-15" } });
  });

  it("accepts an empty frontmatter block", () => {
    expect(parseFrontmatter("---\n---\n## Cloud\n- AWS\n")).toEqual({
      ok: true,
      data: {},
      body: "## Cloud\n- AWS\n",
    });
  });

  it("accepts a file that ends right after the closing line", () => {
    expect(parseFrontmatter("---\nname: X\n---")).toEqual({ ok: true, data: { name: "X" }, body: "" });
  });

  it("handles CRLF line endings and a byte-order mark", () => {
    const result = parseFrontmatter("\uFEFF---\r\nname: X\r\n---\r\nBody\r\n");

    expect(result).toEqual({ ok: true, data: { name: "X" }, body: "Body\r\n" });
  });

  it("does not treat a later --- line in the body as frontmatter", () => {
    const result = parseFrontmatter("---\nname: X\n---\nAbove\n---\nBelow\n");

    expect(result).toEqual({ ok: true, data: { name: "X" }, body: "Above\n---\nBelow\n" });
  });

  it("reports a file without frontmatter", () => {
    expect(parseFrontmatter("# Just a heading\n")).toEqual({
      ok: false,
      problem: "missing YAML frontmatter: the file must start with a `---` line",
    });
  });

  it("reports unclosed frontmatter", () => {
    expect(parseFrontmatter("---\nname: X\n")).toEqual({
      ok: false,
      problem: "unclosed YAML frontmatter: add a `---` line after the fields",
    });
  });

  it("reports invalid YAML with the line number in the file", () => {
    const result = parseFrontmatter("---\nname: X\nname: Y\n---\n");

    expect(result).toEqual({ ok: false, problem: "invalid YAML on line 3: Map keys must be unique" });
  });

  it("reports frontmatter that is not a mapping", () => {
    expect(parseFrontmatter("---\n- a\n- b\n---\n")).toEqual({
      ok: false,
      problem: "frontmatter must be a list of `field: value` lines",
    });
  });
});

describe("stringifyFrontmatter", () => {
  it("round-trips fields and body through parseFrontmatter", () => {
    const data = {
      generated_at: "2026-11-09T14:02:11Z",
      start: "2023-01",
      end: "present",
      answer: "no",
      requirements: [{ text: "TypeScript: 3+ years", sources: ["experience/2023-01-acme.md"] }],
    };
    const file = stringifyFrontmatter(data, "Body text\n");

    expect(parseFrontmatter(file)).toEqual({ ok: true, data, body: "Body text\n" });
  });

  it("writes an empty block when there are no fields", () => {
    expect(stringifyFrontmatter({}, "Body\n")).toBe("---\n---\nBody\n");
  });

  it("does not fold long lines", () => {
    const text = "word ".repeat(40).trim();

    expect(stringifyFrontmatter({ text })).toBe(`---\ntext: ${text}\n---\n`);
  });
});
