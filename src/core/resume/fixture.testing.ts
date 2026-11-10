import type { ResumeContent } from "./schema";

/** Fictional resume content for tests (Art. III.5). */
export function resumeFixture(): ResumeContent {
  return {
    name: "Jane Doe",
    contact: {
      email: "jane.doe@example.com",
      phone: "+353 87 000 0000",
      location: { city: "Dublin", country: "Ireland" },
      work_authorisation: "Stamp 4",
      links: [{ label: "Portfolio", url: "https://jane-doe.example.com" }],
    },
    labels: {
      summary: "Summary",
      skills: "Technical Skills",
      experience: "Professional Experience",
      education: "Education",
      projects: "Projects",
      certifications: "Certifications",
      languages: "Languages",
      volunteering: "Volunteering",
      awards: "Awards",
      publications: "Publications",
      interests: "Interests",
      availability: "Availability",
      other: "Other",
      present: "Present",
    },
    summary: "Backend developer since 2019.",
    summary_sources: ["summary.md"],
    skills: [{ category: "Languages", items: ["TypeScript", "Python", "Kubernetes"] }],
    experience: [
      {
        role: "Senior Developer",
        company: "Acme",
        location: "Dublin, Ireland",
        start: "2023-01",
        end: "present",
        bullets: ["Cut p95 API latency from 800 ms to 120 ms."],
        sources: ["experience/2023-01-acme-senior-developer.md"],
      },
    ],
    education: [
      {
        degree: "Bachelor of Science",
        field: "Computer Science",
        institution: "Universidade de São Paulo",
        location: "São Paulo, Brazil",
        start: "2015-02",
        end: "2018-12",
        bullets: [],
        sources: ["education/2015-usp-bsc-computer-science.md"],
      },
    ],
    projects: [],
    certifications: [
      {
        name: "AWS Certified Solutions Architect – Associate",
        issuer: "Amazon Web Services",
        date: "2024-06",
        sources: ["certifications/2024-06-aws-solutions-architect.md"],
      },
    ],
    languages: [{ name: "English", level: "C1", sources: ["languages.md"] }],
    extras: { volunteering: [], award: [], publication: [], interest: [], availability: [], other: [] },
  };
}
