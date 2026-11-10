import { describe, expect, it } from "vitest";
import { resumeStatus, verificationSchema, type Failure, type Verification } from "./schema";

const failure: Failure = {
  check: "review",
  where: "experience[0].bullets[0]",
  claim: "Led a team of 12.",
  problem: "The file doesn't state a team size.",
  dismissed: false,
};

function verification(overrides: Partial<Verification> = {}): Verification {
  return {
    checked_at: "2026-11-10T10:06:00.000Z",
    review: { reviewed_at: "2026-11-10T10:09:00.000Z", model: "fake-model", current: true },
    failures: [],
    ...overrides,
  };
}

const inference = (status: "pending" | "approved" | "rejected") => ({
  skill: "Kubernetes",
  sources: ["experience/2023-01-acme-senior-developer.md"],
  reason: "EKS is managed Kubernetes.",
  status,
});

describe("verificationSchema", () => {
  it("accepts a verification with and without a model review", () => {
    expect(verificationSchema.safeParse(verification({ failures: [failure] })).success).toBe(true);
    expect(verificationSchema.safeParse(verification({ review: undefined })).success).toBe(true);
  });

  it("rejects an unknown check", () => {
    const bad = verification({ failures: [{ ...failure, check: "guess" as Failure["check"] }] });

    expect(verificationSchema.safeParse(bad).success).toBe(false);
  });
});

describe("resumeStatus", () => {
  it("is ready when the review is current, nothing failed and no skill is pending", () => {
    expect(resumeStatus({ inferences: [inference("approved"), inference("rejected")] }, verification())).toBe("ready");
  });

  it("is a draft while there is no verification or no current model review", () => {
    expect(resumeStatus({ inferences: [] }, null)).toBe("draft");
    expect(resumeStatus({ inferences: [] }, verification({ review: undefined }))).toBe("draft");
    expect(
      resumeStatus(
        { inferences: [] },
        verification({ review: { reviewed_at: "2026-11-10T10:09:00.000Z", model: "fake-model", current: false } }),
      ),
    ).toBe("draft");
  });

  it("is a draft while a failure is not dismissed", () => {
    expect(resumeStatus({ inferences: [] }, verification({ failures: [failure] }))).toBe("draft");
    expect(resumeStatus({ inferences: [] }, verification({ failures: [{ ...failure, dismissed: true }] }))).toBe("ready");
  });

  it("is a draft while an implied skill is pending", () => {
    expect(resumeStatus({ inferences: [inference("pending")] }, verification())).toBe("draft");
  });
});
