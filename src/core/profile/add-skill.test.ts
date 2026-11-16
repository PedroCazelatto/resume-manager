import { describe, expect, it } from "vitest";
import { addSkill, impliedSkillPlacement, listsSkill, skillPlacement } from "./add-skill";

const SKILLS = `---
note: mine
---

## Languages
- TypeScript
- Python

## Cloud and infrastructure
- AWS (Lambda, RDS, SQS)
- Docker

## Data
- PostgreSQL
`;

/** The lines `after` has and `before` doesn't, checking that every line of `before` is kept in order. */
function addedLines(before: string, after: string): string[] {
  const added: string[] = [];
  const kept = before.split("\n");
  for (const line of after.split("\n")) {
    if (line === kept[0]) kept.shift();
    else added.push(line);
  }
  expect(kept).toEqual([]);
  return added;
}

describe("addSkill", () => {
  it("adds one bullet at the end of the matching section and changes nothing else", () => {
    const result = addSkill(SKILLS, "Cloud and infrastructure", "Kubernetes");

    expect(result).toBe(SKILLS.replace("- Docker\n", "- Docker\n- Kubernetes\n"));
    expect(addedLines(SKILLS, result ?? "")).toEqual(["- Kubernetes"]);
  });

  it("matches the heading ignoring case and surrounding spaces", () => {
    const source = SKILLS.replace("## Data", "##   Data  ");

    expect(addSkill(source, "  dATA ", "Redis")).toBe(source.replace("- PostgreSQL\n", "- PostgreSQL\n- Redis\n"));
    expect(skillPlacement(source, "  dATA ", "Redis")).toEqual({ heading: "Data", isNew: false });
  });

  it("adds a new section at the end when no heading matches", () => {
    expect(addSkill(SKILLS, "Infraestrutura", "Kubernetes")).toBe(`${SKILLS}\n## Infraestrutura\n- Kubernetes\n`);
    expect(skillPlacement(SKILLS, "Infraestrutura", "Kubernetes")).toEqual({ heading: "Infraestrutura", isNew: true });
  });

  it("starts the first section of a file that has only frontmatter", () => {
    expect(addSkill("---\n---\n", "Data", "Redis")).toBe("---\n---\n\n## Data\n- Redis\n");
  });

  it("doesn't add a skill the file already lists, ignoring case", () => {
    expect(addSkill(SKILLS, "Data", "postgresql")).toBeNull();
    expect(addSkill(SKILLS, "Languages", " PYTHON ")).toBeNull();
    // Listed under another heading than the resume's category.
    expect(addSkill(SKILLS, "Data", "Docker")).toBeNull();
    expect(listsSkill(SKILLS, "docker")).toBe(true);
  });

  it("adds nothing the second time", () => {
    const once = addSkill(SKILLS, "Data", "Redis") ?? "";

    expect(addSkill(once, "Data", "Redis")).toBeNull();
    expect(addSkill(once, "Other", "redis")).toBeNull();
  });

  it("counts a skill inside a bullet as listed when it is a whole word or phrase", () => {
    expect(listsSkill(SKILLS, "Lambda")).toBe(true);
    expect(listsSkill(SKILLS, "aws")).toBe(true);
    expect(listsSkill(SKILLS, " sqs ")).toBe(true);
    expect(listsSkill(SKILLS, "Lambda, RDS")).toBe(true);
    expect(listsSkill(SKILLS, "AWS (Lambda, RDS, SQS)")).toBe(true);
    expect(addSkill(SKILLS, "Cloud and infrastructure", "Lambda")).toBeNull();
    expect(addSkill(SKILLS, "Data", "RDS")).toBeNull();
  });

  it("doesn't count part of a word as listed", () => {
    expect(listsSkill(SKILLS, "SQ")).toBe(false);
    expect(listsSkill(SKILLS, "Lamb")).toBe(false);
    expect(listsSkill(SKILLS, "ambda")).toBe(false);
    expect(listsSkill(SKILLS, "Type")).toBe(false);
    expect(listsSkill("## Data\n- PostgreSQL 16\n- Redis7\n", "PostgreSQL")).toBe(true);
    expect(listsSkill("## Data\n- PostgreSQL 16\n- Redis7\n", "Redis")).toBe(false);
    // An accented letter is a letter, so "Caf" is only part of the word.
    expect(listsSkill("## Other\n- Café management\n", "Caf")).toBe(false);
    expect(listsSkill("## Other\n- Café management\n", "CAFÉ")).toBe(true);
  });

  it("only counts bullets of the body as listed", () => {
    expect(listsSkill(SKILLS, "Data")).toBe(false);
    expect(listsSkill(SKILLS, "")).toBe(false);
    expect(listsSkill("---\ntags:\n  - Redis\n---\n\n## Data\n", "Redis")).toBe(false);
    expect(listsSkill("## Data\nI also know Redis.\n", "Redis")).toBe(false);
  });

  it("keeps a file that ends without a line break ending without one", () => {
    const source = SKILLS.trimEnd();

    expect(addSkill(source, "Data", "Redis")).toBe(`${source}\n- Redis`);
    expect(addSkill(source, "Tools", "Git")).toBe(`${source}\n\n## Tools\n- Git`);
  });

  it("keeps Windows line breaks", () => {
    const source = SKILLS.replaceAll("\n", "\r\n");

    expect(addSkill(source, "Languages", "SQL")).toBe(source.replace("- Python\r\n", "- Python\r\n- SQL\r\n"));
    expect(addSkill(source, "Tools", "Git")).toBe(`${source}\r\n## Tools\r\n- Git\r\n`);
  });

  it("puts the bullet right under a heading that has no bullets yet", () => {
    const source = "---\n---\n\n## Data\n\n## Tools\n- Git\n";

    expect(addSkill(source, "Data", "Redis")).toBe("---\n---\n\n## Data\n- Redis\n\n## Tools\n- Git\n");
  });

  it("uses the section's bullet marker and goes after nested lines", () => {
    const source = "## Data\n* PostgreSQL\n  - replication\n\n## Tools\n- Git\n";

    expect(addSkill(source, "Data", "Redis")).toBe("## Data\n* PostgreSQL\n  - replication\n* Redis\n\n## Tools\n- Git\n");
  });

  it("refuses a skill or a category that is empty or longer than one line", () => {
    expect(addSkill(SKILLS, "Data", "Redis\n## Injected")).toBeNull();
    expect(addSkill(SKILLS, "Data\n- Injected", "Redis")).toBeNull();
    expect(addSkill(SKILLS, " ", "Redis")).toBeNull();
    expect(addSkill(SKILLS, "Data", "")).toBeNull();
  });
});

