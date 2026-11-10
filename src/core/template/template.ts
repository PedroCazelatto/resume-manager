import Handlebars from "handlebars";
import type { FileError } from "../markdown/validate";

// Country resume templates: templates/<country>.html (constitution Art. VII).

export interface ResumeTemplate {
  country: string;
  /** The HTML without the rules block, ready to fill with Handlebars. */
  layout: string;
  /** Writing rules for the model, from <script type="text/markdown" id="rules">. Never rendered. */
  rules: string;
  /** From <meta name="max-pages">; no limit when absent. */
  maxPages?: number;
}

export type ParseTemplateResult = { ok: true; template: ResumeTemplate } | { ok: false; error: FileError };

const SCRIPT_BLOCK = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const META_TAG = /<meta\b([^>]*)>/gi;
const ATTRIBUTE = /([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function attributes(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [, name, double, single] of text.matchAll(ATTRIBUTE)) result[name.toLowerCase()] = double ?? single;
  return result;
}

/** Template files are named after the country in kebab-case, e.g. `ireland`. */
export function isCountryName(name: string): boolean {
  return /^[a-z]+(?:-[a-z]+)*$/.test(name);
}

export function parseTemplate(country: string, file: string, html: string): ParseTemplateResult {
  const problems: string[] = [];

  const rulesBlocks = [...html.matchAll(SCRIPT_BLOCK)].filter(([, attrs]) => {
    const a = attributes(attrs);
    return a.type === "text/markdown" && a.id === "rules";
  });
  if (rulesBlocks.length === 0) {
    problems.push('missing the rules block: <script type="text/markdown" id="rules">…</script>');
  } else if (rulesBlocks.length > 1) {
    problems.push("has more than one rules block");
  }
  const rules = rulesBlocks[0]?.[2].trim() ?? "";
  if (rulesBlocks.length === 1 && rules === "") problems.push("the rules block is empty");

  let maxPages: number | undefined;
  const maxPagesTags = [...html.matchAll(META_TAG)].map(([, attrs]) => attributes(attrs)).filter((a) => a.name === "max-pages");
  if (maxPagesTags.length > 1) problems.push('has more than one <meta name="max-pages">');
  if (maxPagesTags.length === 1) {
    const content = maxPagesTags[0].content ?? "";
    if (/^[1-9]\d*$/.test(content)) maxPages = Number(content);
    else problems.push(`max-pages must be a whole number of pages, e.g. <meta name="max-pages" content="1">`);
  }

  // Keep line breaks where the rules block was, so Handlebars errors point at the right line.
  const layout = html.replace(SCRIPT_BLOCK, (block, attrs: string) => {
    const a = attributes(attrs);
    return a.type === "text/markdown" && a.id === "rules" ? "\n".repeat(block.split("\n").length - 1) : block;
  });
  try {
    Handlebars.parse(layout);
  } catch (error) {
    const lines = (error instanceof Error ? error.message : String(error)).split("\n");
    const detail = lines.length > 1 ? `${lines[0]} ${lines[lines.length - 1]}` : lines[0];
    problems.push(`invalid Handlebars: ${detail}`);
  }

  if (problems.length > 0) return { ok: false, error: { file, problems } };
  return { ok: true, template: { country, layout, rules, ...(maxPages ? { maxPages } : {}) } };
}
