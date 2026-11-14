import { describe, expect, it } from "vitest";
import { formatElapsed } from "./utils";

describe("formatElapsed", () => {
  it("formats seconds as MMmSSs", () => {
    expect(formatElapsed(0)).toBe("00m00s");
    expect(formatElapsed(59)).toBe("00m59s");
    expect(formatElapsed(125)).toBe("02m05s");
    expect(formatElapsed(1800)).toBe("30m00s");
    expect(formatElapsed(6005)).toBe("100m05s");
  });
});
