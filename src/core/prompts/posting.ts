import type { JobDetails } from "../application/schemas";

// The text that goes inside a prompt's <posting> block (F46). The job's details are read from
// the posting's page, which is untrusted input like its text (Art. II.7), so they go inside the
// same delimited block, one per line, above the text.

const LABELS: [keyof JobDetails, string][] = [
  ["title", "Title"],
  ["company", "Company"],
  ["location", "Location"],
  ["salary", "Salary"],
  ["work_model", "Work model"],
  ["hours", "Hours"],
];

/** The job's details, one per line ("Title: …"), then a blank line and the posting's text. */
export function postingWithDetails(details: JobDetails, text: string): string {
  const lines = LABELS.flatMap(([field, label]) => (details[field] === undefined ? [] : [`${label}: ${details[field]}`]));
  return lines.length === 0 ? text : `${lines.join("\n")}\n\n${text}`;
}
