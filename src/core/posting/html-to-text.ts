import { NodeType, parse, type HTMLElement, type Node } from "node-html-parser";

// Turns a job page into the text handed to the model (Art. V.10): no scripts, styles,
// navigation or other boilerplate, one line per block.

const REMOVED = "script, style, noscript, nav, header, footer, aside, form, svg";

const BLOCKS = new Set(
  "address article blockquote br dd div dl dt fieldset figcaption figure h1 h2 h3 h4 h5 h6 hr li main ol p pre section table tbody td th thead tr ul".split(
    " ",
  ),
);

/** Where LinkedIn's public job page keeps the description; the rest of the page is other jobs. */
const LINKEDIN_DESCRIPTION = ".show-more-less-html__markup";

export interface HtmlToTextOptions {
  /** The page is on linkedin.com: take the description from its known element when it is there. */
  linkedIn?: boolean;
}

/** The readable text of an HTML page; empty when it has none. */
export function htmlToText(html: string, options: HtmlToTextOptions = {}): string {
  const root = parse(html);
  // Read before <header> and the rest are removed; on LinkedIn it names the role and the company.
  const title = lines(root.querySelector("title")?.text ?? "");
  for (const element of root.querySelectorAll(REMOVED)) element.remove();

  if (options.linkedIn) {
    const description = root.querySelector(LINKEDIN_DESCRIPTION);
    const text = description ? lines(textOf(description)) : "";
    // The description alone doesn't say who is hiring, so the page's title goes above it.
    if (text !== "") return title === "" ? text : `${title}\n${text}`;
  }
  const content = root.querySelector("main") ?? root.querySelector("article") ?? root.querySelector("body") ?? root;
  return lines(textOf(content));
}

/** The node's text on one line, with a line break around every block inside it. */
function textOf(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return node.text.replace(/\s+/g, " ");
  if (node.nodeType !== NodeType.ELEMENT_NODE) return "";
  const element = node as HTMLElement;
  const inner = element.childNodes.map(textOf).join("");
  const tag = element.tagName?.toLowerCase();
  if (tag === "li") return `\n- ${inner}\n`;
  return BLOCKS.has(tag) ? `\n${inner}\n` : inner;
}

/** Collapses the whitespace of each line and drops the empty ones. */
function lines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "" && line !== "-")
    .join("\n");
}
