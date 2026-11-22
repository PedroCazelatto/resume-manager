import type { LookupAddress } from "node:dns";
import { afterEach, describe, expect, it, vi } from "vitest";
import { linkedInJobPage } from "@/core/posting/linkedin-page.testing";
import { jobKey, platformName } from "@/core/posting/sites";
import {
  checkedLookup,
  createJobFetcher,
  FETCH_TIMEOUT_MS,
  MAX_PAGE_BYTES,
  type PageRequest,
  type PageResponse,
  type ResolveHost,
  type SendRequest,
} from "./job-fetcher";

const PUBLIC = "93.184.216.34";
const JOB = "https://jobs.example.com/backend-engineer";
const PAGE = "<html><body><nav>All jobs</nav><main><h1>Backend Engineer</h1><p>Globex is hiring.</p></main></body></html>";

/** An answer as a fake page gives it. */
interface Page {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array | AsyncIterable<Uint8Array>;
}

const html = (body: string, headers: Record<string, string> = {}): Page => ({
  body,
  headers: { "content-type": "text/html; charset=utf-8", ...headers },
});
const redirect = (location: string, status = 302): Page => ({ status, headers: { location } });

async function* chunks(body: Page["body"]): AsyncIterable<Uint8Array> {
  if (body === undefined) return;
  if (typeof body === "string") yield new TextEncoder().encode(body);
  else if (body instanceof Uint8Array) yield body;
  else yield* body;
}

/** Answers each link with its page; an unknown link fails like a refused connection. No socket is opened. */
function fakeSend(pages: Record<string, () => Page | Promise<Page>>) {
  const calls: PageRequest[] = [];
  let discarded = 0;
  const send: SendRequest = async (request) => {
    calls.push(request);
    const page = pages[request.url.href];
    if (!page) throw new Error("connect ECONNREFUSED");
    const { status = 200, headers = {}, body } = await page();
    const named = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
    const response: PageResponse = {
      status,
      header: (name) => named.get(name) ?? null,
      body: chunks(body),
      discard: () => discarded++,
    };
    return response;
  };
  return { send, calls, urls: () => calls.map((call) => call.url.href), discarded: () => discarded };
}

/** A request that never answers until its signal aborts, like a page that hangs. */
const hanging: SendRequest = (request) =>
  new Promise((_, reject) => request.signal.addEventListener("abort", () => reject(new Error("aborted"))));

/** Every name resolves to a public address unless it is listed. */
function fakeResolver(hosts: Record<string, string[]> = {}) {
  const asked: string[] = [];
  const resolve: ResolveHost = async (hostname) => {
    asked.push(hostname);
    if (hostname.endsWith(".invalid")) throw new Error("ENOTFOUND");
    return hosts[hostname] ?? [PUBLIC];
  };
  return { resolve, asked };
}

