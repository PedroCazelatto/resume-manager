import { describe, expect, it } from "vitest";
import type { Verification } from "../verification/schema";
import { printBlockers } from "./print";
import type { Inference } from "./schema";

const REVIEWED: Verification = {
  checked_at: "2026-11-10T16:00:00Z",
  review: { reviewed_at: "2026-11-10T16:05:00Z", model: "fake-model", current: true },
  failures: [],
};
const skill = (status: Inference["status"]): Inference => ({ skill: "Kubernetes", sources: ["experience/a.md"], reason: "EKS", status });
const failure = (dismissed: boolean) => ({ check: "review" as const, where: "summary", claim: "x", problem: "y", dismissed });

describe("printBlockers (Art. VI.7)", () => {
  it("has nothing once the review is current, every failure dismissed and no skill pending", () => {
    expect(printBlockers({ inferences: [skill("approved"), skill("rejected")] }, { ...REVIEWED, failures: [failure(true)] })).toEqual([]);
  });

  it("names pending implied skills, open failures and an outdated or missing review", () => {
    expect(
      printBlockers(
        { inferences: [skill("pending"), skill("pending")] },
        { ...REVIEWED, review: { ...REVIEWED.review!, current: false }, failures: [failure(false), failure(true)] },
      ),
    ).toEqual([
      "you approve or reject 2 implied skills",
      "1 failed check is fixed or dismissed",
      "the model review has run on the current content",
    ]);
    expect(printBlockers({ inferences: [skill("pending")] }, { ...REVIEWED, failures: [failure(false), failure(false)] })).toEqual([
      "you approve or reject 1 implied skill",
      "2 failed checks are fixed or dismissed",
    ]);
    expect(printBlockers({ inferences: [] }, null)).toEqual(["the model review has run on the current content"]);
  });
});
