import { INDEED_BLOCKED, isIndeedUrl } from "./sites";
import { checkPostingUrl } from "./url";

// A list of posting links, one per line (F33). Every line is checked before anything is
// queued: one line that can't be fetched refuses the whole list.

/** A line that can't be queued: its number in the text as given, counting blank lines, and why. */
export interface RefusedLine {
  line: number;
  text: string;
  reason: string;
}

export type LinkList = { ok: true; urls: string[] } | { ok: false; refused: RefusedLine[] };

/**
 * Reads the links of a list, in the order given. Blank lines are ignored and a link given
 * twice is kept once, where it came first. Each link must be one the server may fetch.
 */
export function readLinks(lines: readonly string[]): LinkList {
  const urls: string[] = [];
  const refused: RefusedLine[] = [];
  lines.forEach((given, index) => {
    const text = given.trim();
    if (text === "") return;
    const checked = checkPostingUrl(text);
    if (!checked.ok) refused.push({ line: index + 1, text, reason: checked.reason });
    else if (isIndeedUrl(checked.url)) refused.push({ line: index + 1, text, reason: INDEED_BLOCKED });
    else if (!urls.includes(checked.url.href)) urls.push(checked.url.href);
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
