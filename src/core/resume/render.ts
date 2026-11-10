import Handlebars from "handlebars";
import type { ResumeTemplate } from "../template/template";
import type { Inference, ResumeContent } from "./schema";

export interface RenderInput {
  content: ResumeContent;
  /** ISO 639-1 code; dates are formatted for it. */
  language: string;
  inferences: Inference[];
}

/**
 * Fills the template with the resume content (Art. V.9). Values are always HTML-escaped,
 * and skills that are pending or rejected inferences are left out (Art. II.3).
 */
export function renderResume(template: ResumeTemplate, { content, language, inferences }: RenderInput): string {
  const hidden = new Set(
    inferences.filter((i) => i.status !== "approved").map((i) => i.skill.trim().toLowerCase()),
  );
  const skills = content.skills
    .map((group) => ({ ...group, items: group.items.filter((item) => !hidden.has(item.trim().toLowerCase())) }))
    .filter((group) => group.items.length > 0);

  const handlebars = Handlebars.create();
  handlebars.registerHelper("date", (value: unknown, ...args: unknown[]) => {
    const format = typeof args[0] === "string" ? args[0] : "month";
    return formatDate(value, format, language, content.labels.present);
  });
  return handlebars.compile(template.layout)({ ...content, skills, language });
}

/** `2025-01` → "Jan 2025" (or "2025" with the "year" format) in the given language. */
export function formatDate(value: unknown, format: string, language: string, present: string): string {
  if (value === "present") return present;
  if (typeof value !== "string") return "";
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return value;
  if (format === "year") return match[1];
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat(language, { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
