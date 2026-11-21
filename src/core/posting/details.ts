import { parse, type HTMLElement } from "node-html-parser";
import type { JobDetails } from "../application/schemas";
import { pageText, type HtmlToTextOptions } from "./html-to-text";
import { webAddress } from "./url";

// A job posting's details read from its page's HTML before the model runs (F46, Art. VI.2):
// the schema.org `JobPosting` data a page keeps in `<script type="application/ld+json">`.
// The page is untrusted input (Art. II.7): every value is plain text on one line, and the
// company's website is kept only as an http or https address.

/** What a posting's page gives: its description as text, and the details it holds. */
export interface PostingPage {
  text: string;
  details: JobDetails;
}

/**
 * Reads a posting's page: the details its `JobPosting` data holds, and its text. The text is
 * LinkedIn's description element on LinkedIn, otherwise the `JobPosting` description, otherwise
 * the page's main area (`htmlToText`).
 */
export function readPostingPage(html: string, options: Pick<HtmlToTextOptions, "linkedIn"> = {}): PostingPage {
  const root = parse(html);
  // Read before the page's text, which drops every script.
  const posting = findJobPosting(jsonLd(root));
  const description = posting === null ? undefined : stringOf(posting.description);
  return {
    details: posting === null ? {} : jobPostingDetails(posting),
    text: pageText(root, { ...options, description }),
  };
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

/** A value that may be given once or as a list, as a list. */
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);

/** Every JSON-LD block of the page that parses; one that doesn't is left out. */
function jsonLd(root: HTMLElement): unknown[] {
  return root
    .querySelectorAll("script")
    .filter((script) => script.getAttribute("type")?.trim().toLowerCase() === "application/ld+json")
    .flatMap((script) => {
      try {
        return [JSON.parse(script.rawText) as unknown];
      } catch {
        return [];
      }
    });
}

const isJobPosting = (value: JsonObject) =>
  listOf(value["@type"]).some((type) => typeof type === "string" && /(?:^|[/:#])JobPosting$/.test(type.trim()));

/** The first `JobPosting` in the blocks, at any depth (in a list, a `@graph` or a page's `mainEntity`), or null. */
function findJobPosting(blocks: unknown[]): JsonObject | null {
  const queue = [...blocks];
  while (queue.length > 0) {
    const value = queue.shift();
    if (Array.isArray(value)) queue.push(...value);
    else if (isObject(value)) {
      if (isJobPosting(value)) return value;
      queue.push(...Object.values(value));
    }
  }
  return null;
}

/** A text value as it is written, or undefined: a string (or a number), the first of a list. */
function stringOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(stringOf).find((text) => text !== undefined);
  return undefined;
}

/** A value as plain text on one line: entities decoded, tags and extra whitespace dropped; undefined when empty. */
function plainText(value: unknown): string | undefined {
  const text = stringOf(value);
  if (text === undefined) return undefined;
  const plain = parse(text).text.replace(/\s+/g, " ").trim();
  return plain === "" ? undefined : plain;
}

/** Distinct values, compared without case, in the order given. */
function distinct(values: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    if (value === undefined || seen.has(value.toLowerCase())) return false;
    seen.add(value.toLowerCase());
    return true;
  });
}

/** The details a `JobPosting` holds, each left out when it doesn't hold it. */
export function jobPostingDetails(posting: JsonObject): JobDetails {
  const organization = listOf(posting.hiringOrganization).find((org) => isObject(org) || typeof org === "string");
  const details: JobDetails = {
    title: plainText(posting.title),
    company: isObject(organization) ? plainText(organization.name) : plainText(organization),
    company_url: isObject(organization)
      ? [...listOf(organization.sameAs), ...listOf(organization.url)].map(webAddress).find((url) => url !== undefined)
      : undefined,
    location: locationOf(posting),
    salary: salaryOf(posting),
    work_model: listOf(posting.jobLocationType).some((type) => plainText(type)?.toUpperCase() === "TELECOMMUTE") ? "remote" : undefined,
    hours: plainText(posting.workHours) ?? hoursOf(posting.employmentType),
  };
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined)) as JobDetails;
}

/**
 * Where the job is: each `jobLocation` as its town, region and country, the places joined by
 * "; ". A job without one may name where its applicants must live instead
 * (`applicantLocationRequirements`, for a remote job).
 */
function locationOf(posting: JsonObject): string | undefined {
  const places = distinct(listOf(posting.jobLocation).map(placeText));
  const areas = places.length > 0 ? places : distinct(listOf(posting.applicantLocationRequirements).map(areaName));
  return areas.length > 0 ? areas.join("; ") : undefined;
}

function placeText(place: unknown): string | undefined {
  if (!isObject(place)) return plainText(place);
  const address = place.address;
  if (isObject(address)) {
    const parts = distinct([plainText(address.addressLocality), plainText(address.addressRegion), areaName(address.addressCountry)]);
    if (parts.length > 0) return parts.join(", ");
  }
  return plainText(address) ?? plainText(place.name);
}

/** A country or region, written as its name or as an object with one. */
const areaName = (area: unknown): string | undefined => (isObject(area) ? plainText(area.name) : plainText(area));

const UNITS: Record<string, string> = { HOUR: "an hour", DAY: "a day", WEEK: "a week", MONTH: "a month", YEAR: "a year" };

/**
 * The salary, written from `baseSalary`: an amount or a range in its currency, and the period
 * it is paid for, e.g. "€60,000–€70,000 a year". A range with one end only reads "From …" or
 * "Up to …".
 */
function salaryOf(posting: JsonObject): string | undefined {
  const base = posting.baseSalary;
  const currency = plainText(isObject(base) ? base.currency : undefined) ?? plainText(posting.salaryCurrency);
  if (!isObject(base)) return amountText(base, currency);
  if (!isObject(base.value)) return amountText(base.value, currency);
  const { value, minValue, maxValue, unitText } = base.value;
  const [exact, min, max] = [value, minValue, maxValue].map((amount) => amountText(amount, currency));
  const range =
    exact ?? (min && max ? (min === max ? min : `${min}–${max}`) : min ? `From ${min}` : max ? `Up to ${max}` : undefined);
  if (range === undefined) return undefined;
  const unit = plainText(unitText);
  return unit === undefined ? range : `${range} ${UNITS[unit.toUpperCase()] ?? unit}`;
}

/** An amount in its currency ("€60,000"); one that isn't a number is kept as it is written. */
function amountText(amount: unknown, currency: string | undefined): string | undefined {
  const written = plainText(amount);
  if (written === undefined) return undefined;
  const number = typeof amount === "number" ? amount : Number(written);
  if (!Number.isFinite(number)) return written;
  if (currency !== undefined) {
    try {
      return new Intl.NumberFormat("en", { style: "currency", currency, trailingZeroDisplay: "stripIfInteger" }).format(number);
    } catch {
      // Not a currency code: the number, then the currency as it is written.
    }
  }
  const plain = new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(number);
  return currency === undefined ? plain : `${plain} ${currency}`;
}

/** Full-time or part-time, from `employmentType`; the other types (contract, internship, …) say nothing about the hours. */
function hoursOf(employmentType: unknown): string | undefined {
  const hours = distinct(
    listOf(employmentType).map((type) => {
      const name = plainText(type)?.toUpperCase().replace(/[^A-Z]/g, "");
      return name === "FULLTIME" ? "Full-time" : name === "PARTTIME" ? "Part-time" : undefined;
    }),
  );
  return hours.length > 0 ? hours.join(", ") : undefined;
}
