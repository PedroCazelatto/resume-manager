import { describe, expect, it } from "vitest";
import { jobDetails, jobPlatform, jobSummary, jobTitle } from "./job";
import type { Job } from "./schemas";

const NEW: Job = {
  title: "Senior Backend Engineer",
  company: "Globex",
  company_url: "https://globex.example/",
  url: "https://www.linkedin.com/jobs/view/4321987650",
  source: "LinkedIn",
  fetched_at: "2026-11-21T14:02:11Z",
  language: "en",
  location: "Dublin, Ireland",
  salary: "€60,000–€70,000 a year",
  work_model: "hybrid",
  hours: "Full-time",
};

/** A job.md written before F46. */
const OLD: Job = {
  source: "url",
  url: "https://ie.indeed.com/viewjob?jk=1",
  fetched_at: "2026-11-10T10:00:00Z",
  company: "Globex",
  role: "Backend Engineer",
  language: "en",
};

describe("reading job.md (F46)", () => {
  it("reads the title, and an older file's role as its title", () => {
    expect(jobTitle(NEW)).toBe("Senior Backend Engineer");
    expect(jobTitle(OLD)).toBe("Backend Engineer");
    expect(jobTitle({ ...NEW, role: "Old title" })).toBe("Senior Backend Engineer");
    expect(jobTitle({ url: NEW.url, source: "LinkedIn" })).toBeUndefined();
  });

  it("reads the platform, and names an older file's from its link", () => {
    expect(jobPlatform(NEW)).toBe("LinkedIn");
    expect(jobPlatform(OLD)).toBe("Indeed");
    expect(jobPlatform({ ...OLD, source: "paste", url: "https://jobs.example.com/7" })).toBe("jobs.example.com");
    expect(jobPlatform({ ...OLD, source: "paste", url: undefined })).toBeUndefined();
  });

  it("gives the details the prompts carry, and the summary a run tells", () => {
    expect(jobDetails(NEW)).toEqual({
      title: "Senior Backend Engineer",
      company: "Globex",
      company_url: "https://globex.example/",
      location: "Dublin, Ireland",
      salary: "€60,000–€70,000 a year",
      work_model: "hybrid",
      hours: "Full-time",
    });
    expect(jobDetails(OLD)).toEqual({ title: "Backend Engineer", company: "Globex" });
    expect(jobSummary(NEW)).toEqual({ title: "Senior Backend Engineer", company: "Globex", companyUrl: "https://globex.example/", source: "LinkedIn" });
    expect(jobSummary(OLD)).toEqual({ title: "Backend Engineer", company: "Globex", source: "Indeed" });
  });
});
