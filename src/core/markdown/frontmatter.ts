import { parseDocument } from "yaml";

export type FrontmatterResult =
  | { ok: true; data: Record<string, unknown>; body: string }
  | { ok: false; problem: string };

const OPENING = /^---[ \t]*\r?\n/;
const CLOSING = /^---[ \t]*(?:\r?\n|$)/m;

/**
 * Splits a Markdown file into its YAML frontmatter and body (Art. IV.1–2).
 * The file must start with a `---` line and the frontmatter must be a mapping.
 */
export function parseFrontmatter(source: string): FrontmatterResult {
  const text = source.startsWith("﻿") ? source.slice(1) : source;

  const opening = OPENING.exec(text);
  if (!opening) {
    return { ok: false, problem: "missing YAML frontmatter: the file must start with a `---` line" };
  }

  const rest = text.slice(opening[0].length);
  const closing = CLOSING.exec(rest);
  if (!closing) {
    return { ok: false, problem: "unclosed YAML frontmatter: add a `---` line after the fields" };
  }

  const yamlText = rest.slice(0, closing.index);
  const body = rest.slice(closing.index + closing[0].length);

  const doc = parseDocument(yamlText, { prettyErrors: false });
  const error = doc.errors[0];
  if (error) {
    // +1 for the opening `---` line.
    const line = yamlText.slice(0, error.pos[0]).split("\n").length + 1;
    return { ok: false, problem: `invalid YAML on line ${line}: ${error.message}` };
  }

  const data: unknown = doc.toJS() ?? {};
  if (typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, problem: "frontmatter must be a list of `field: value` lines" };
  }

  return { ok: true, data: data as Record<string, unknown>, body };
}
