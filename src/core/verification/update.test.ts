import { describe, expect, it } from "vitest";
import type { Failure, Verification } from "./schema";
import { withChecks, withFullVerification } from "./update";

const number: Failure = {
  check: "deterministic",
  where: "summary",
  claim: "7 years of experience.",
  problem: "the number 7 isn't in summary.md",
  dismissed: false,
};
const claim: Failure = {
  check: "review",
  where: "experience[0].bullets[0]",
  claim: "Led a team.",
  problem: "The file doesn't mention leading a team.",
  dismissed: false,
};
const review = { reviewed_at: "2026-11-10T10:09:00.000Z", model: "fake-model", current: true };
const LATER = "2026-11-10T11:00:00.000Z";

function previous(failures: Failure[]): Verification {
  return { checked_at: "2026-11-10T10:06:00.000Z", review, failures, my_note: "keep me" };
}

describe("withChecks", () => {
  it("replaces the deterministic failures, keeps the review's, and marks the review as out of date", () => {
    const fixed = withChecks(previous([number, claim]), [], LATER, true);

    expect(fixed).toEqual({
      checked_at: LATER,
      review: { ...review, current: false },
      failures: [claim],
      my_note: "keep me",
    });
  });

  it("keeps the review current when the content didn't change", () => {
    expect(withChecks(previous([]), [], LATER, false).review?.current).toBe(true);
  });

  it("keeps the dismissal of a failure that is found again", () => {
    const other = { ...number, where: "experience[0].bullets[0]" };

    const result = withChecks(previous([{ ...number, dismissed: true }]), [number, other], LATER, true);

    expect(result.failures.map((f) => f.dismissed)).toEqual([true, false]);
  });

  it("starts a verification when there was none", () => {
    expect(withChecks(null, [number], LATER, true)).toEqual({ checked_at: LATER, failures: [number] });
  });
});

describe("withFullVerification", () => {
  it("replaces every failure and records the new review", () => {
    const fresh = { ...review, reviewed_at: LATER };

    const result = withFullVerification(previous([number, claim]), [], LATER, fresh);

    expect(result).toEqual({ checked_at: LATER, review: fresh, failures: [], my_note: "keep me" });
  });

  it("keeps a dismissed review failure when the model flags the same claim in other words", () => {
    const again = { ...claim, problem: "Nothing in the file says she led a team." };

    const result = withFullVerification(previous([{ ...claim, dismissed: true }]), [again], LATER, review);

    expect(result.failures).toEqual([{ ...again, dismissed: true }]);
  });
});
