import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../markdown/frontmatter";
import { validateMarkdownFile } from "../markdown/validate";
import { archivedJob, restoredJob } from "./archive";
import { jobSchema } from "./schemas";

const FILE = "applications/2026-11-10-globex-backend-engineer/job.md";
const AT = "2026-11-21T20:45:00.000Z";

/** A job.md with a field the app doesn't know, and a body. */
const JOB = [
  "---",
  "source: url",
  "url: https://jobs.example.com/backend-engineer",
  "fetched_at: 2026-11-10T16:19:40.937Z",
  "company: Globex",
  "role: Backend Engineer",
  "language: en",
  "my_note: applied by email",
  "---",
  "Globex is hiring a Backend Engineer.",
  "",
  "Requirements:",
  "- TypeScript",
  "",
].join("\n");

const fields = (source: string) => {
  const parsed = parseFrontmatter(source);
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed;
};

describe("archivedJob (F48)", () => {
  it("sets archived_at and keeps every other field, the unknown one included, and the body", () => {
    const archived = archivedJob(JOB, FILE, AT);
    if (!archived.ok) throw new Error(archived.reason);

    expect(fields(archived.source)).toEqual({
      ok: true,
      data: { ...fields(JOB).data, archived_at: AT },
      body: fields(JOB).body,
    });
    // It is still a valid job.md, with the timestamp read back as one.
    expect(validateMarkdownFile(jobSchema, FILE, archived.source)).toMatchObject({ ok: true, data: { archived_at: AT } });
  });

  it("leaves an archived job.md alone", () => {
    const archived = archivedJob(JOB, FILE, AT);
    if (!archived.ok) throw new Error(archived.reason);

    expect(archivedJob(archived.source, FILE, "2026-11-22T09:00:00.000Z")).toEqual({ ok: false, reason: "archived" });
  });

  it("reports a job.md that isn't valid with its path, and rewrites nothing (Art. IV.6)", () => {
    expect(archivedJob("no frontmatter", FILE, AT)).toEqual({
      ok: false,
      reason: "invalid",
      error: { file: FILE, problems: ["missing YAML frontmatter: the file must start with a `---` line"] },
    });
    expect(archivedJob(JOB.replace("language: en", "language: English"), FILE, AT)).toMatchObject({
      ok: false,
      reason: "invalid",
      error: { file: FILE, problems: ["language: must be a two-letter ISO 639-1 code, e.g. en"] },
    });
  });

  it("refuses an archived_at that isn't a timestamp when job.md is read", () => {
    const source = JOB.replace("my_note:", "archived_at: last week\nmy_note:");

    expect(validateMarkdownFile(jobSchema, FILE, source)).toMatchObject({
      ok: false,
      error: { problems: ["archived_at: must be an ISO date-time, e.g. 2026-11-09T14:02:11Z"] },
    });
  });
});

describe("restoredJob (F48)", () => {
  it("removes archived_at and gives back the job.md as it was before archiving", () => {
    const archived = archivedJob(JOB, FILE, AT);
    if (!archived.ok) throw new Error(archived.reason);

    const restored = restoredJob(archived.source, FILE);
    if (!restored.ok) throw new Error(restored.reason);

    expect(fields(restored.source)).toEqual(fields(JOB));
    expect(fields(restored.source).data).not.toHaveProperty("archived_at");
  });

  it("leaves a job.md that isn't archived alone, and reports one that isn't valid", () => {
    expect(restoredJob(JOB, FILE)).toEqual({ ok: false, reason: "not archived" });
    expect(restoredJob("---\nsource: url\n---\n", FILE)).toMatchObject({ ok: false, reason: "invalid", error: { file: FILE } });
  });
});
