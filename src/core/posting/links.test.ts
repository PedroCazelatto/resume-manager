import { describe, expect, it } from "vitest";
import { readLinks, refusedMessage, splitLines, type LinkList } from "./links";

const A = "https://jobs.example.com/1";
const B = "https://jobs.example.com/2";
const C = "https://www.linkedin.com/jobs/view/3";

/** The links a list was read into, or the refused list itself. */
const urls = (list: LinkList) => (list.ok ? list.links.map((link) => link.url) : list);

describe("readLinks", () => {
  it("reads one link per line, in the order given, each with its line", () => {
    expect(readLinks(splitLines(`${B}\n${A}\n${C}`))).toEqual({
      ok: true,
      links: [
        { line: 1, text: B, url: B },
        { line: 2, text: A, url: A },
        { line: 3, text: C, url: C },
      ],
    });
  });

  it("ignores blank lines and the spaces around a link, counting the blank lines", () => {
    expect(urls(readLinks(splitLines(`\n  ${A}  \r\n\n   \n${B}\n`)))).toEqual([A, B]);
    expect(readLinks(splitLines(`\n  ${A}  \r\n\n   \n${B}\n`))).toMatchObject({ links: [{ line: 2, text: A }, { line: 5, text: B }] });
  });

  it("keeps a link given twice once, where it came first", () => {
    expect(urls(readLinks([A, B, A, ` ${B} `]))).toEqual([A, B]);
    // The same address written differently is the same link.
    expect(readLinks(["https://Jobs.Example.com", "https://jobs.example.com/"])).toEqual({
      ok: true,
      links: [{ line: 1, text: "https://Jobs.Example.com", url: "https://jobs.example.com/" }],
    });
  });

  it("keeps the LinkedIn forms of one job once, and two jobs twice (F47)", () => {
    expect(
      readLinks([
        "https://www.linkedin.com/jobs/search/?currentJobId=4321987650",
        "https://www.linkedin.com/jobs/view/4321987650",
        "https://www.linkedin.com/jobs/view/senior-backend-engineer-at-globex-4321987650",
        "https://www.linkedin.com/jobs/view/4321987651",
      ]),
    ).toMatchObject({
      links: [
        { line: 1, url: "https://www.linkedin.com/jobs/search/?currentJobId=4321987650" },
        { line: 4, url: "https://www.linkedin.com/jobs/view/4321987651" },
      ],
    });
  });

  it("has no links when every line is blank", () => {
    expect(readLinks(splitLines(""))).toEqual({ ok: true, links: [] });
    expect(readLinks(splitLines(" \n\n"))).toEqual({ ok: true, links: [] });
  });

  it("refuses the whole list when a line is not a link, naming the line as it was given", () => {
    expect(readLinks(splitLines(`${A}\n\nnot a link\n${B}\nftp://jobs.example.com/4`))).toEqual({
      ok: false,
      refused: [
        { line: 3, text: "not a link", reason: "This is not a link. It must start with http:// or https://." },
        { line: 5, text: "ftp://jobs.example.com/4", reason: "Only http and https links are accepted." },
      ],
    });
  });

  it("refuses a link the server must not fetch", () => {
    expect(readLinks([A, "http://127.0.0.1:11434/api/tags"])).toEqual({
      ok: false,
      refused: [
        {
          line: 2,
          text: "http://127.0.0.1:11434/api/tags",
          reason: "This link leads to this computer or a private network, which the app doesn't fetch.",
        },
      ],
    });
  });

  it("accepts an Indeed link, alone or in a list: it becomes a run that asks for its text (F47)", () => {
    expect(urls(readLinks(["https://ie.indeed.com/viewjob?jk=1"]))).toEqual(["https://ie.indeed.com/viewjob?jk=1"]);
    expect(urls(readLinks([A, "https://ie.indeed.com/viewjob?jk=1", B]))).toEqual([A, "https://ie.indeed.com/viewjob?jk=1", B]);
  });
});

describe("refusedMessage", () => {
  it("names every refused line and says nothing was queued", () => {
    expect(
      refusedMessage([
        { line: 2, text: "not a link", reason: "This is not a link." },
        { line: 4, text: "ftp://x", reason: "Only http and https links are accepted." },
      ]),
    ).toBe("Nothing was queued.\nLine 2 (not a link): This is not a link.\nLine 4 (ftp://x): Only http and https links are accepted.");
  });
});
