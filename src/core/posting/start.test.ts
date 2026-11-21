import { describe, expect, it } from "vitest";
import { fetchedStart, readLinkStarts, readNewRunStart } from "./start";

describe("fetchedStart", () => {
  const page = "https://jobs.example.com/7";

  it("starts from the fetched text and the page it came from", () => {
    expect(fetchedStart({ ok: true, text: "Globex is hiring.", url: page })).toEqual({
      start: { posting: "Globex is hiring.", url: page, fetched: true },
    });
  });

  it("passes on why the fetch failed", () => {
    expect(fetchedStart({ ok: false, reason: "The page answered 403." })).toEqual({ error: "The page answered 403." });
  });

  it("takes text of any length whole: there is no character limit (F47)", () => {
    const long = "Globex is hiring. ".repeat(10_000);
    expect(long.length).toBeGreaterThan(50_000);
    expect(fetchedStart({ ok: true, text: long, url: page })).toEqual({ start: { posting: long, url: page, fetched: true } });
  });
});

describe("readNewRunStart", () => {
  it("starts from pasted text", () => {
    expect(readNewRunStart({ posting: "  Globex is hiring.  " })).toEqual({ start: { posting: "Globex is hiring." } });
  });

  it("starts from a link when no text was pasted", () => {
    expect(readNewRunStart({ url: " https://jobs.example.com/7 " })).toEqual({ start: { url: "https://jobs.example.com/7" } });
    expect(readNewRunStart({ posting: "  ", url: "https://jobs.example.com/7" })).toEqual({
      start: { url: "https://jobs.example.com/7" },
    });
  });

  it("keeps the link with pasted text, an Indeed link included, without fetching it", () => {
    expect(readNewRunStart({ posting: "Globex is hiring.", url: "https://ie.indeed.com/viewjob?jk=1" })).toEqual({
      start: { posting: "Globex is hiring.", url: "https://ie.indeed.com/viewjob?jk=1" },
    });
  });

  it("refuses an empty request", () => {
    for (const body of [null, {}, { posting: 7, url: null }, { posting: " ", url: "" }]) {
      expect(readNewRunStart(body)).toEqual({ error: "Give the posting's link or paste its text first." });
    }
  });

  it("takes pasted text of any length whole: there is no character limit (F47)", () => {
    const long = "Globex is hiring. ".repeat(10_000).trim();
    expect(long.length).toBeGreaterThan(50_000);
    expect(readNewRunStart({ posting: long, url: "https://jobs.example.com/7" })).toEqual({
      start: { posting: long, url: "https://jobs.example.com/7" },
    });
  });

  it("refuses a link the server must not fetch", () => {
    expect(readNewRunStart({ url: "ftp://jobs.example.com/7" })).toEqual({ error: "Only http and https links are accepted." });
    expect(readNewRunStart({ url: "http://127.0.0.1:11434/api/tags" })).toHaveProperty("error");
    expect(readNewRunStart({ url: "http://192.168.1.1/" })).toHaveProperty("error");
    expect(readNewRunStart({ url: "https://ie.indeed.com/viewjob?jk=1" })).toEqual({
      error: "Indeed blocks automated requests. Paste the posting's text instead.",
    });
  });

  it("refuses a kept link that isn't an http or https link", () => {
    expect(readNewRunStart({ posting: "Globex is hiring.", url: "javascript:alert(1)" })).toHaveProperty("error");
    expect(readNewRunStart({ posting: "Globex is hiring.", url: "not a link" })).toHaveProperty("error");
  });
});

describe("readLinkStarts", () => {
  it("starts one run per link, in the order given, a link given twice once", () => {
    expect(readLinkStarts(["https://jobs.example.com/2", "", " https://jobs.example.com/1 ", "https://jobs.example.com/2"])).toEqual({
      starts: [{ url: "https://jobs.example.com/2" }, { url: "https://jobs.example.com/1" }],
    });
  });

  it("starts nothing when one line can't be fetched, and names it", () => {
    expect(readLinkStarts(["https://jobs.example.com/1", "not a link", "https://ie.indeed.com/viewjob?jk=1"])).toEqual({
      error:
        "Nothing was queued.\n" +
        "Line 2 (not a link): This is not a link. It must start with http:// or https://.\n" +
        "Line 3 (https://ie.indeed.com/viewjob?jk=1): Indeed blocks automated requests. Paste the posting's text instead.",
    });
  });

  it("refuses a list without links and anything that isn't a list of text", () => {
    expect(readLinkStarts([])).toEqual({ error: "Give the posting's link or paste its text first." });
    expect(readLinkStarts(["", "  "])).toEqual({ error: "Give the posting's link or paste its text first." });
    for (const urls of [undefined, null, "https://jobs.example.com/1", ["https://jobs.example.com/1", 7]]) {
      expect(readLinkStarts(urls)).toEqual({ error: "The links must be a list of lines of text." });
    }
  });
});
