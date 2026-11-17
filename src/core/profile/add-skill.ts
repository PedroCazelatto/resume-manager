// Writing an approved implied skill back to skills.md (Art. II.3, F07). The file is the
// user's, so it is only ever added to: every other byte stays as it is.

/** The heading the user chose for a skill in the confirmation. */
export interface SkillPlacement {
  /** An existing `##` heading of skills.md, or the name of the new section. */
  heading: string;
  /** True when a new `## <heading>` section goes at the end of the file. */
  isNew: boolean;
}

/** What the confirmation offers for a skill that skills.md doesn't list yet. */
export interface SkillOptions {
  /** The `##` headings of skills.md, as they are written in the file. */
  headings: string[];
  /** The heading that matches the resume's category; null when none does, and "New section" is preselected. */
  preselected: string | null;
  /** The resume's category, the name a new section starts with. */
  newHeading: string;
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

const HEADING = /^#{1,6}[ \t]+/;
const SECTION = /^##[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
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

/**
 * True when the text holds the phrase as whole words: no character of a skill's name touches
 * either end of it. Letters, digits, `+`, `#` and `.` are part of a name, so `C++` doesn't hold
 * "C" and `Node.js` doesn't hold "Node"; a `.` that ends a sentence is not part of a name.
 */
function holdsPhrase(text: string, phrase: string): boolean {
  const alphanumeric = /[\p{L}\p{N}]/u;
  const nameChar = /[\p{L}\p{N}+#.]/u;
  for (let at = text.indexOf(phrase); at !== -1; at = text.indexOf(phrase, at + 1)) {
    const before = text.slice(0, at).at(-1);
    const rest = text.slice(at + phrase.length);
    const after = rest[0];
    const touchesAfter =
      after !== undefined && (after === "." ? rest[1] !== undefined && alphanumeric.test(rest[1]) : nameChar.test(after));
    if (!(before && nameChar.test(before)) && !touchesAfter) return true;
  }
  return false;
}

/**
 * True when a bullet of skills.md holds this skill as a whole word or phrase, ignoring case:
 * `AWS (Lambda, RDS, SQS)` lists "Lambda" and "AWS", but not "Lamb" or "SQ", and `C++` or
 * `Node.js` don't list "C" or "Node".
 */
export function listsSkill(skillsSource: string, skill: string): boolean {
  const phrase = skill.trim().toLowerCase();
  if (phrase === "") return false;
  return bodyLines(skillsSource).some((line) => {
    const bullet = BULLET.exec(line.text);
    return bullet !== null && holdsPhrase(bullet[3].toLowerCase(), phrase);
  });
}

/** The `##` headings of skills.md in the file's order, each once (ignoring case). */
export function skillHeadings(skillsSource: string): string[] {
  const headings: string[] = [];
  for (const line of bodyLines(skillsSource)) {
    const heading = SECTION.exec(line.text)?.[1];
    if (heading && !hasHeading(headings, heading)) headings.push(heading);
  }
  return headings;
}

/** True when one of the headings is this name, ignoring case and surrounding spaces. */
export function hasHeading(headings: string[], name: string): boolean {
  return headings.some((heading) => same(heading, name));
}

/**
 * The headings a skill can go under, with the one that matches the category preselected
 * (case and surrounding spaces ignored). Null when the file already lists the skill, or
 * when the skill or the category is empty or longer than one line.
 */
export function skillOptions(skillsSource: string, category: string, skill: string): SkillOptions | null {
  if (!oneLine(skill) || !oneLine(category) || listsSkill(skillsSource, skill)) return null;
  const headings = skillHeadings(skillsSource);
  return {
    headings,
    preselected: headings.find((heading) => same(heading, category)) ?? null,
    newHeading: category.trim(),
  };
}

/**
 * skills.md with the skill added as one bullet, after the last line of the chosen section,
 * or in a new `## <heading>` section at the end of the file. Null when there is nothing to
 * add: the file already lists the skill, the chosen heading isn't in the file, the new
 * section's name is one of the file's headings, or the skill or the heading is empty or
 * longer than one line.
 */
export function addSkill(skillsSource: string, placement: SkillPlacement, skill: string): string | null {
  if (!oneLine(skill) || !oneLine(placement.heading) || listsSkill(skillsSource, skill)) return null;
  if (hasHeading(skillHeadings(skillsSource), placement.heading) === placement.isNew) return null;
  const eol = skillsSource.includes("\r\n") ? "\r\n" : "\n";
  const name = skill.trim();

  if (placement.isNew) {
    const gap = skillsSource === "" || skillsSource.endsWith(eol + eol) ? "" : skillsSource.endsWith(eol) ? eol : eol + eol;
    // A file that ends without a line break keeps ending without one.
    const last = skillsSource === "" || skillsSource.endsWith(eol) ? eol : "";
    return `${skillsSource}${gap}## ${placement.heading.trim()}${eol}- ${name}${last}`;
  }

  const lines = bodyLines(skillsSource);
  const start = lines.findIndex((line) => {
    const heading = SECTION.exec(line.text);
    return heading !== null && same(heading[1], placement.heading);
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
function resumeSkillCategory(resume: ResumeSkills, skill: string): string | undefined {
  return resume.skills.find((group) => group.items.some((item) => same(item, skill)))?.category;
}

/**
 * The headings an implied skill of a resume can go under in skills.md. Null when there is
 * nothing to offer: the skill isn't an approved implied skill, no skills group of the resume
 * holds it, or skills.md already lists it.
 */
export function impliedSkillOptions(resume: ResumeSkills, skillsSource: string, skill: string): SkillOptions | null {
  if (!resume.inferences.some((i) => i.skill === skill && i.status === "approved")) return null;
  const category = resumeSkillCategory(resume, skill);
  return category === undefined ? null : skillOptions(skillsSource, category, skill);
}
