import { describe, expect, it } from "vitest";
import { assembleProfile, isSkippedProfilePath, type SourceFile } from "./profile";

const required: SourceFile[] = [
  {
    file: "personal.md",
    source: "---\nname: Jane\nemail: jane@example.com\nlocation: { city: Dublin, country: Ireland }\n---\n",
  },
  { file: "summary.md", source: "---\n---\nBackend developer.\n" },
  { file: "skills.md", source: "---\n---\n## Cloud\n- AWS\n" },
  { file: "languages.md", source: "---\nlanguages: [{ name: English, level: C1 }]\n---\n" },
];

const experience = (file: string, company: string): SourceFile => ({
  file,
  source: `---\ncompany: ${company}\nrole: Developer\nstart: 2020-01\nend: present\n---\n`,
});

describe("isSkippedProfilePath", () => {
  it.each(["imports/cv.pdf", "applications/2026-11-05-globex-dev/job.md", ".DS_Store", "experience/.x.md.swp"])(
    "skips %s",
    (file) => expect(isSkippedProfilePath(file)).toBe(true),
  );

  it.each(["personal.md", "experience/2020-01-acme-dev.md", "notes.md"])("keeps %s", (file) =>
    expect(isSkippedProfilePath(file)).toBe(false),
  );
});

describe("assembleProfile", () => {
  it("groups valid files by kind, ordered by path", () => {
    const result = assembleProfile([
      ...required,
      experience("experience/2023-01-acme-dev.md", "Acme"),
      experience("experience/2019-03-initech-dev.md", "Initech"),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.personal.data.name).toBe("Jane");
    expect(result.profile.skills.body).toBe("## Cloud\n- AWS\n");
    expect(result.profile.experience.map((e) => e.data.company)).toEqual(["Initech", "Acme"]);
    expect(result.profile.education).toEqual([]);
  });

  it("ignores imports, applications and hidden files", () => {
    const result = assembleProfile([
      ...required,
      { file: "imports/cv.pdf", source: "%PDF" },
      { file: "applications/2026-11-05-globex-dev/job.md", source: "anything" },
      { file: ".DS_Store", source: "" },
    ]);

    expect(result.ok).toBe(true);
  });

  it("reports every missing required file", () => {
    expect(assembleProfile([required[0], required[2]])).toEqual({
      ok: false,
      errors: [
        { file: "languages.md", problems: ["file is missing"] },
        { file: "summary.md", problems: ["file is missing"] },
      ],
    });
  });

  it("reports files outside the profile layout", () => {
    const result = assembleProfile([
      ...required,
      { file: "notes.md", source: "" },
      experience("experiences/2020-01-acme-dev.md", "Acme"),
    ]);

    expect(result).toEqual({
      ok: false,
      errors: [
        { file: "experiences/2020-01-acme-dev.md", problems: ["not part of the profile layout (constitution Art. IV.3)"] },
        { file: "notes.md", problems: ["not part of the profile layout (constitution Art. IV.3)"] },
      ],
    });
  });

  it("is not usable when any file is invalid", () => {
    const result = assembleProfile([...required, { file: "experience/x.md", source: "---\nrole: Dev\n---\n" }]);

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          file: "experience/x.md",
          problems: ["company: is required", "start: is required", "end: is required"],
        },
      ],
    });
  });
});