describe("impliedSkillPlacement", () => {
  const resume = (status: string) => ({
    skills: [
      { category: "Languages", items: ["TypeScript"] },
      { category: "cloud and infrastructure", items: ["AWS", "Kubernetes"] },
    ],
    inferences: [{ skill: "Kubernetes", status }],
  });

  it("places an approved skill under the heading of the resume's category", () => {
    expect(impliedSkillPlacement(resume("approved"), SKILLS, "Kubernetes")).toEqual({
      heading: "Cloud and infrastructure",
      isNew: false,
    });
  });

  it.each(["pending", "rejected"])("offers nothing for a %s skill", (status) => {
    expect(impliedSkillPlacement(resume(status), SKILLS, "Kubernetes")).toBeNull();
  });

  it("offers nothing once skills.md lists the skill", () => {
    const listed = addSkill(SKILLS, "Cloud and infrastructure", "Kubernetes") ?? "";

    expect(impliedSkillPlacement(resume("approved"), listed, "Kubernetes")).toBeNull();
  });

  it("offers nothing for a skill that isn't implied or that no skills group holds", () => {
    expect(impliedSkillPlacement(resume("approved"), SKILLS, "TypeScript")).toBeNull();
    expect(impliedSkillPlacement({ ...resume("approved"), skills: [] }, SKILLS, "Kubernetes")).toBeNull();
  });
});
