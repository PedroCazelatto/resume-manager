import { describe, expect, it } from "vitest";
import { isIndeedUrl, isLinkedInUrl, rewriteLinkedInUrl } from "./sites";

const rewritten = (link: string) => rewriteLinkedInUrl(new URL(link)).href;

describe("isIndeedUrl", () => {
  it("recognises indeed.com and its country subdomains", () => {
    for (const link of ["https://indeed.com/viewjob?jk=1", "https://ie.indeed.com/viewjob?jk=1", "http://WWW.Indeed.com./jobs"]) {
      expect(isIndeedUrl(new URL(link)), link).toBe(true);
    }
  });

  it("doesn't take another site for Indeed", () => {
    for (const link of ["https://notindeed.com/job", "https://indeed.com.example.org/job", "https://example.com/indeed.com"]) {
      expect(isIndeedUrl(new URL(link)), link).toBe(false);
    }
  });
});

describe("rewriteLinkedInUrl", () => {
  it("turns a link copied while logged in into the job's public page", () => {
    const page = "https://www.linkedin.com/jobs/view/4321987650";
    expect(rewritten("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4321987650")).toBe(page);
    expect(rewritten("https://www.linkedin.com/jobs/search/?currentJobId=4321987650&keywords=developer")).toBe(page);
    expect(rewritten("http://ie.linkedin.com/jobs/search?keywords=x&currentJobId=4321987650")).toBe(page);
  });

  it("leaves every other link as it is", () => {
    const links = [
      "https://www.linkedin.com/jobs/view/4321987650?trk=public_jobs",
      "https://www.linkedin.com/jobs/search/?keywords=developer",
      "https://www.linkedin.com/jobs/search/?currentJobId=abc",
      "https://www.linkedin.com/feed/?currentJobId=4321987650",
      "https://jobs.example.com/jobs/search/?currentJobId=4321987650",
      "https://notlinkedin.com/jobs/search/?currentJobId=4321987650",
    ];
    for (const link of links) expect(rewritten(link)).toBe(link);
  });
});

describe("isLinkedInUrl", () => {
  it("recognises linkedin.com and its subdomains only", () => {
    expect(isLinkedInUrl(new URL("https://ie.linkedin.com/jobs/view/1"))).toBe(true);
    expect(isLinkedInUrl(new URL("https://linkedin.com.example.org/jobs/view/1"))).toBe(false);
  });
});
