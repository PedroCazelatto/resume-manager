import { describe, expect, it } from "vitest";
import { addSkill, hasHeading, impliedSkillOptions, listsSkill, skillHeadings, skillOptions } from "./add-skill";

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
const HEADINGS = ["Languages", "Cloud and infrastructure", "Data"];

const under = (heading: string) => ({ heading, isNew: false });
const inNew = (heading: string) => ({ heading, isNew: true });

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

describe("skillHeadings", () => {
  it("lists the ## headings of the body in the file's order", () => {
    expect(skillHeadings(SKILLS)).toEqual(HEADINGS);
    expect(skillHeadings("---\n---\n")).toEqual([]);
    expect(skillHeadings("")).toEqual([]);
  });

  it("leaves out other heading levels, the frontmatter and a heading written twice", () => {
    const source = "---\nnote: |\n  ## Hidden\n---\n# Skills\n##   Data  ##\n- Redis\n### Caches\n## data\n## Tools\r\n##\n";

    expect(skillHeadings(source)).toEqual(["Data", "Tools"]);
  });

  it("finds a heading ignoring case and surrounding spaces", () => {
    expect(hasHeading(HEADINGS, "  dATA ")).toBe(true);
    expect(hasHeading(HEADINGS, "Dat")).toBe(false);
    expect(hasHeading([], "Data")).toBe(false);
  });
});

describe("skillOptions", () => {
  it("preselects the heading that matches the category, ignoring case and surrounding spaces", () => {
    expect(skillOptions(SKILLS, "  cloud AND infrastructure ", "Kubernetes")).toEqual({
      headings: HEADINGS,
      preselected: "Cloud and infrastructure",
      newHeading: "cloud AND infrastructure",
    });
  });

  it("preselects a new section named after the category when no heading matches", () => {
    expect(skillOptions(SKILLS, "Cloud & Infrastructure", "Kubernetes")).toEqual({
      headings: HEADINGS,
      preselected: null,
      newHeading: "Cloud & Infrastructure",
    });
    expect(skillOptions("---\n---\n", "Data", "Redis")).toEqual({ headings: [], preselected: null, newHeading: "Data" });
  });

  it("offers nothing for a listed skill, or for a skill or category that is empty or longer than one line", () => {
    expect(skillOptions(SKILLS, "Data", "docker")).toBeNull();
    expect(skillOptions(SKILLS, "Data", "Lambda")).toBeNull();
    expect(skillOptions(SKILLS, "Data", " ")).toBeNull();
    expect(skillOptions(SKILLS, "Data\n- Injected", "Redis")).toBeNull();
    expect(skillOptions(SKILLS, "", "Redis")).toBeNull();
  });
});

