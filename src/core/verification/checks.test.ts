import { describe, expect, it } from "vitest";
import { assembleProfile, type Profile, type SourceFile } from "../profile/profile";
import { resumeFixture } from "../resume/fixture.testing";
import { checkResume, numbersIn } from "./checks";

const ACME = "experience/2023-01-acme-senior-developer.md";

const sources: SourceFile[] = [
  {
    file: "personal.md",
    source:
      "---\nname: Jane Doe\nemail: jane.doe@example.com\nphone: '+353 87 000 0000'\nlocation: { city: Dublin, country: Ireland }\nwork_authorisation: Stamp 4\n---\n",
  },
  { file: "summary.md", source: "---\n---\nBackend developer since 2019.\n" },
  { file: "skills.md", source: "---\n---\n## Languages\n- TypeScript\n- Python\n" },
  { file: "languages.md", source: "---\nlanguages: [{ name: English, level: C1 }]\n---\n" },
  {
    file: ACME,
    source: "---\ncompany: Acme\nrole: Senior Developer\nstart: 2023-01\nend: present\n---\n- Cut p95 API latency from 800 ms to 120 ms.\n",
  },
  {
    file: "experience/2019-03-initech-software-developer.md",
    source: "---\ncompany: Initech\nrole: Software Developer\nstart: 2019-03\nend: 2022-12\n---\n- Served 1,500 customers.\n",
  },
  {
    file: "education/2015-usp-bsc-computer-science.md",
    source: "---\ninstitution: Universidade de São Paulo\ndegree: Bachelor of Science\nstart: 2015-02\nend: 2018-12\n---\n",
  },
  {
    file: "certifications/2024-06-aws-solutions-architect.md",
    source: "---\nname: AWS Certified Solutions Architect – Associate\nissuer: Amazon Web Services\ndate: 2024-06\n---\n",
  },
];

function profile(): Profile {
  const result = assembleProfile(sources);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.profile;
}

describe("numbersIn", () => {
  it("reads numbers and ignores how thousands and decimals are written", () => {
    expect(numbersIn("From 800 ms to 120 ms, p95")).toEqual(["800", "120", "95"]);
    expect(numbersIn("1,500 users, 1.500 usuários, 2,5 s, 2.5 s")).toEqual(["1500", "1500", "2.5", "2.5"]);
    expect(numbersIn("No numbers")).toEqual([]);
  });
});

describe("checkResume", () => {
  it("passes a resume whose employers, institutions, dates and numbers are in the cited files", () => {
    expect(checkResume(profile(), resumeFixture())).toEqual([]);
  });

  it("flags an employer that isn't in the cited files", () => {
    const resume = resumeFixture();
    resume.experience[0].company = "Globex";

    expect(checkResume(profile(), resume)).toEqual([
      {
        check: "deterministic",
        where: "experience[0].company",
        claim: "Globex",
        problem: `the employer isn't in ${ACME}`,
        dismissed: false,
      },
    ]);
  });

  it("matches names whatever their case and spacing", () => {
    const resume = resumeFixture();
    resume.experience[0].company = " ACME ";
    resume.education[0].institution = "universidade de  são paulo";

    expect(checkResume(profile(), resume)).toEqual([]);
  });

  it("flags an institution that isn't in the cited files", () => {
    const resume = resumeFixture();
    resume.education[0].institution = "Trinity College Dublin";

    expect(checkResume(profile(), resume).map((f) => f.where)).toEqual(["education[0].institution"]);
  });

  it("flags a date the cited file doesn't have, even when another file does", () => {
    const resume = resumeFixture();
    resume.experience[0].start = "2019-03";
    resume.certifications[0].date = "2024-07";

    expect(checkResume(profile(), resume).map((f) => [f.where, f.claim])).toEqual([
      ["experience[0].start", "2019-03"],
      ["certifications[0].date", "2024-07"],
    ]);
  });

  it("flags a number the cited file doesn't have", () => {
    const resume = resumeFixture();
    resume.experience[0].bullets = ["Cut p95 API latency from 800 ms to 100 ms for 1,500 customers."];
    resume.summary = "Backend developer with 7 years of experience.";

    expect(checkResume(profile(), resume).map((f) => [f.where, f.problem])).toEqual([
      ["summary", "the number 7 isn't in summary.md"],
      ["experience[0].bullets[0]", `the number 100 isn't in ${ACME}`],
      ["experience[0].bullets[0]", `the number 1500 isn't in ${ACME}`],
    ]);
  });

  it("accepts a number written with other separators", () => {
    const resume = resumeFixture();
    resume.experience[0] = {
      ...resume.experience[0],
      company: "Initech",
      start: "2019-03",
      end: "2022-12",
      bullets: ["Atendeu 1.500 clientes."],
      sources: ["experience/2019-03-initech-software-developer.md"],
    };

    expect(checkResume(profile(), resume)).toEqual([]);
  });

  it("checks skill numbers against the whole profile and contact numbers against personal.md", () => {
    const resume = resumeFixture();
    resume.skills[0].items.push("Python 3");
    resume.contact.phone = "+353 87 000 0001";

    expect(checkResume(profile(), resume).map((f) => [f.where, f.problem])).toEqual([
      ["contact.phone", "the number 0001 isn't in personal.md"],
      ["skills[0].items[3]", "the number 3 isn't in the profile"],
    ]);
  });

  it("flags items that cite nothing or cite a file that isn't in the profile", () => {
    const resume = resumeFixture();
    resume.summary_sources = [];
    resume.languages[0].sources = ["notes.md"];

    expect(checkResume(profile(), resume).map((f) => [f.where, f.claim, f.problem])).toEqual([
      ["summary_sources", "(none)", "cites no profile file"],
      ["summary", "Backend developer since 2019.", "the number 2019 isn't in any cited file"],
      ["languages[0].sources", "notes.md", "cites a file that isn't in the profile"],
      ["languages[0].level", "C1", "the number 1 isn't in any cited file"],
    ]);
  });
});
