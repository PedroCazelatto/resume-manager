import { describe, expect, it } from "vitest";
import { isIndeedLink, isIndeedUrl, isLinkedInUrl, jobKey, linkedInJobId, linkPlatform, platformName, rewriteLinkedInUrl } from "./sites";

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

describe("isIndeedLink", () => {
  it("reads the link from text", () => {
    expect(isIndeedLink(" https://ie.indeed.com/viewjob?jk=1 ")).toBe(true);
    expect(isIndeedLink("https://jobs.example.com/indeed")).toBe(false);
    expect(isIndeedLink("indeed.com/viewjob?jk=1")).toBe(false);
  });
});

describe("platformName (F46)", () => {
  const platform = (link: string) => platformName(new URL(link));

  it("names LinkedIn and Indeed, with their subdomains", () => {
    expect(platform("https://www.linkedin.com/jobs/view/4321987650")).toBe("LinkedIn");
    expect(platform("https://ie.linkedin.com/jobs/view/backend-engineer-at-globex-4321987650")).toBe("LinkedIn");
    expect(platform("https://indeed.com/viewjob?jk=1")).toBe("Indeed");
    expect(platform("https://ie.indeed.com/viewjob?jk=1")).toBe("Indeed");
    expect(platform("http://WWW.Indeed.com./jobs")).toBe("Indeed");
  });

  it("names another site by its host name without www.", () => {
    expect(platform("https://jobs.example.com/backend-engineer")).toBe("jobs.example.com");
    expect(platform("https://www.Globex.example/careers/1")).toBe("globex.example");
    expect(platform("https://notlinkedin.com/jobs/view/1")).toBe("notlinkedin.com");
    expect(platform("https://indeed.com.example.org/job")).toBe("indeed.com.example.org");
  });
});

describe("linkPlatform", () => {
  it("reads the platform from a link as text, and none from text that isn't a link", () => {
    expect(linkPlatform(" https://www.linkedin.com/jobs/search/?currentJobId=1 ")).toBe("LinkedIn");
    expect(linkPlatform("https://jobs.example.com/7")).toBe("jobs.example.com");
    expect(linkPlatform("jobs.example.com/7")).toBeUndefined();
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

describe("linkedInJobId (F47)", () => {
  const id = (link: string) => linkedInJobId(new URL(link));

  it("reads the job from a link copied while logged in, a job's page and a job's page with words", () => {
    for (const link of [
      "https://www.linkedin.com/jobs/search/?currentJobId=4321987650",
      "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4321987650&keywords=developer",
      "https://www.linkedin.com/jobs/view/4321987650",
      "https://www.linkedin.com/jobs/view/4321987650/",
      "https://www.linkedin.com/jobs/view/4321987650?trk=public_jobs",
      "https://ie.linkedin.com/jobs/view/senior-backend-engineer-at-globex-4321987650",
      "https://www.linkedin.com/jobs/view/engineer-2-at-globex-4321987650?refId=abc",
    ]) {
      expect(id(link), link).toBe("4321987650");
    }
  });

  it("has no job for other links", () => {
    for (const link of [
      "https://www.linkedin.com/jobs/search/?keywords=developer",
      "https://www.linkedin.com/jobs/search/?currentJobId=abc",
      "https://www.linkedin.com/jobs/view/senior-backend-engineer",
      "https://www.linkedin.com/feed/?currentJobId=4321987650",
      "https://www.linkedin.com/company/globex/jobs/view/4321987650",
      "https://jobs.example.com/jobs/view/4321987650",
      "https://notlinkedin.com/jobs/view/4321987650",
    ]) {
      expect(id(link), link).toBeNull();
    }
  });
});

describe("jobKey (F47)", () => {
  const key = (link: string) => jobKey(new URL(link));

  it("is the same for the three LinkedIn forms of one job, and different for two jobs", () => {
    const forms = [
      "https://www.linkedin.com/jobs/search/?currentJobId=4321987650",
      "https://www.linkedin.com/jobs/view/4321987650",
      "https://www.linkedin.com/jobs/view/senior-backend-engineer-at-globex-4321987650",
    ];
    expect(new Set(forms.map(key)).size).toBe(1);
    expect(key("https://www.linkedin.com/jobs/view/4321987651")).not.toBe(key(forms[0]));
  });

  it("is the address itself for any other link", () => {
    expect(key("https://Jobs.Example.com")).toBe(key("https://jobs.example.com/"));
    expect(key("https://jobs.example.com/1")).not.toBe(key("https://jobs.example.com/2"));
  });
});

describe("isLinkedInUrl", () => {
  it("recognises linkedin.com and its subdomains only", () => {
    expect(isLinkedInUrl(new URL("https://ie.linkedin.com/jobs/view/1"))).toBe(true);
    expect(isLinkedInUrl(new URL("https://linkedin.com.example.org/jobs/view/1"))).toBe(false);
  });
});