describe("addSkill", () => {
  it("adds one bullet at the end of the chosen section and changes nothing else", () => {
    const result = addSkill(SKILLS, under("Cloud and infrastructure"), "Kubernetes");

    expect(result).toBe(SKILLS.replace("- Docker\n", "- Docker\n- Kubernetes\n"));
    expect(addedLines(SKILLS, result ?? "")).toEqual(["- Kubernetes"]);
  });

  it("goes under any heading of the file, whatever the resume's category is", () => {
    expect(addSkill(SKILLS, under("Languages"), "Kubernetes")).toBe(
      SKILLS.replace("- Python\n", "- Python\n- Kubernetes\n"),
    );
  });

  it("finds the chosen heading ignoring case and surrounding spaces", () => {
    const source = SKILLS.replace("## Data", "##   Data  ");

    expect(addSkill(source, under("  dATA "), "Redis")).toBe(source.replace("- PostgreSQL\n", "- PostgreSQL\n- Redis\n"));
  });

  it("refuses a chosen heading that isn't a ## heading of the file", () => {
    expect(addSkill(SKILLS, under("Tools"), "Git")).toBeNull();
    expect(addSkill(SKILLS.replace("## Data", "### Data"), under("Data"), "Redis")).toBeNull();
    expect(addSkill("---\nnote: |\n  ## Data\n---\n", under("Data"), "Redis")).toBeNull();
  });

  it("adds a new section at the end of the file", () => {
    expect(addSkill(SKILLS, inNew(" Infraestrutura "), "Kubernetes")).toBe(`${SKILLS}\n## Infraestrutura\n- Kubernetes\n`);
  });

  it("refuses a new section named like a heading of the file", () => {
    expect(addSkill(SKILLS, inNew("Data"), "Redis")).toBeNull();
    expect(addSkill(SKILLS, inNew(" data "), "Redis")).toBeNull();
  });

  it("starts the first section of a file that has only frontmatter", () => {
    expect(addSkill("---\n---\n", inNew("Data"), "Redis")).toBe("---\n---\n\n## Data\n- Redis\n");
  });

  it("doesn't add a skill the file already lists, ignoring case", () => {
    expect(addSkill(SKILLS, under("Data"), "postgresql")).toBeNull();
    expect(addSkill(SKILLS, under("Languages"), " PYTHON ")).toBeNull();
    // Listed under another heading than the chosen one.
    expect(addSkill(SKILLS, under("Data"), "Docker")).toBeNull();
    expect(addSkill(SKILLS, inNew("Tools"), "Docker")).toBeNull();
    expect(listsSkill(SKILLS, "docker")).toBe(true);
  });

  it("adds nothing the second time", () => {
    const once = addSkill(SKILLS, under("Data"), "Redis") ?? "";

    expect(addSkill(once, under("Data"), "Redis")).toBeNull();
    expect(addSkill(once, inNew("Other"), "redis")).toBeNull();
  });

  it("counts a skill inside a bullet as listed when it is a whole word or phrase", () => {
    expect(listsSkill(SKILLS, "Lambda")).toBe(true);
    expect(listsSkill(SKILLS, "aws")).toBe(true);
    expect(listsSkill(SKILLS, " sqs ")).toBe(true);
    expect(listsSkill(SKILLS, "Lambda, RDS")).toBe(true);
    expect(listsSkill(SKILLS, "AWS (Lambda, RDS, SQS)")).toBe(true);
    expect(addSkill(SKILLS, under("Cloud and infrastructure"), "Lambda")).toBeNull();
    expect(addSkill(SKILLS, under("Data"), "RDS")).toBeNull();
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

    expect(addSkill(source, under("Data"), "Redis")).toBe(`${source}\n- Redis`);
    expect(addSkill(source, inNew("Tools"), "Git")).toBe(`${source}\n\n## Tools\n- Git`);
  });

  it("keeps Windows line breaks", () => {
    const source = SKILLS.replaceAll("\n", "\r\n");

    expect(addSkill(source, under("Languages"), "SQL")).toBe(source.replace("- Python\r\n", "- Python\r\n- SQL\r\n"));
    expect(addSkill(source, inNew("Tools"), "Git")).toBe(`${source}\r\n## Tools\r\n- Git\r\n`);
  });

  it("puts the bullet right under a heading that has no bullets yet", () => {
    const source = "---\n---\n\n## Data\n\n## Tools\n- Git\n";

    expect(addSkill(source, under("Data"), "Redis")).toBe("---\n---\n\n## Data\n- Redis\n\n## Tools\n- Git\n");
  });

  it("uses the section's bullet marker and goes after nested lines", () => {
    const source = "## Data\n* PostgreSQL\n  - replication\n\n## Tools\n- Git\n";

    expect(addSkill(source, under("Data"), "Redis")).toBe("## Data\n* PostgreSQL\n  - replication\n* Redis\n\n## Tools\n- Git\n");
  });

  it("stops the section at a heading of any level", () => {
    const source = "## Data\n- PostgreSQL\n### Caches\n- Memcached\n";

    expect(addSkill(source, under("Data"), "Redis")).toBe("## Data\n- PostgreSQL\n- Redis\n### Caches\n- Memcached\n");
  });

  it("refuses a skill or a heading that is empty or longer than one line", () => {
    expect(addSkill(SKILLS, under("Data"), "Redis\n## Injected")).toBeNull();
    expect(addSkill(SKILLS, inNew("Tools\n- Injected"), "Redis")).toBeNull();
    expect(addSkill(SKILLS, inNew(" "), "Redis")).toBeNull();
    expect(addSkill(SKILLS, under("Data"), "")).toBeNull();
  });
});

describe("impliedSkillOptions", () => {
  const resume = (status: string) => ({
    skills: [
      { category: "Languages", items: ["TypeScript"] },
      { category: "cloud and infrastructure", items: ["AWS", "Kubernetes"] },
    ],
    inferences: [{ skill: "Kubernetes", status }],
  });

  it("offers the file's headings for an approved skill, preselecting the resume's category", () => {
    expect(impliedSkillOptions(resume("approved"), SKILLS, "Kubernetes")).toEqual({
      headings: HEADINGS,
      preselected: "Cloud and infrastructure",
      newHeading: "cloud and infrastructure",
    });
  });

  it.each(["pending", "rejected"])("offers nothing for a %s skill", (status) => {
    expect(impliedSkillOptions(resume(status), SKILLS, "Kubernetes")).toBeNull();
  });

  it("offers nothing once skills.md lists the skill, also inside another bullet", () => {
    const listed = addSkill(SKILLS, under("Cloud and infrastructure"), "Kubernetes") ?? "";

    expect(impliedSkillOptions(resume("approved"), listed, "Kubernetes")).toBeNull();
    expect(
      impliedSkillOptions(resume("approved"), SKILLS.replace("- Docker", "- Docker (Compose, Kubernetes)"), "Kubernetes"),
    ).toBeNull();
  });

  it("offers nothing for a skill that isn't implied or that no skills group holds", () => {
    expect(impliedSkillOptions(resume("approved"), SKILLS, "TypeScript")).toBeNull();
    expect(impliedSkillOptions({ ...resume("approved"), skills: [] }, SKILLS, "Kubernetes")).toBeNull();
  });
});
