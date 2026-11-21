import { describe, expect, it } from "vitest";
import type { RunStatus } from "../runs/queue";
import { addedMessage, savedLinks, skipKnownLinks, uncheckedMessage } from "./known-links";
import type { ListedLink } from "./links";

const A = "https://jobs.example.com/1";
const B = "https://jobs.example.com/2";
const C = "https://jobs.example.com/3";
const LINKEDIN_SEARCH = "https://www.linkedin.com/jobs/search/?currentJobId=4321987650";
const LINKEDIN_VIEW = "https://www.linkedin.com/jobs/view/4321987650";
const APPLICATION = "2026-11-10-globex-ltd-senior-backend-engineer";

/** The links of a list, one per line, as `readLinks` gives them. */
const listed = (...urls: string[]): ListedLink[] => urls.map((url, index) => ({ line: index + 1, text: url, url }));
const run = (status: RunStatus, url?: string) => ({ status, url });

describe("skipKnownLinks (F47)", () => {
  it("skips a link whose row in the Runs list is fetching, waiting, running or finished", () => {
    for (const status of ["fetching", "queued", "running", "done"] as const) {
      expect(skipKnownLinks(listed(A, B), [run(status, A)], []), status).toEqual({
        links: [{ line: 2, text: B, url: B }],
        skipped: [{ line: 1, text: A, reason: "Skipped: it is already in the Runs list." }],
      });
    }
  });

  it("queues again a link whose row failed or was cancelled", () => {
    for (const status of ["failed", "cancelled"] as const) {
      expect(skipKnownLinks(listed(A), [run(status, A)], []), status).toEqual({ links: listed(A), skipped: [] });
    }
    // Another row with the same link that is still going counts all the same.
    expect(skipKnownLinks(listed(A), [run("failed", A), run("queued", A)], []).skipped).toHaveLength(1);
  });

  it("skips a link that a saved application's job.md has, naming the application", () => {
    expect(skipKnownLinks(listed(A, B), [], [{ id: APPLICATION, url: B }])).toEqual({
      links: listed(A),
      skipped: [{ line: 2, text: B, reason: `Skipped: it is already saved in application ${APPLICATION}.` }],
    });
  });

  it("names the Runs list first when both have the link", () => {
    expect(skipKnownLinks(listed(A), [run("done", A)], [{ id: APPLICATION, url: A }]).skipped[0].reason).toBe(
      "Skipped: it is already in the Runs list.",
    );
  });

  it("counts the LinkedIn forms of one job as the same link, and two jobs as two", () => {
    const other = "https://www.linkedin.com/jobs/view/senior-backend-engineer-at-globex-4321987651";

    expect(skipKnownLinks(listed(LINKEDIN_SEARCH, other), [run("queued", LINKEDIN_VIEW)], []).links.map((link) => link.url)).toEqual([other]);
    expect(skipKnownLinks(listed(LINKEDIN_VIEW), [], [{ id: APPLICATION, url: LINKEDIN_SEARCH }]).links).toEqual([]);
  });

  it("compares addresses as links, not as text", () => {
    expect(skipKnownLinks(listed("https://jobs.example.com/"), [run("queued", "https://Jobs.Example.com")], []).links).toEqual([]);
  });

  it("ignores rows without a link, and keeps the links the profile doesn't have, in order", () => {
    expect(skipKnownLinks(listed(C, A, B), [run("running"), run("queued", "https://jobs.example.com/9")], [])).toEqual({
      links: listed(C, A, B),
      skipped: [],
    });
  });

  it("can skip every link", () => {
    expect(skipKnownLinks(listed(A, B), [run("queued", A)], [{ id: APPLICATION, url: B }])).toMatchObject({ links: [], skipped: [{ line: 1 }, { line: 2 }] });
  });
});

describe("savedLinks", () => {
  const job = (fields: string) => `---\nsource: url\nfetched_at: 2026-11-10T16:19:40.937Z\ncompany: Globex Ltd\nrole: Engineer\nlanguage: en\n${fields}---\nGlobex is hiring.\n`;

  it("reads each saved application's link from its job.md; one without a link has none", () => {
    expect(
      savedLinks([
        { id: APPLICATION, source: job(`url: ${A}\n`) },
        { id: "2026-11-11-initech-dev", source: job("") },
      ]),
    ).toEqual({ saved: [{ id: APPLICATION, url: A }], problems: [] });
  });

  it("returns a job.md that isn't valid with its path and problems, never skipping it silently (Art. IV.6)", () => {
    expect(savedLinks([{ id: APPLICATION, source: "no frontmatter" }])).toEqual({
      saved: [],
      problems: [{ file: `applications/${APPLICATION}/job.md`, problems: ["missing YAML frontmatter: the file must start with a `---` line"] }],
    });
    expect(savedLinks([{ id: APPLICATION, source: job("url: not a link\n") }]).problems).toMatchObject([{ file: `applications/${APPLICATION}/job.md` }]);
  });
});

describe("addedMessage", () => {
  const skipped = [{ line: 2, text: A, reason: "Skipped: it is already in the Runs list." }];

  it("tells the count of runs added, then each skipped line", () => {
    expect(addedMessage(1, [])).toBe("Added to the runs below.");
    expect(addedMessage(3, skipped)).toBe(`Added 3 runs to the runs below.\nLine 2 (${A}): Skipped: it is already in the Runs list.`);
  });

  it("says so when every link was skipped", () => {
    expect(addedMessage(0, skipped)).toBe(`Nothing was added: every link is already there.\nLine 2 (${A}): Skipped: it is already in the Runs list.`);
  });
});

describe("uncheckedMessage", () => {
  it("names each job.md that couldn't be read, with its problems", () => {
    expect(uncheckedMessage([{ file: `applications/${APPLICATION}/job.md`, problems: ["url: Invalid URL", "role: is required"] }])).toBe(
      `These applications couldn't be checked for the same link:\napplications/${APPLICATION}/job.md: url: Invalid URL; role: is required`,
    );
  });
});
