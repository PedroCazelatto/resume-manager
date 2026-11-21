import { jobKey } from "./sites";
import { checkPostingUrl } from "./url";

// A list of posting links, one per line (F33). Every line is checked before anything is
// queued: one line that isn't a link the server may fetch refuses the whole list. An Indeed
// link is accepted: it becomes a run that asks for its text, without any request (F47).

/** A line that can't be queued: its number in the text as given, counting blank lines, and why. */
export interface RefusedLine {
  line: number;
  text: string;
  reason: string;
}

export type LinkList = { ok: true; urls: string[] } | { ok: false; refused: RefusedLine[] };

/**
 * Reads the links of a list, in the order given. Blank lines are ignored and a link given
 * twice is kept once, where it came first; two links to the same LinkedIn job are the same
 * link (F47). Each link must be one the server may fetch.
 */
export function readLinks(lines: readonly string[]): LinkList {
  const urls: string[] = [];
  const jobs = new Set<string>();
  const refused: RefusedLine[] = [];
  lines.forEach((given, index) => {
    const text = given.trim();
    if (text === "") return;
    const checked = checkPostingUrl(text);
    if (!checked.ok) refused.push({ line: index + 1, text, reason: checked.reason });
    else if (!jobs.has(jobKey(checked.url))) {
      jobs.add(jobKey(checked.url));
      urls.push(checked.url.href);
    }
  });
  return refused.length > 0 ? { ok: false, refused } : { ok: true, urls };
}

/** The lines of what was typed in the "From links" tab. */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** Names every refused line, one per line of the message. */
export function refusedMessage(refused: readonly RefusedLine[]): string {
  return ["Nothing was queued.", ...refused.map(({ line, text, reason }) => `Line ${line} (${text}): ${reason}`)].join("\n");
}
