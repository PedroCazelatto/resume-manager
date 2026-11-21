import { describe, expect, it } from "vitest";
import { languageName } from "./languages";

describe("languages", () => {
  it("names languages in English", () => {
    expect([languageName("en"), languageName("pt"), languageName("ga")]).toEqual(["English", "Portuguese", "Irish"]);
  });
});
