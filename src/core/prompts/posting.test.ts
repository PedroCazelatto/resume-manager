import { describe, expect, it } from "vitest";
import { postingWithDetails } from "./posting";

describe("postingWithDetails (F46)", () => {
  it("puts the known details above the text, one per line, in a fixed order", () => {
    expect(postingWithDetails({ hours: "Full-time", title: "Backend Engineer", company_url: "https://globex.example/", company: "Globex" }, "We build.")).toBe(
      "Title: Backend Engineer\nCompany: Globex\nHours: Full-time\n\nWe build.",
    );
  });

  it("leaves the text as it is without details", () => {
    expect(postingWithDetails({}, "We build.")).toBe("We build.");
    expect(postingWithDetails({ company_url: "https://globex.example/" }, "We build.")).toBe("We build.");
  });
});
