import type { Inference, ResumeContent } from "../resume/schema";

/** One statement of the resume, for the model review (Art. II.5, F17). */
export interface Claim {
  /** The resume field, e.g. `experience[0].bullets[1]`. */
  where: string;
  text: string;
  /** The profile files it cites; empty when any file may support it. */
  sources: string[];
}

const joined = (parts: (string | undefined)[]) => parts.filter(Boolean).join(", ");
const period = (start?: string, end?: string) => (start || end ? [start, end].filter(Boolean).join(" to ") : undefined);

/**
 * Splits the resume into the claims the review checks. Implied skills are left out:
 * the user approves or rejects those (Art. II.3).
 */
export function resumeClaims(resume: ResumeContent, inferences: Inference[]): Claim[] {
  const claims: Claim[] = [];
  const add = (where: string, text: string, sources: string[]) => claims.push({ where, text, sources });
  const bullets = (where: string, items: string[], sources: string[]) =>
    items.forEach((bullet, i) => add(`${where}.bullets[${i}]`, bullet, sources));

  add("summary", resume.summary, resume.summary_sources);

  const inferred = new Set(inferences.map((i) => i.skill.trim().toLowerCase()));
  resume.skills.forEach((group, g) =>
    group.items.forEach((item, i) => {
      if (!inferred.has(item.trim().toLowerCase())) add(`skills[${g}].items[${i}]`, item, []);
    }),
  );

  resume.experience.forEach((item, i) => {
    const where = `experience[${i}]`;
    add(where, joined([`${item.role} at ${item.company}`, item.location, period(item.start, item.end)]), item.sources);
    bullets(where, item.bullets, item.sources);
  });

  resume.education.forEach((item, i) => {
    const where = `education[${i}]`;
    const { degree, field, institution, location, grade } = item;
    add(where, joined([degree, field, institution, location, period(item.start, item.end), grade]), item.sources);
    bullets(where, item.bullets, item.sources);
  });

  resume.projects.forEach((item, i) => {
    const where = `projects[${i}]`;
    add(where, joined([item.name, item.role, item.url, period(item.start, item.end)]), item.sources);
    bullets(where, item.bullets, item.sources);
  });

  resume.certifications.forEach((item, i) =>
    add(`certifications[${i}]`, joined([item.name, item.issuer, item.date]), item.sources),
  );

  resume.languages.forEach((item, i) => add(`languages[${i}]`, `${item.name}: ${item.level}`, item.sources));

  for (const [type, items] of Object.entries(resume.extras)) {
    items.forEach((item, i) => {
      const where = `extras.${type}[${i}]`;
      add(where, joined([item.title, item.date]), item.sources);
      bullets(where, item.bullets, item.sources);
    });
  }

  return claims;
}
