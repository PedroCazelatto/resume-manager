import { describe, expect, it } from "vitest";
import { ISO_639_1, isLanguageCode, languageName } from "./languages";

describe("languages", () => {
  it("lists the 183 current ISO 639-1 codes once each", () => {
    expect(ISO_639_1).toHaveLength(183);
    expect(new Set(ISO_639_1).size).toBe(183);
  });

  it.each(["en", "pt", "ga"])("accepts %s", (code) => expect(isLanguageCode(code)).toBe(true));
  it.each(["EN", "eng", "xx", ""])("rejects %j", (code) => expect(isLanguageCode(code)).toBe(false));

  it("names languages in English", () => {
    expect([languageName("en"), languageName("pt"), languageName("ga")]).toEqual(["English", "Portuguese", "Irish"]);
  });
});
