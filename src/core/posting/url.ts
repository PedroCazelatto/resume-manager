// Which links the app may fetch a posting from (Art. V.10): http and https only, and never
// an address on this computer or a private network. Pure checks; the fetcher resolves the
// name and calls `isPublicAddress` on every address it gets.

export type LinkCheck = { ok: true; url: URL } | { ok: false; reason: string };

export const NOT_A_LINK = "This is not a link. It must start with http:// or https://.";
export const PRIVATE_ADDRESS = "This link leads to this computer or a private network, which the app doesn't fetch.";

/** Reads a link as an http or https URL. */
export function parseLink(link: string): LinkCheck {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return { ok: false, reason: NOT_A_LINK };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http and https links are accepted." };
  }
  return { ok: true, url };
}

/**
 * A website as an http or https address, or undefined. A page's company website is untrusted
 * input: only such an address may become a link, since it can't run script (Art. II.7, F46).
 */
export function webAddress(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = parseLink(value);
  return parsed.ok ? parsed.url.href : undefined;
}

/** The host of a URL as a plain name or address: no brackets, no trailing dot, lowercase. */
export function hostOf(url: URL): string {
  return url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

/**
 * A link the server may fetch: http or https, and not written with a loopback, private or
 * link-local address. A name still has to be resolved and each address checked.
 */
export function checkPostingUrl(link: string): LinkCheck {
  const parsed = parseLink(link);
  if (!parsed.ok) return parsed;
  const host = hostOf(parsed.url);
  if (host === "localhost" || host.endsWith(".localhost")) return { ok: false, reason: PRIVATE_ADDRESS };
  if (isIpAddress(host) && !isPublicAddress(host)) return { ok: false, reason: PRIVATE_ADDRESS };
  return parsed;
}

export function isIpAddress(host: string): boolean {
  return parseIpv4(host) !== null || parseIpv6(host) !== null;
}

/**
 * False for loopback, private, link-local and other addresses that aren't on the public
 * internet, and for anything that isn't an IP address.
 */
export function isPublicAddress(address: string): boolean {
  const v4 = parseIpv4(address);
  if (v4) return isPublicIpv4(v4);
  const v6 = parseIpv6(address);
  return v6 !== null && isPublicIpv6(v6);
}

function parseIpv4(text: string): number[] | null {
  const parts = text.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) return null;
  const bytes = parts.map(Number);
  return bytes.every((byte) => byte <= 255) ? bytes : null;
}

function isPublicIpv4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false; // "this" network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // shared address space (carrier NAT)
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && c === 0) return false; // protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  return a < 224; // multicast, reserved and broadcast
}

/** The eight 16-bit groups of an IPv6 address, or null. A zone (`%en0`) is ignored. */
function parseIpv6(text: string): number[] | null {
  let address = text.split("%")[0];
  if (!address.includes(":")) return null;
  // An IPv4 tail (::ffff:10.0.0.1) is two groups.
  const lastColon = address.lastIndexOf(":");
  const tail = address.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    const hex = (high: number, low: number) => ((high << 8) | low).toString(16);
    address = `${address.slice(0, lastColon + 1)}${hex(v4[0], v4[1])}:${hex(v4[2], v4[3])}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const groups = (half: string) => (half === "" ? [] : half.split(":"));
  const head = groups(halves[0]);
  const rest = halves.length === 2 ? groups(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const all = [...head, ...Array<string>(missing).fill("0"), ...rest];
  if (!all.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return null;
  return all.map((group) => parseInt(group, 16));
}

function isPublicIpv6(groups: number[]): boolean {
  const embedded = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
  const zeros = (from: number, to: number) => groups.slice(from, to).every((group) => group === 0);
  // ::, ::1 and the forms that carry an IPv4 address: ::a.b.c.d, ::ffff:a.b.c.d, 64:ff9b::a.b.c.d.
  if (zeros(0, 5) && (groups[5] === 0 || groups[5] === 0xffff)) return isPublicIpv4(embedded);
  if (groups[0] === 0x64 && groups[1] === 0xff9b && zeros(2, 6)) return isPublicIpv4(embedded);
  if ((groups[0] & 0xfe00) === 0xfc00) return false; // unique local
  if ((groups[0] & 0xffc0) === 0xfe80) return false; // link-local
  if ((groups[0] & 0xffc0) === 0xfec0) return false; // site-local (old)
  return (groups[0] & 0xff00) !== 0xff00; // multicast
}
