import { describe, expect, it } from "vitest";
import { applicationFolderName, isApplicationId, slugify, withCollisionSuffix } from "./folder";

describe("slugify", () => {
  it.each([
    ["Globex Corporation", "globex-corporation"],
    ["São Paulo Café", "sao-paulo-cafe"],
    ["Senior Backend Engineer (Remote, EU)", "senior-backend-engineer-remote-eu"],
    ["  --C++ / Node.js--  ", "c-node-js"],
    ["株式会社", ""],
  ])("%j → %j", (text, slug) => {
    expect(slugify(text)).toBe(slug);
  });

  it("caps long names without leaving a trailing dash", () => {
    const slug = slugify("Principal ".repeat(10));

    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("applicationFolderName", () => {
  it("joins the date, company and role", () => {
    expect(applicationFolderName("2026-11-09", "Globex", "Backend Engineer")).toBe(
      "2026-11-09-globex-backend-engineer",
    );
  });

  it("falls back to placeholders when a name has no ASCII letters", () => {
    expect(applicationFolderName("2026-11-09", "株式会社", "エンジニア")).toBe("2026-11-09-company-role");
  });
});

describe("withCollisionSuffix", () => {
  it("adds -2, -3… after the first attempt", () => {
    expect([1, 2, 3].map((n) => withCollisionSuffix("2026-11-09-globex-dev", n))).toEqual([
      "2026-11-09-globex-dev",
      "2026-11-09-globex-dev-2",
      "2026-11-09-globex-dev-3",
    ]);
  });
});

describe("isApplicationId", () => {
  it.each(["2026-11-09-globex-backend-engineer", "2026-11-09-globex-dev-2"])("accepts %s", (id) => {
    expect(isApplicationId(id)).toBe(true);
  });

  it.each(["../2026-11-09-x", "2026-11-09", "2026-11-09-Globex", "2026-11-09-a/b", "globex-dev", ""])(
    "rejects %j",
    (id) => {
      expect(isApplicationId(id)).toBe(false);
    },
  );
});
