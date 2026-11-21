import { describe, expect, it } from "vitest";
import { readLinks, refusedMessage, splitLines } from "./links";

const A = "https://jobs.example.com/1";
const B = "https://jobs.example.com/2";
const C = "https://www.linkedin.com/jobs/view/3";

describe("readLinks", () => {
  it("reads one link per line, in the order given", () => {
    expect(readLinks(splitLines(`${B}\n${A}\n${C}`))).toEqual({ ok: true, urls: [B, A, C] });
  });

  it("ignores blank lines and the spaces around a link", () => {
    expect(readLinks(splitLines(`\n  ${A}  \r\n\n   \n${B}\n`))).toEqual({ ok: true, urls: [A, B] });
  });

  it("keeps a link given twice once, where it came first", () => {
    expect(readLinks([A, B, A, ` ${B} `])).toEqual({ ok: true, urls: [A, B] });
    // The same address written differently is the same link.
    expect(readLinks(["https://Jobs.Example.com", "https://jobs.example.com/"])).toEqual({
      ok: true,
      urls: ["https://jobs.example.com/"],
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
    ).toEqual({
      ok: true,
      urls: ["https://www.linkedin.com/jobs/search/?currentJobId=4321987650", "https://www.linkedin.com/jobs/view/4321987651"],
    });
  });

  it("has no links when every line is blank", () => {
    expect(readLinks(splitLines(""))).toEqual({ ok: true, urls: [] });
    expect(readLinks(splitLines(" \n\n"))).toEqual({ ok: true, urls: [] });
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
    expect(readLinks(["https://ie.indeed.com/viewjob?jk=1"])).toEqual({ ok: true, urls: ["https://ie.indeed.com/viewjob?jk=1"] });
    expect(readLinks([A, "https://ie.indeed.com/viewjob?jk=1", B])).toEqual({ ok: true, urls: [A, "https://ie.indeed.com/viewjob?jk=1", B] });
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
