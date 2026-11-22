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
  /**
   * The job's description as the page gives it in its data (schema.org `JobPosting`, F46): used
   * before the page's main area when it has text.
   */
  description?: string;
}

/** The readable text of an HTML page; empty when it has none. */
export function htmlToText(html: string, options: HtmlToTextOptions = {}): string {
  return pageText(parse(html), options);
}

/**
 * `htmlToText` for a page already parsed. It removes the page's scripts and other boilerplate.
 * On LinkedIn the description element alone is the text: the job's title and company are read
 * from the page's top card instead of its `<title>` (F46).
 */
export function pageText(root: HTMLElement, options: HtmlToTextOptions = {}): string {
  for (const element of root.querySelectorAll(REMOVED)) element.remove();

  if (options.linkedIn) {
    const description = root.querySelector(LINKEDIN_DESCRIPTION);
    const text = description ? lines(textOf(description)) : "";
    if (text !== "") return text;
  }
  const described = options.description === undefined ? "" : descriptionText(options.description);
  if (described !== "") return described;
  const content = root.querySelector("main") ?? root.querySelector("article") ?? root.querySelector("body") ?? root;
  return lines(textOf(content));
}

/** An HTML start or end tag, as text. */
const TAG = /<\/?[a-z][a-z0-9]*\b[^>]*>/i;

const hasElements = (root: HTMLElement) => root.childNodes.some((node) => node.nodeType === NodeType.ELEMENT_NODE);

/**
 * The text of a description a page gives as data: HTML, HTML escaped once more (`&lt;p&gt;`),
 * or plain text, whose lines are kept. Scripts and the other boilerplate are dropped.
 */
export function descriptionText(description: string): string {
  let root = parse(description);
  if (!hasElements(root) && TAG.test(root.text)) root = parse(root.text);
  if (!hasElements(root)) return lines(root.text);
  for (const element of root.querySelectorAll(REMOVED)) element.remove();
  return lines(textOf(root));
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