describe("createJobFetcher", () => {
  afterEach(() => vi.useRealTimers());

  it("downloads the page and returns its readable text and address", async () => {
    const { send, calls } = fakeSend({ [JOB]: () => html(PAGE) });
    const { resolve, asked } = fakeResolver();

    const result = await createJobFetcher(send, resolve).fetchPosting(JOB);

    expect(result).toEqual({ ok: true, text: "Backend Engineer\nGlobex is hiring.", url: JOB, details: {} });
    expect(asked).toEqual(["jobs.example.com"]);
    expect(calls).toHaveLength(1);
  });

  it("returns the details the page's JobPosting data holds, and its description as the text (F46)", async () => {
    const posting = { "@type": "JobPosting", title: "Backend Engineer", hiringOrganization: { name: "Globex" }, description: "<p>We build payment systems.<\/p>" };
    const page = `<html><head><script type="application/ld+json">${JSON.stringify(posting)}</script></head><body><main><p>Apply now</p></main></body></html>`;
    const { send } = fakeSend({ [JOB]: () => html(page) });

    const result = await createJobFetcher(send, fakeResolver().resolve).fetchPosting(JOB);

    expect(result).toEqual({ ok: true, text: "We build payment systems.", url: JOB, details: { title: "Backend Engineer", company: "Globex" } });
  });

  describe("one lookup per request (F47)", () => {
    it("resolves the name once and connects to the addresses it checked", async () => {
      const { send, calls } = fakeSend({ [JOB]: () => html(PAGE) });
      const { resolve, asked } = fakeResolver({ "jobs.example.com": [PUBLIC, "2606:2800:220:1:248:1893:25c8:1946"] });

      expect(await createJobFetcher(send, resolve).fetchPosting(JOB)).toMatchObject({ ok: true });

      expect(asked).toEqual(["jobs.example.com"]);
      expect(calls.map((call) => [call.url.href, call.addresses])).toEqual([[JOB, [PUBLIC, "2606:2800:220:1:248:1893:25c8:1946"]]]);
    });

    it("never asks a second time, so a name that would answer a private address next is still reached at the public one", async () => {
      const { send, calls } = fakeSend({ [JOB]: () => html(PAGE) });
      const answers = [[PUBLIC], ["127.0.0.1"]];
      let lookups = 0;
      const rebinding: ResolveHost = async () => answers[lookups++];

      expect(await createJobFetcher(send, rebinding).fetchPosting(JOB)).toMatchObject({ ok: true });

      expect(lookups).toBe(1);
      expect(calls[0].addresses).toEqual([PUBLIC]);
    });

    it("connects to an address written in the link without a lookup", async () => {
      const link = `http://${PUBLIC}/jobs/7`;
      const { send, calls } = fakeSend({ [link]: () => html(PAGE) });
      const { resolve, asked } = fakeResolver();

      expect(await createJobFetcher(send, resolve).fetchPosting(link)).toMatchObject({ ok: true });

      expect(asked).toEqual([]);
      expect(calls[0].addresses).toEqual([PUBLIC]);
    });

    it("looks up each redirect's name once, and connects each hop to its own checked address", async () => {
      const { send, calls } = fakeSend({
        "http://short.example.com/x": () => redirect(JOB),
        [JOB]: () => html(PAGE),
      });
      const { resolve, asked } = fakeResolver({ "short.example.com": ["203.0.113.9"] });

      expect(await createJobFetcher(send, resolve).fetchPosting("http://short.example.com/x")).toMatchObject({ ok: true, url: JOB });

      expect(asked).toEqual(["short.example.com", "jobs.example.com"]);
      expect(calls.map((call) => call.addresses)).toEqual([["203.0.113.9"], [PUBLIC]]);
    });
  });

  describe("checkedLookup", () => {
    /** What the lookup hands the connection, called as Node calls it. */
    function looked(addresses: string[], options: { all?: boolean; family?: number }) {
      let answer: { error: NodeJS.ErrnoException | null; address: string | LookupAddress[]; family?: number } | null = null;
      checkedLookup(addresses)("jobs.example.com", options, (error, address, family) => (answer = { error, address, family }));
      return answer;
    }

    it("answers with the checked addresses, never resolving the name", () => {
      const addresses = [PUBLIC, "2606:2800:220:1:248:1893:25c8:1946"];

      expect(looked(addresses, { all: true })).toEqual({
        error: null,
        address: [
          { address: PUBLIC, family: 4 },
          { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
        ],
        family: undefined,
      });
      expect(looked(addresses, {})).toEqual({ error: null, address: PUBLIC, family: 4 });
    });

    it("keeps to the family the connection asks for, and fails when none of the checked addresses has it", () => {
      expect(looked([PUBLIC, "2606:2800:220:1:248:1893:25c8:1946"], { family: 6 })).toEqual({
        error: null,
        address: "2606:2800:220:1:248:1893:25c8:1946",
        family: 6,
      });
      expect(looked([PUBLIC], { family: 6, all: true })).toMatchObject({ error: { code: "ENOTFOUND" } });
    });
  });

  it("names the app in the User-Agent and doesn't imitate a browser (Art. V.10)", async () => {
    const { send, calls } = fakeSend({ [JOB]: () => html(PAGE) });

    await createJobFetcher(send, fakeResolver().resolve).fetchPosting(JOB);

    const headers = calls[0].headers;
    expect(Object.keys(headers)).toEqual(["User-Agent"]);
    expect(headers["User-Agent"]).toMatch(/^ResumeManager\//);
    expect(headers["User-Agent"]).not.toMatch(/Mozilla|Chrome|Safari/);
  });

  it("refuses anything but http and https without asking for it", async () => {
    const { send, calls } = fakeSend({});
    const { resolve, asked } = fakeResolver();
    const fetcher = createJobFetcher(send, resolve);

    expect(await fetcher.fetchPosting("ftp://jobs.example.com/7")).toEqual({ ok: false, reason: "Only http and https links are accepted." });
    expect(await fetcher.fetchPosting("file:///etc/passwd")).toMatchObject({ ok: false });
    expect(await fetcher.fetchPosting("backend engineer")).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("refuses loopback, private and link-local addresses without asking for them", async () => {
    const { send, calls } = fakeSend({});
    const fetcher = createJobFetcher(send, fakeResolver().resolve);

    for (const link of ["http://127.0.0.1:11434/api/tags", "http://localhost:3000/", "http://192.168.1.1/", "http://169.254.169.254/", "http://[::1]/"]) {
      expect(await fetcher.fetchPosting(link), link).toEqual({
        ok: false,
        reason: "This link leads to this computer or a private network, which the app doesn't fetch.",
      });
    }
    expect(calls).toEqual([]);
  });

  it("refuses a public name that resolves to a private address, even next to a public one", async () => {
    const { send, calls } = fakeSend({ [JOB]: () => html(PAGE) });
    const fetcher = (addresses: string[]) => createJobFetcher(send, fakeResolver({ "jobs.example.com": addresses }).resolve);

    for (const addresses of [["127.0.0.1"], ["10.0.0.7"], ["fe80::1"], [PUBLIC, "192.168.0.2"]]) {
      expect(await fetcher(addresses).fetchPosting(JOB)).toMatchObject({ ok: false, reason: expect.stringContaining("private network") });
    }
    expect(calls).toEqual([]);
  });

  it("says when the name doesn't exist", async () => {
    const { send, calls } = fakeSend({});

    const result = await createJobFetcher(send, fakeResolver().resolve).fetchPosting("https://jobs.invalid/7");

    expect(result).toEqual({ ok: false, reason: "Can't find jobs.invalid. Check the link." });
    expect(calls).toEqual([]);
  });

  describe("redirects", () => {
    it("follows them by hand, resolving relative ones, and returns the last address", async () => {
      const { send, urls } = fakeSend({
        "http://short.example.com/x": () => redirect("https://jobs.example.com/old", 301),
        "https://jobs.example.com/old": () => redirect("/backend-engineer", 307),
        [JOB]: () => html(PAGE),
      });
      const { resolve, asked } = fakeResolver();

      const result = await createJobFetcher(send, resolve).fetchPosting("http://short.example.com/x");

      expect(result).toMatchObject({ ok: true, url: JOB });
      expect(urls()).toEqual(["http://short.example.com/x", "https://jobs.example.com/old", JOB]);
      // Every hop's name is resolved and checked.
      expect(asked).toEqual(["short.example.com", "jobs.example.com", "jobs.example.com"]);
    });

    it("refuses a redirect to a private address, a private name or another protocol", async () => {
      const targets = ["http://127.0.0.1:11434/api/tags", "http://169.254.169.254/", "http://intranet.example.com/", "ftp://jobs.example.com/7"];
      for (const target of targets) {
        const { send, urls } = fakeSend({ [JOB]: () => redirect(target), [target]: () => html(PAGE) });
        const { resolve } = fakeResolver({ "intranet.example.com": ["10.0.0.7"] });

        expect(await createJobFetcher(send, resolve).fetchPosting(JOB), target).toMatchObject({ ok: false });
        expect(urls()).toEqual([JOB]);
      }
    });

    it("follows 5 redirects and gives up at the sixth", async () => {
      const chain = (length: number) => {
        const pages: Record<string, () => Page> = {};
        for (let hop = 0; hop < length; hop++) pages[`https://jobs.example.com/${hop}`] = () => redirect(`/${hop + 1}`);
        pages[`https://jobs.example.com/${length}`] = () => html(PAGE);
        return fakeSend(pages);
      };

      const five = chain(5);
      expect(await createJobFetcher(five.send, fakeResolver().resolve).fetchPosting("https://jobs.example.com/0")).toMatchObject({
        ok: true,
        url: "https://jobs.example.com/5",
      });

      const six = chain(6);
      expect(await createJobFetcher(six.send, fakeResolver().resolve).fetchPosting("https://jobs.example.com/0")).toEqual({
        ok: false,
        reason: "The link redirects more than 5 times.",
      });
      expect(six.urls()).toHaveLength(6);
    });
  });

  describe("limits", () => {
    it("gives up after 30 seconds with a clear reason", async () => {
      vi.useFakeTimers();

      const result = createJobFetcher(hanging, fakeResolver().resolve).fetchPosting(JOB);
      await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);

      expect(await result).toEqual({ ok: false, reason: "The page didn't answer within 30 seconds." });
    });

    it("gives up when the name takes too long to resolve", async () => {
      vi.useFakeTimers();
      const { send, calls } = fakeSend({ [JOB]: () => html(PAGE) });

      const result = createJobFetcher(send, () => new Promise(() => {})).fetchPosting(JOB);
      await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);

      expect(await result).toEqual({ ok: false, reason: "The page didn't answer within 30 seconds." });
      expect(calls).toEqual([]);
    });

    it("refuses a page that says it is larger than 5 MB", async () => {
      const { send } = fakeSend({ [JOB]: () => html(PAGE, { "content-length": String(MAX_PAGE_BYTES + 1) }) });

      expect(await createJobFetcher(send, fakeResolver().resolve).fetchPosting(JOB)).toEqual({
        ok: false,
        reason: "The page is larger than 5 MB.",
      });
    });

    it("stops reading a page that turns out larger than 5 MB", async () => {
      let sent = 0;
      let stopped = false;
      const megabyte = new Uint8Array(1024 * 1024).fill(0x20);
      async function* endless() {
        try {
          for (;;) {
            sent++;
            yield megabyte;
          }
        } finally {
          stopped = true;
        }
      }
      const { send, discarded } = fakeSend({ [JOB]: () => ({ body: endless(), headers: { "content-type": "text/html" } }) });

      expect(await createJobFetcher(send, fakeResolver().resolve).fetchPosting(JOB)).toEqual({
        ok: false,
        reason: "The page is larger than 5 MB.",
      });
      expect(stopped).toBe(true);
      expect(discarded()).toBe(1);
      expect(sent).toBeLessThan(10);
    });

    it("accepts a page of exactly 5 MB", async () => {
      const body = `<p>Globex is hiring.</p>`.padEnd(MAX_PAGE_BYTES, " ");
      const { send } = fakeSend({ [JOB]: () => html(body) });

      expect(await createJobFetcher(send, fakeResolver().resolve).fetchPosting(JOB)).toMatchObject({ ok: true, text: "Globex is hiring." });
    });
  });

  it("fails with the reason when the page can't be used", async () => {
    const pages = {
      "https://jobs.example.com/gone": () => ({ status: 404, body: "<p>Not found</p>" }),
      "https://jobs.example.com/blocked": () => ({ status: 403, body: "<p>Security Check</p>" }),
      "https://jobs.example.com/empty": () => html("<html><body><script>render()</script><div id='root'></div></body></html>"),
      "https://jobs.example.com/posting.pdf": () => ({ body: "%PDF", headers: { "content-type": "application/pdf" } }),
      "https://jobs.example.com/nowhere": () => ({ status: 302 }),
    };
    const { send, discarded } = fakeSend(pages);
    const fetcher = createJobFetcher(send, fakeResolver().resolve);
    const reason = async (link: string) => {
      const result = await fetcher.fetchPosting(link);
      return result.ok ? null : result.reason;
    };

    expect(await reason("https://jobs.example.com/gone")).toBe("The page answered 404.");
    expect(await reason("https://jobs.example.com/blocked")).toBe("The page answered 403.");
    expect(await reason("https://jobs.example.com/empty")).toBe("The page has no readable text.");
    expect(await reason("https://jobs.example.com/posting.pdf")).toBe("The link doesn't lead to a web page.");
    expect(await reason("https://jobs.example.com/nowhere")).toBe("The page redirects without saying where to.");
    expect(await reason("https://jobs.example.com/down")).toBe("Can't reach the page. Check the link and your connection.");
    // Every answer that isn't read is dropped: 404, 403, the PDF and the redirect without a target.
    expect(discarded()).toBe(4);
  });

  it("uses any non-empty text, however short", async () => {
    const { send } = fakeSend({ [JOB]: () => html("<p>Hi</p>") });

    expect(await createJobFetcher(send, fakeResolver().resolve).fetchPosting(JOB)).toMatchObject({ ok: true, text: "Hi" });
  });

  it("decodes the page with the charset it names", async () => {
    const latin1 = new Uint8Array([..."<p>Caf".split("").map((c) => c.charCodeAt(0)), 0xe9, ..."</p>".split("").map((c) => c.charCodeAt(0))]);
    const { send } = fakeSend({ [JOB]: () => ({ body: latin1, headers: { "content-type": "text/html; charset=ISO-8859-1" } }) });

    expect(await createJobFetcher(send, fakeResolver().resolve).fetchPosting(JOB)).toMatchObject({ ok: true, text: "Café" });
  });

  it("stops when the run is cancelled", async () => {
    const cancel = new AbortController();

    const result = createJobFetcher(hanging, fakeResolver().resolve).fetchPosting(JOB, cancel.signal);
    await Promise.resolve();
    cancel.abort();

    expect(await result).toEqual({ ok: false, reason: "The run was cancelled." });
  });

  describe("LinkedIn", () => {
    const PUBLIC_PAGE = "https://www.linkedin.com/jobs/view/4321987650";
    const LINKEDIN = `<html><head><title>Globex hiring Backend Engineer in Dublin | LinkedIn</title></head><body><main>
      <div class="description__text"><div class="show-more-less-html__markup"><p>We build payment systems.</p></div></div>
      <section><h2>Similar jobs</h2><p>Frontend Engineer at Initech</p></section></main></body></html>`;

    it("fetches the job's public page for a link copied while logged in", async () => {
      const { send, urls } = fakeSend({ [PUBLIC_PAGE]: () => html(LINKEDIN) });
      const { resolve, asked } = fakeResolver();

      const result = await createJobFetcher(send, resolve).fetchPosting(
        "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4321987650",
      );

      expect(result).toEqual({ ok: true, text: "We build payment systems.", url: PUBLIC_PAGE, details: {} });
      expect(urls()).toEqual([PUBLIC_PAGE]);
      expect(asked).toEqual(["www.linkedin.com"]);
    });

    it("follows LinkedIn's redirect to the country page and reads the job there, as the real page did (F46)", async () => {
      const country = "https://ie.linkedin.com/jobs/view/senior-backend-engineer-at-globex-4321987650";
      const { send, urls } = fakeSend({ [`${PUBLIC_PAGE}/`]: () => redirect(country, 301), [country]: () => html(linkedInJobPage()) });

      const result = await createJobFetcher(send, fakeResolver().resolve).fetchPosting(`${PUBLIC_PAGE}/`);

      expect(urls()).toEqual([`${PUBLIC_PAGE}/`, country]);
      expect(result).toEqual({
        ok: true,
        text: "We build payment systems for small shops.\nWhat you will do\n- Design TypeScript services\n- Run them on PostgreSQL",
        url: country,
        details: {
          title: "Senior Backend Engineer",
          company: "Globex",
          company_url: "https://www.linkedin.com/company/globex",
          location: "Dublin, County Dublin, Ireland",
          hours: "Part-time",
        },
      });
      // Both addresses name the same job, on the same platform.
      expect(jobKey(new URL(country))).toBe(jobKey(new URL(`${PUBLIC_PAGE}/`)));
      expect(platformName(new URL(country))).toBe("LinkedIn");
    });

    it("falls back to the general rules when the description's element is missing", async () => {
      const { send } = fakeSend({ [PUBLIC_PAGE]: () => html(LINKEDIN.replace("show-more-less-html__markup", "other")) });

      const result = await createJobFetcher(send, fakeResolver().resolve).fetchPosting(PUBLIC_PAGE);

      expect(result).toMatchObject({ ok: true, text: expect.stringContaining("Similar jobs") });
    });
  });

  describe("Indeed", () => {
    it("is never requested, as a link or as a redirect's target", async () => {
      const indeed = "https://ie.indeed.com/viewjob?jk=1";
      const { send, urls } = fakeSend({ [JOB]: () => redirect(indeed), [indeed]: () => html(PAGE) });
      const { resolve, asked } = fakeResolver();
      const fetcher = createJobFetcher(send, resolve);
      const blocked = { ok: false, reason: "Indeed blocks automated requests. Paste the posting's text instead." };

      expect(await fetcher.fetchPosting(indeed)).toEqual(blocked);
      expect(await fetcher.fetchPosting(JOB)).toEqual(blocked);
      expect(urls()).toEqual([JOB]);
      expect(asked).toEqual(["jobs.example.com"]);
    });
  });

  it("logs nothing of the page (Art. III.4)", async () => {
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    const { send } = fakeSend({ [JOB]: () => html(PAGE), "https://jobs.example.com/gone": () => ({ status: 500, body: "x" }) });
    const fetcher = createJobFetcher(send, fakeResolver().resolve);

    await fetcher.fetchPosting(JOB);
    await fetcher.fetchPosting("https://jobs.example.com/gone");
    await fetcher.fetchPosting("https://jobs.example.com/down");

    for (const log of logs) expect(log).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
