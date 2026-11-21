import { describe, expect, it } from "vitest";
import { applicationFolderName, isApplicationId, isDatedApplicationId, isUuidApplicationId } from "./folder";

const UUID = "3f2b8c1e-5a7d-4c9e-9b1a-2d6e8f0c4a73";

describe("applicationFolderName (F50)", () => {
  it("is the UUID handed in, in lowercase", () => {
    expect(applicationFolderName(UUID)).toBe(UUID);
    expect(applicationFolderName(UUID.toUpperCase())).toBe(UUID);
  });

  it.each(["2026-11-09-globex-backend-engineer", "../x", `${UUID}/x`, ""])("refuses %j", (name) => {
    expect(() => applicationFolderName(name)).toThrow("named by a UUID");
  });
});

describe("isApplicationId", () => {
  it.each([UUID, "2026-11-09-globex-backend-engineer", "2026-11-09-globex-dev-2"])("accepts %s", (id) => {
    expect(isApplicationId(id)).toBe(true);
  });

  it.each([
    "../2026-11-09-x",
    "2026-11-09",
    "2026-11-09-Globex",
    "2026-11-09-a/b",
    "globex-dev",
    "",
    UUID.toUpperCase(),
    `../${UUID}`,
    `${UUID}/..`,
    UUID.slice(1),
    `${UUID}-2`,
  ])("rejects %j", (id) => {
    expect(isApplicationId(id)).toBe(false);
  });

  it("tells a new UUID name from an older dated one", () => {
    expect([isUuidApplicationId(UUID), isDatedApplicationId(UUID)]).toEqual([true, false]);
    expect([isUuidApplicationId("2026-11-09-globex-dev"), isDatedApplicationId("2026-11-09-globex-dev")]).toEqual([false, true]);
  });
});
