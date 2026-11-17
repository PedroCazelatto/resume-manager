import { afterEach, describe, expect, it, vi } from "vitest";
import { createJobFetcher, FETCH_TIMEOUT_MS, MAX_PAGE_BYTES, type ResolveHost } from "./job-fetcher";

const PUBLIC = "93.184.216.34";
const JOB = "https://jobs.example.com/backend-engineer";
const PAGE = "<html><body><nav>All jobs</nav><main><h1>Backend Engineer</h1><p>Globex is hiring.</p></main></body></html>";

const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { headers: { "content-type": "text/html; charset=utf-8", ...headers } });
const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });

/** Answers each link with its page; an unknown link fails like a refused connection. */
function fakeFetch(pages: Record<string, () => Response | Promise<Response>>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const page = pages[url];
    if (!page) throw new TypeError("fetch failed");
    return page();
  };
  return { fetchImpl, calls, urls: () => calls.map((call) => call.url) };
}

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
    const { fetchImpl, calls } = fakeFetch({ [JOB]: () => html(PAGE) });
    const { resolve, asked } = fakeResolver();

    const result = await createJobFetcher(fetchImpl, resolve).fetchPosting(JOB);

    expect(result).toEqual({ ok: true, text: "Backend Engineer\nGlobex is hiring.", url: JOB });
    expect(asked).toEqual(["jobs.example.com"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.redirect).toBe("manual");
  });

  it("names the app in the User-Agent and doesn't imitate a browser (Art. V.10)", async () => {
    const { fetchImpl, calls } = fakeFetch({ [JOB]: () => html(PAGE) });

    await createJobFetcher(fetchImpl, fakeResolver().resolve).fetchPosting(JOB);

    const headers = calls[0].init.headers as Record<string, string>;
    expect(Object.keys(headers)).toEqual(["User-Agent"]);
    expect(headers["User-Agent"]).toMatch(/^ResumeManager\//);
    expect(headers["User-Agent"]).not.toMatch(/Mozilla|Chrome|Safari/);
  });

  it("refuses anything but http and https without asking for it", async () => {
    const { fetchImpl, calls } = fakeFetch({});
    const { resolve, asked } = fakeResolver();
    const fetcher = createJobFetcher(fetchImpl, resolve);

    expect(await fetcher.fetchPosting("ftp://jobs.example.com/7")).toEqual({ ok: false, reason: "Only http and https links are accepted." });
    expect(await fetcher.fetchPosting("file:///etc/passwd")).toMatchObject({ ok: false });
    expect(await fetcher.fetchPosting("backend engineer")).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("refuses loopback, private and link-local addresses without asking for them", async () => {
    const { fetchImpl, calls } = fakeFetch({});
    const fetcher = createJobFetcher(fetchImpl, fakeResolver().resolve);

    for (const link of ["http://127.0.0.1:11434/api/tags", "http://localhost:3000/", "http://192.168.1.1/", "http://169.254.169.254/", "http://[::1]/"]) {
      expect(await fetcher.fetchPosting(link), link).toEqual({
        ok: false,
        reason: "This link leads to this computer or a private network, which the app doesn't fetch.",
      });
    }
    expect(calls).toEqual([]);
  });

  it("refuses a public name that resolves to a private address, even next to a public one", async () => {
    const { fetchImpl, calls } = fakeFetch({ [JOB]: () => html(PAGE) });
    const fetcher = (addresses: string[]) => createJobFetcher(fetchImpl, fakeResolver({ "jobs.example.com": addresses }).resolve);

    for (const addresses of [["127.0.0.1"], ["10.0.0.7"], ["fe80::1"], [PUBLIC, "192.168.0.2"]]) {
      expect(await fetcher(addresses).fetchPosting(JOB)).toMatchObject({ ok: false, reason: expect.stringContaining("private network") });
    }
    expect(calls).toEqual([]);
  });

  it("says when the name doesn't exist", async () => {
    const { fetchImpl, calls } = fakeFetch({});

    const result = await createJobFetcher(fetchImpl, fakeResolver().resolve).fetchPosting("https://jobs.invalid/7");

    expect(result).toEqual({ ok: false, reason: "Can't find jobs.invalid. Check the link." });
    expect(calls).toEqual([]);
  });

  describe("redirects", () => {
    it("follows them by hand, resolving relative ones, and returns the last address", async () => {
      const { fetchImpl, urls } = fakeFetch({
        "http://short.example.com/x": () => redirect("https://jobs.example.com/old", 301),
        "https://jobs.example.com/old": () => redirect("/backend-engineer", 307),
        [JOB]: () => html(PAGE),
      });
      const { resolve, asked } = fakeResolver();

      const result = await createJobFetcher(fetchImpl, resolve).fetchPosting("http://short.example.com/x");

      expect(result).toMatchObject({ ok: true, url: JOB });
      expect(urls()).toEqual(["http://short.example.com/x", "https://jobs.example.com/old", JOB]);
      // Every hop's name is resolved and checked.
      expect(asked).toEqual(["short.example.com", "jobs.example.com", "jobs.example.com"]);
    });

    it("refuses a redirect to a private address, a private name or another protocol", async () => {
      const targets = ["http://127.0.0.1:11434/api/tags", "http://169.254.169.254/", "http://intranet.example.com/", "ftp://jobs.example.com/7"];
      for (const target of targets) {
        const { fetchImpl, urls } = fakeFetch({ [JOB]: () => redirect(target), [target]: () => html(PAGE) });
        const { resolve } = fakeResolver({ "intranet.example.com": ["10.0.0.7"] });

        expect(await createJobFetcher(fetchImpl, resolve).fetchPosting(JOB), target).toMatchObject({ ok: false });
        expect(urls()).toEqual([JOB]);
      }
    });

    it("follows 5 redirects and gives up at the sixth", async () => {
      const chain = (length: number) => {
        const pages: Record<string, () => Response> = {};
        for (let hop = 0; hop < length; hop++) pages[`https://jobs.example.com/${hop}`] = () => redirect(`/${hop + 1}`);
        pages[`https://jobs.example.com/${length}`] = () => html(PAGE);
        return fakeFetch(pages);
      };

      const five = chain(5);
      expect(await createJobFetcher(five.fetchImpl, fakeResolver().resolve).fetchPosting("https://jobs.example.com/0")).toMatchObject({
        ok: true,
        url: "https://jobs.example.com/5",
      });

      const six = chain(6);
      expect(await createJobFetcher(six.fetchImpl, fakeResolver().resolve).fetchPosting("https://jobs.example.com/0")).toEqual({
        ok: false,
        reason: "The link redirects more than 5 times.",
      });
      expect(six.urls()).toHaveLength(6);
    });
  });

  describe("limits", () => {
    it("gives up after 30 seconds with a clear reason", async () => {
      vi.useFakeTimers();
      const hanging: typeof fetch = (_input, init) =>
        new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

      const result = createJobFetcher(hanging, fakeResolver().resolve).fetchPosting(JOB);
      await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);

      expect(await result).toEqual({ ok: false, reason: "The page didn't answer within 30 seconds." });
    });

    it("gives up when the name takes too long to resolve", async () => {
      vi.useFakeTimers();
      const { fetchImpl, calls } = fakeFetch({ [JOB]: () => html(PAGE) });

      const result = createJobFetcher(fetchImpl, () => new Promise(() => {})).fetchPosting(JOB);
      await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);

      expect(await result).toEqual({ ok: false, reason: "The page didn't answer within 30 seconds." });
      expect(calls).toEqual([]);
    });

    it("refuses a page that says it is larger than 5 MB", async () => {
      const { fetchImpl } = fakeFetch({ [JOB]: () => html(PAGE, { "content-length": String(MAX_PAGE_BYTES + 1) }) });

      expect(await createJobFetcher(fetchImpl, fakeResolver().resolve).fetchPosting(JOB)).toEqual({
        ok: false,
        reason: "The page is larger than 5 MB.",
      });
    });

    it("stops reading a page that turns out larger than 5 MB", async () => {
      let sent = 0;
      let cancelled = false;
      const megabyte = new Uint8Array(1024 * 1024).fill(0x20);
      const endless = new ReadableStream<Uint8Array>({
        pull(controller) {
          sent++;
          controller.enqueue(megabyte);
        },
        cancel() {
          cancelled = true;
        },
      });
      const { fetchImpl } = fakeFetch({ [JOB]: () => new Response(endless, { headers: { "content-type": "text/html" } }) });

      expect(await createJobFetcher(fetchImpl, fakeResolver().resolve).fetchPosting(JOB)).toEqual({
        ok: false,
        reason: "The page is larger than 5 MB.",
      });
      expect(cancelled).toBe(true);
      expect(sent).toBeLessThan(10);
    });

    it("accepts a page of exactly 5 MB", async () => {
      const body = `<p>Globex is hiring.</p>`.padEnd(MAX_PAGE_BYTES, " ");
      const { fetchImpl } = fakeFetch({ [JOB]: () => html(body) });

      expect(await createJobFetcher(fetchImpl, fakeResolver().resolve).fetchPosting(JOB)).toMatchObject({ ok: true, text: "Globex is hiring." });
    });
  });

  it("fails with the reason when the page can't be used", async () => {
    const pages = {
      "https://jobs.example.com/gone": () => new Response("<p>Not found</p>", { status: 404 }),
      "https://jobs.example.com/blocked": () => new Response("<p>Security Check</p>", { status: 403 }),
      "https://jobs.example.com/empty": () => html("<html><body><script>render()</script><div id='root'></div></body></html>"),
      "https://jobs.example.com/posting.pdf": () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
      "https://jobs.example.com/nowhere": () => new Response(null, { status: 302 }),
    };
    const fetcher = createJobFetcher(fakeFetch(pages).fetchImpl, fakeResolver().resolve);
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
  });

  it("uses any non-empty text, however short", async () => {
    const { fetchImpl } = fakeFetch({ [JOB]: () => html("<p>Hi</p>") });

    expect(await createJobFetcher(fetchImpl, fakeResolver().resolve).fetchPosting(JOB)).toMatchObject({ ok: true, text: "Hi" });
  });

  it("decodes the page with the charset it names", async () => {
    const latin1 = new Uint8Array([..."<p>Caf".split("").map((c) => c.charCodeAt(0)), 0xe9, ..."</p>".split("").map((c) => c.charCodeAt(0))]);
    const { fetchImpl } = fakeFetch({ [JOB]: () => new Response(latin1, { headers: { "content-type": "text/html; charset=ISO-8859-1" } }) });

    expect(await createJobFetcher(fetchImpl, fakeResolver().resolve).fetchPosting(JOB)).toMatchObject({ ok: true, text: "Café" });
  });

  it("stops when the run is cancelled", async () => {
    const cancel = new AbortController();
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

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
      const { fetchImpl, urls } = fakeFetch({ [PUBLIC_PAGE]: () => html(LINKEDIN) });
      const { resolve, asked } = fakeResolver();

      const result = await createJobFetcher(fetchImpl, resolve).fetchPosting(
        "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4321987650",
      );

      expect(result).toEqual({
        ok: true,
        text: "Globex hiring Backend Engineer in Dublin | LinkedIn\nWe build payment systems.",
        url: PUBLIC_PAGE,
      });
      expect(urls()).toEqual([PUBLIC_PAGE]);
      expect(asked).toEqual(["www.linkedin.com"]);
    });

    it("falls back to the general rules when the description's element is missing", async () => {
      const { fetchImpl } = fakeFetch({ [PUBLIC_PAGE]: () => html(LINKEDIN.replace("show-more-less-html__markup", "other")) });

      const result = await createJobFetcher(fetchImpl, fakeResolver().resolve).fetchPosting(PUBLIC_PAGE);

      expect(result).toMatchObject({ ok: true, text: expect.stringContaining("Similar jobs") });
    });
  });

  describe("Indeed", () => {
    it("is never requested, as a link or as a redirect's target", async () => {
      const indeed = "https://ie.indeed.com/viewjob?jk=1";
      const { fetchImpl, urls } = fakeFetch({ [JOB]: () => redirect(indeed), [indeed]: () => html(PAGE) });
      const { resolve, asked } = fakeResolver();
      const fetcher = createJobFetcher(fetchImpl, resolve);
      const blocked = { ok: false, reason: "Indeed blocks automated requests. Paste the posting's text instead." };

      expect(await fetcher.fetchPosting(indeed)).toEqual(blocked);
      expect(await fetcher.fetchPosting(JOB)).toEqual(blocked);
      expect(urls()).toEqual([JOB]);
      expect(asked).toEqual(["jobs.example.com"]);
    });
  });

  it("logs nothing of the page (Art. III.4)", async () => {
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    const { fetchImpl } = fakeFetch({ [JOB]: () => html(PAGE), "https://jobs.example.com/gone": () => new Response("x", { status: 500 }) });
    const fetcher = createJobFetcher(fetchImpl, fakeResolver().resolve);

    await fetcher.fetchPosting(JOB);
    await fetcher.fetchPosting("https://jobs.example.com/gone");
    await fetcher.fetchPosting("https://jobs.example.com/down");

    for (const log of logs) expect(log).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
