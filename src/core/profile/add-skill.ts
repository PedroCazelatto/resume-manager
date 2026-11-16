// Writing an approved implied skill back to skills.md (Art. II.3, F07). The file is the
// user's, so it is only ever added to: every other byte stays as it is.

/** Where a skill would go in skills.md. */
export interface SkillPlacement {
  /** The heading as it is written in the file, or the resume's category when the heading is new. */
  heading: string;
  /** True when no heading matches and a new `## <heading>` section goes at the end of the file. */
  isNew: boolean;
}

/** The parts of resume.md that say which implied skills are approved and under which category. */
interface ResumeSkills {
  skills: { category: string; items: string[] }[];
  inferences: { skill: string; status: string }[];
}

interface Line {
  text: string;
  /** Offset just after the line and its line break. */
  end: number;
  /** False for the last line of a file that doesn't end with a line break. */
  terminated: boolean;
}

const HEADING = /^#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const BULLET = /^([ \t]*)([-*+])[ \t]+(.*)$/;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const oneLine = (text: string) => text.trim() !== "" && !/[\r\n]/.test(text);

/** The body's lines with their offsets; the frontmatter is left out. */
function bodyLines(source: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start < source.length) {
    const lineBreak = source.indexOf("\n", start);
    const end = lineBreak === -1 ? source.length : lineBreak + 1;
    lines.push({ text: source.slice(start, end).replace(/\r?\n$/, ""), end, terminated: lineBreak !== -1 });
    start = end;
  }
  if (lines[0]?.text !== "---") return lines;
  const close = lines.findIndex((line, index) => index > 0 && line.text === "---");
  return close === -1 ? [] : lines.slice(close + 1);
}

/** True when the text holds the phrase as whole words: no letter or digit touches either end of it. */
function holdsPhrase(text: string, phrase: string): boolean {
  const wordChar = /[\p{L}\p{N}]/u;
  for (let at = text.indexOf(phrase); at !== -1; at = text.indexOf(phrase, at + 1)) {
    const before = text.slice(0, at).at(-1);
    const after = text.slice(at + phrase.length)[0];
    if (!(before && wordChar.test(before)) && !(after && wordChar.test(after))) return true;
  }
  return false;
}

/**
 * True when a bullet of skills.md holds this skill as a whole word or phrase, ignoring case:
 * `AWS (Lambda, RDS, SQS)` lists "Lambda" and "AWS", but not "Lamb" or "SQ".
 */
export function listsSkill(skillsSource: string, skill: string): boolean {
  const phrase = skill.trim().toLowerCase();
  if (phrase === "") return false;
  return bodyLines(skillsSource).some((line) => {
    const bullet = BULLET.exec(line.text);
    return bullet !== null && holdsPhrase(bullet[3].toLowerCase(), phrase);
  });
}

/**
 * Where `addSkill` would put the skill: under the first heading that matches the category
 * (case and surrounding spaces ignored), or under a new one. Null when the file already
 * lists the skill, or when the skill or the category is empty or longer than one line.
 */
export function skillPlacement(skillsSource: string, category: string, skill: string): SkillPlacement | null {
  if (!oneLine(skill) || !oneLine(category) || listsSkill(skillsSource, skill)) return null;
  for (const line of bodyLines(skillsSource)) {
    const heading = HEADING.exec(line.text);
    if (heading && same(heading[1], category)) return { heading: heading[1], isNew: false };
  }
  return { heading: category.trim(), isNew: true };
}

/**
 * skills.md with the skill added as one bullet, after the last line of the section whose
 * heading matches the category, or in a new `## <category>` section at the end of the file.
 * Null when there is nothing to add (see `skillPlacement`).
 */
export function addSkill(skillsSource: string, category: string, skill: string): string | null {
  const placement = skillPlacement(skillsSource, category, skill);
  if (!placement) return null;
  const eol = skillsSource.includes("\r\n") ? "\r\n" : "\n";
  const name = skill.trim();

  if (placement.isNew) {
    const gap = skillsSource === "" || skillsSource.endsWith(eol + eol) ? "" : skillsSource.endsWith(eol) ? eol : eol + eol;
    // A file that ends without a line break keeps ending without one.
    const last = skillsSource === "" || skillsSource.endsWith(eol) ? eol : "";
    return `${skillsSource}${gap}## ${placement.heading}${eol}- ${name}${last}`;
  }

  const lines = bodyLines(skillsSource);
  const start = lines.findIndex((line) => {
    const heading = HEADING.exec(line.text);
    return heading !== null && same(heading[1], category);
  });
  let after = lines[start];
  let marker = "-";
  let markerFound = false;
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line.text)) break;
    if (line.text.trim() !== "") after = line;
    // The new bullet uses the marker of the section's first top-level bullet.
    const bullet = BULLET.exec(line.text);
    if (bullet && bullet[1] === "" && !markerFound) {
      marker = bullet[2];
      markerFound = true;
    }
  }
  const bullet = `${marker} ${name}`;
  return skillsSource.slice(0, after.end) + (after.terminated ? bullet + eol : eol + bullet) + skillsSource.slice(after.end);
}

/** The category of the resume's skills group that holds the skill. */
export function resumeSkillCategory(resume: ResumeSkills, skill: string): string | undefined {
  return resume.skills.find((group) => group.items.some((item) => same(item, skill)))?.category;
}

/**
 * Where an implied skill of a resume would go in skills.md. Null when there is nothing to
 * offer: the skill isn't an approved implied skill, no skills group of the resume holds it,
 * or skills.md already lists it.
 */
export function impliedSkillPlacement(resume: ResumeSkills, skillsSource: string, skill: string): SkillPlacement | null {
  if (!resume.inferences.some((i) => i.skill === skill && i.status === "approved")) return null;
  const category = resumeSkillCategory(resume, skill);
  return category === undefined ? null : skillPlacement(skillsSource, category, skill);
}
