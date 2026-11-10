import { listProfileFiles, type Profile } from "../profile/profile";
import type { ProfileFile } from "../profile/validate";
import type { ResumeContent } from "../resume/schema";
import type { Failure } from "./schema";

// The deterministic checks of Art. II.5 (F15): every employer, institution, date, and
// number in the resume must appear in the profile files the item cites (Art. II.4).

const NUMBER = /\d+(?:[.,]\d+)*/g;
const THOUSANDS = /^\d{1,3}(?:[.,]\d{3})+$/;

/** The numbers written in a text. `1,000` and `1.000` equal `1000`; `1,5` equals `1.5`. */
export function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).map((n) => (THOUSANDS.test(n) ? n.replace(/[.,]/g, "") : n.replace(",", ".")));
}

function sameName(a: string, b: string): boolean {
  const normalise = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  return normalise(a) === normalise(b);
}

function datesIn(file: ProfileFile): string[] {
  const data = file.data as Record<string, unknown>;
  return ["start", "end", "date", "expires"].flatMap((key) => (typeof data[key] === "string" ? [data[key]] : []));
}

export function checkResume(profile: Profile, resume: ResumeContent): Failure[] {
  const all = listProfileFiles(profile);
  const byPath = new Map(all.map((file) => [file.file, file]));
  const failures: Failure[] = [];
  const fail = (where: string, claim: string, problem: string) =>
    failures.push({ check: "deterministic", where, claim, problem, dismissed: false });

  /** The profile files an item cites (`where` names its sources field); a cited file that doesn't exist is a failure. */
  function cited(where: string, sources: string[]): ProfileFile[] {
    if (sources.length === 0) fail(where, "(none)", "cites no profile file");
    return sources.flatMap((source) => {
      const file = byPath.get(source);
      if (!file) fail(where, source, "cites a file that isn't in the profile");
      return file ?? [];
    });
  }

  const listed = (files: ProfileFile[]) => (files === all ? "the profile" : files.map((f) => f.file).join(", ") || "any cited file");

  function numbers(where: string, text: string | undefined, files: ProfileFile[]) {
    if (!text) return;
    const known = new Set(files.flatMap((file) => numbersIn(file.source)));
    for (const n of new Set(numbersIn(text))) {
      if (!known.has(n)) fail(where, text, `the number ${n} isn't in ${listed(files)}`);
    }
  }

  function texts(where: string, item: Record<string, string | string[] | undefined>, files: ProfileFile[]) {
    for (const [field, value] of Object.entries(item)) {
      if (Array.isArray(value)) value.forEach((entry, i) => numbers(`${where}.${field}[${i}]`, entry, files));
      else numbers(`${where}.${field}`, value, files);
    }
  }

  function dates(where: string, item: { start?: string; end?: string; date?: string }, files: ProfileFile[]) {
    const known = new Set(files.flatMap(datesIn));
    for (const field of ["start", "end", "date"] as const) {
      const value = item[field];
      if (value && !known.has(value)) fail(`${where}.${field}`, value, `the date isn't in ${listed(files)}`);
    }
  }

  const personal = [profile.personal];
  texts("contact", { phone: resume.contact.phone, work_authorisation: resume.contact.work_authorisation }, personal);

  numbers("summary", resume.summary, cited("summary_sources", resume.summary_sources));

  // Skills carry no sources of their own, so their numbers may come from any file.
  resume.skills.forEach((group, g) => texts(`skills[${g}]`, { category: group.category, items: group.items }, all));

  resume.experience.forEach((item, i) => {
    const where = `experience[${i}]`;
    const files = cited(`${where}.sources`, item.sources);
    if (!files.some((f) => f.kind === "experience" && sameName(f.data.company, item.company))) {
      fail(`${where}.company`, item.company, `the employer isn't in ${listed(files)}`);
    }
    dates(where, item, files);
    texts(where, { role: item.role, location: item.location, bullets: item.bullets }, files);
  });

  resume.education.forEach((item, i) => {
    const where = `education[${i}]`;
    const files = cited(`${where}.sources`, item.sources);
    if (!files.some((f) => f.kind === "education" && sameName(f.data.institution, item.institution))) {
      fail(`${where}.institution`, item.institution, `the institution isn't in ${listed(files)}`);
    }
    dates(where, item, files);
    const { degree, field, location, grade, bullets } = item;
    texts(where, { degree, field, location, grade, bullets }, files);
  });

  resume.projects.forEach((item, i) => {
    const where = `projects[${i}]`;
    const files = cited(`${where}.sources`, item.sources);
    dates(where, item, files);
    texts(where, { name: item.name, role: item.role, bullets: item.bullets }, files);
  });

  resume.certifications.forEach((item, i) => {
    const where = `certifications[${i}]`;
    const files = cited(`${where}.sources`, item.sources);
    dates(where, item, files);
    texts(where, { name: item.name, issuer: item.issuer }, files);
  });

  resume.languages.forEach((item, i) => {
    const where = `languages[${i}]`;
    texts(where, { name: item.name, level: item.level }, cited(`${where}.sources`, item.sources));
  });

  for (const [type, items] of Object.entries(resume.extras)) {
    items.forEach((item, i) => {
      const where = `extras.${type}[${i}]`;
      const files = cited(`${where}.sources`, item.sources);
      dates(where, item, files);
      texts(where, { title: item.title, bullets: item.bullets }, files);
    });
  }

  return failures;
}
