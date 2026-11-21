import { describe, expect, it } from "vitest";
import { readPostingPage } from "./details";

/**
 * A job page with the given JSON-LD blocks in its head, written by hand. As on a real page, `</`
 * inside the JSON is written `<\/`, so it can't close the script.
 */
function page(blocks: unknown[], body = "<main><h1>Backend Engineer</h1><p>From the page's main area.</p></main>"): string {
  const json = (block: unknown) => (typeof block === "string" ? block : JSON.stringify(block).replace(/<\//g, "<\\/"));
  const scripts = blocks.map((block) => `<script type="application/ld+json">${json(block)}</script>`).join("\n");
  return `<!doctype html><html><head><title>Backend Engineer - Globex</title>${scripts}</head><body>${body}</body></html>`;
}

const POSTING = {
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Senior Backend Engineer",
  description: "<p>We build payment systems.</p><ul><li>TypeScript</li><li>PostgreSQL</li></ul>",
  datePosted: "2026-11-01",
  hiringOrganization: { "@type": "Organization", name: "Globex", sameAs: "https://globex.example/", logo: "https://globex.example/logo.png" },
  jobLocation: {
    "@type": "Place",
    address: { "@type": "PostalAddress", streetAddress: "1 Main Street", addressLocality: "Dublin", addressRegion: "County Dublin", postalCode: "D02", addressCountry: "IE" },
  },
  baseSalary: {
    "@type": "MonetaryAmount",
    currency: "EUR",
    value: { "@type": "QuantitativeValue", minValue: 60000, maxValue: 70000, unitText: "YEAR" },
  },
  employmentType: "FULL_TIME",
};

const details = (posting: Record<string, unknown>) => readPostingPage(page([{ "@type": "JobPosting", ...posting }])).details;

describe("readPostingPage (F46)", () => {
  it("gives every detail a JobPosting holds, and its description as the text", () => {
    expect(readPostingPage(page([POSTING]))).toEqual({
      details: {
        title: "Senior Backend Engineer",
        company: "Globex",
        company_url: "https://globex.example/",
        location: "Dublin, County Dublin, IE",
        salary: "€60,000–€70,000 a year",
        hours: "Full-time",
      },
      text: "We build payment systems.\n- TypeScript\n- PostgreSQL",
    });
  });

  it("gives no details for a page without JobPosting data, and reads its main area", () => {
    const other = { "@context": "https://schema.org", "@type": "Organization", name: "Globex" };
    for (const html of [page([]), page([other]), page(["{ not json"])]) {
      expect(readPostingPage(html)).toEqual({ details: {}, text: "Backend Engineer\nFrom the page's main area." });
    }
  });

  it("finds the JobPosting in a list, a @graph, a page's mainEntity, with @type as a list or a full name", () => {
    const posting = { "@type": "JobPosting", title: "Data Engineer" };
    const blocks = [
      [{ "@type": "BreadcrumbList" }, posting],
      { "@context": "https://schema.org", "@graph": [{ "@type": "WebSite" }, posting] },
      { "@type": "WebPage", mainEntity: posting },
      { ...posting, "@type": ["Thing", "JobPosting"] },
      { ...posting, "@type": "http://schema.org/JobPosting" },
    ];
    for (const block of blocks) expect(readPostingPage(page([block])).details).toEqual({ title: "Data Engineer" });
  });

  it("skips a block that doesn't parse and reads the next one", () => {
    expect(readPostingPage(page(["{ broken", { "@type": "JobPosting", title: "QA Engineer" }])).details).toEqual({ title: "QA Engineer" });
  });

  it("reads the script whatever the case and spacing of its type", () => {
    const html = `<html><head><script type=" Application/LD+JSON ">${JSON.stringify({ "@type": "JobPosting", title: "SRE" })}</script></head><body><p>x</p></body></html>`;
    expect(readPostingPage(html).details).toEqual({ title: "SRE" });
  });

  it("keeps each value as plain text on one line", () => {
    expect(details({ title: "  Backend\n  Engineer &amp; <b>SRE</b> ", hiringOrganization: { name: "Globex &amp; Co" } })).toEqual({
      title: "Backend Engineer & SRE",
      company: "Globex & Co",
    });
  });

  it("leaves out empty values and values that aren't text", () => {
    expect(details({ title: "  ", hiringOrganization: { name: { first: "x" } }, workHours: null, jobLocation: [] })).toEqual({});
  });

  describe("the company", () => {
    it("takes the name of the first organisation, or the organisation written as text", () => {
      expect(details({ hiringOrganization: [{ name: "Globex" }, { name: "Initech" }] })).toEqual({ company: "Globex" });
      expect(details({ hiringOrganization: "Globex" })).toEqual({ company: "Globex" });
    });

    it("takes its website from sameAs, otherwise url, only as an http or https address (Art. II.7)", () => {
      expect(details({ hiringOrganization: { name: "G", sameAs: ["javascript:alert(1)", "https://globex.example"] } })).toEqual({
        company: "G",
        company_url: "https://globex.example/",
      });
      expect(details({ hiringOrganization: { name: "G", url: "http://globex.example/about" } })).toMatchObject({
        company_url: "http://globex.example/about",
      });
      for (const website of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "globex.example", "//globex.example", "ftp://globex.example"]) {
        expect(details({ hiringOrganization: { name: "G", sameAs: website, url: website } }), website).toEqual({ company: "G" });
      }
    });
  });

  describe("the location", () => {
    it("joins town, region and country, without repeating one, and the places with a semicolon", () => {
      expect(
        details({
          jobLocation: [
            { address: { addressLocality: "Dublin", addressRegion: "Dublin", addressCountry: { "@type": "Country", name: "Ireland" } } },
            { address: { addressLocality: "Cork", addressCountry: "Ireland" } },
            { address: { addressLocality: "dublin", addressCountry: "ireland" } },
          ],
        }),
      ).toEqual({ location: "Dublin, Ireland; Cork, Ireland" });
    });

    it("takes an address or a place written as text, or the place's name", () => {
      expect(details({ jobLocation: { address: "Dublin 2, Ireland" } })).toEqual({ location: "Dublin 2, Ireland" });
      expect(details({ jobLocation: "Galway" })).toEqual({ location: "Galway" });
      expect(details({ jobLocation: { name: "Head office", address: { streetAddress: "1 Main Street" } } })).toEqual({ location: "Head office" });
    });

    it("takes where a remote job's applicants must be when there is no jobLocation", () => {
      expect(
        details({ jobLocationType: "TELECOMMUTE", applicantLocationRequirements: [{ "@type": "Country", name: "Ireland" }, { name: "United Kingdom" }] }),
      ).toEqual({ location: "Ireland; United Kingdom", work_model: "remote" });
    });
  });

  describe("the salary", () => {
    const salary = (baseSalary: unknown, extra: Record<string, unknown> = {}) => details({ baseSalary, ...extra }).salary;

    it("writes an amount or a range in its currency, with the period it is paid for", () => {
      expect(salary({ currency: "EUR", value: { value: 65000, unitText: "YEAR" } })).toBe("€65,000 a year");
      expect(salary({ currency: "USD", value: { minValue: 45.5, maxValue: 50, unitText: "hour" } })).toBe("$45.50–$50 an hour");
      expect(salary({ currency: "GBP", value: { minValue: 400, maxValue: 400, unitText: "DAY" } })).toBe("£400 a day");
      expect(salary({ currency: "EUR", value: { minValue: "3000", maxValue: "3500", unitText: "MONTH" } })).toBe("€3,000–€3,500 a month");
      expect(salary({ currency: "EUR", value: { value: 900, unitText: "WEEK" } })).toBe("€900 a week");
    });

    it("says From or Up to for a range with one end", () => {
      expect(salary({ currency: "EUR", value: { minValue: 60000, unitText: "YEAR" } })).toBe("From €60,000 a year");
      expect(salary({ currency: "EUR", value: { maxValue: 70000 } })).toBe("Up to €70,000");
    });

    it("keeps a period it doesn't know as written, and a value that isn't a number as written", () => {
      expect(salary({ currency: "EUR", value: { value: 500, unitText: "SHIFT" } })).toBe("€500 SHIFT");
      expect(salary({ currency: "EUR", value: { value: "60k–70k DOE" } })).toBe("60k–70k DOE");
      expect(salary("Competitive")).toBe("Competitive");
    });

    it("writes the number with the currency as written when it isn't a currency code, and alone without one", () => {
      expect(salary({ currency: "Euro", value: 60000 })).toBe("60,000 Euro");
      expect(salary({ value: { value: 60000, unitText: "YEAR" } })).toBe("60,000 a year");
      expect(salary(55000, { salaryCurrency: "EUR" })).toBe("€55,000");
    });

    it("is left out when no amount is given", () => {
      expect(salary({ currency: "EUR", value: { unitText: "YEAR" } })).toBeUndefined();
    });
  });

  describe("the work model and the hours", () => {
    it("reads a telecommuting job as remote, and nothing else as a work model", () => {
      expect(details({ jobLocationType: ["telecommute"] })).toEqual({ work_model: "remote" });
      expect(details({ jobLocationType: "ONSITE" })).toEqual({});
    });

    it("takes the working hours as written, before the employment type", () => {
      expect(details({ workHours: "40 hours a week", employmentType: "FULL_TIME" })).toEqual({ hours: "40 hours a week" });
    });

    it("reads full-time and part-time from the employment type, and no hours from the other types", () => {
      expect(details({ employmentType: ["FULL_TIME", "PART_TIME", "Full-Time"] })).toEqual({ hours: "Full-time, Part-time" });
      expect(details({ employmentType: "PART TIME" })).toEqual({ hours: "Part-time" });
      expect(details({ employmentType: ["CONTRACTOR", "TEMPORARY", "INTERN"] })).toEqual({});
    });
  });

  describe("the description", () => {
    const text = (description: unknown) => readPostingPage(page([{ "@type": "JobPosting", description }])).text;

    it("reads HTML escaped a second time", () => {
      expect(text("&lt;p&gt;We build &amp;amp; run.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Go&lt;/li&gt;&lt;/ul&gt;")).toBe("We build & run.\n- Go");
    });

    it("keeps the lines of a plain-text description", () => {
      expect(text("We build payment systems.\n\n  You know TypeScript &amp; Go.  \n")).toBe("We build payment systems.\nYou know TypeScript & Go.");
    });

    it("drops scripts and styles inside the description", () => {
      expect(text("<p>Apply now</p><script>steal()</script><style>p{}</style>")).toBe("Apply now");
    });

    it("reads the page's main area when the description is empty or missing", () => {
      for (const description of ["", "<p> </p>", undefined, 42]) {
        expect(text(description)).toBe(description === 42 ? "42" : "Backend Engineer\nFrom the page's main area.");
      }
    });

    it("comes after LinkedIn's own description element on LinkedIn", () => {
      const body = `<main><div class="show-more-less-html__markup"><p>From LinkedIn's element.</p></div></main>`;
      expect(readPostingPage(page([POSTING], body), { linkedIn: true }).text).toBe("Backend Engineer - Globex\nFrom LinkedIn's element.");
      expect(readPostingPage(page([POSTING], body)).text).toBe("We build payment systems.\n- TypeScript\n- PostgreSQL");
    });
  });
});
