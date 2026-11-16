import type { SourceFile } from "../profile/profile";
import type { ResumeContent } from "./schema";

// Where each resume item comes from (Art. II.4, F18). Bullets share their item's sources;
// skills and contact details carry none in resume.md.

/** One item of the resume with the profile files it cites. */
export interface SourcedItem {
  /** The kind of item, in English like the rest of the UI (Art. VIII.4). */
  section: string;
  /** The item as the resume names it; absent for the summary. */
  title?: string;
  sources: string[];
}

const EXTRA_SECTIONS: Record<keyof ResumeContent["extras"], string> = {
  volunteering: "Volunteering",
  award: "Award",
  publication: "Publication",
  interest: "Interest",
  availability: "Availability",
  other: "Other",
};

/** Every item of the resume that records sources, in the schema's order. */
export function listSourcedItems(resume: ResumeContent): SourcedItem[] {
  return [
    { section: "Summary", sources: resume.summary_sources },
    ...resume.experience.map((item) => ({
      section: "Experience",
      title: `${item.role} · ${item.company}`,
      sources: item.sources,
    })),
    ...resume.education.map((item) => ({
      section: "Education",
      title: `${item.degree} · ${item.institution}`,
      sources: item.sources,
    })),
    ...resume.projects.map((item) => ({ section: "Project", title: item.name, sources: item.sources })),
    ...resume.certifications.map((item) => ({ section: "Certification", title: item.name, sources: item.sources })),
    ...resume.languages.map((item) => ({ section: "Language", title: item.name, sources: item.sources })),
    ...(Object.keys(EXTRA_SECTIONS) as (keyof ResumeContent["extras"])[]).flatMap((type) =>
      resume.extras[type].map((item) => ({ section: EXTRA_SECTIONS[type], title: item.title, sources: item.sources })),
    ),
  ];
}

/**
 * The current text of every file the items cite, and of no other file; null when the
 * profile no longer has the file. The items are the resume's sourced items and its implied
 * skills, which cite files the same way.
 */
export function citedFileTexts(items: { sources: string[] }[], profileFiles: SourceFile[]): Record<string, string | null> {
  const texts = new Map(profileFiles.map(({ file, source }) => [file, source]));
  const cited = new Set(items.flatMap((item) => item.sources));
  return Object.fromEntries([...cited].map((file) => [file, texts.get(file) ?? null]));
}
