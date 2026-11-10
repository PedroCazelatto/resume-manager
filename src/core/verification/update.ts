import type { Failure, Verification } from "./schema";

// Re-running verification on an existing application (Art. II.5): dismissals of failures
// that are found again are kept, so a false alarm is dismissed only once.

function key(failure: Failure): string {
  // The model words the same problem differently each time, so its problem text is not part of the key.
  const parts = [failure.check, failure.where, failure.claim, failure.check === "deterministic" ? failure.problem : ""];
  return JSON.stringify(parts);
}

function carryDismissals(previous: Verification | null, found: Failure[]): Failure[] {
  const dismissed = new Set((previous?.failures ?? []).filter((f) => f.dismissed).map(key));
  return found.map((failure) => (dismissed.has(key(failure)) ? { ...failure, dismissed: true } : failure));
}

/**
 * After resume.md is saved: replaces the deterministic failures with the new ones. The
 * model review's failures stay, and the review stops being current when the content changed.
 */
export function withChecks(
  previous: Verification | null,
  found: Failure[],
  checkedAt: string,
  contentChanged: boolean,
): Verification {
  const review = previous?.review;
  return {
    ...previous,
    checked_at: checkedAt,
    ...(review ? { review: { ...review, current: review.current && !contentChanged } } : {}),
    failures: [...carryDismissals(previous, found), ...(previous?.failures ?? []).filter((f) => f.check === "review")],
  };
}

/** After both checks ran on the current content: replaces every failure. */
export function withFullVerification(
  previous: Verification | null,
  found: Failure[],
  checkedAt: string,
  review: NonNullable<Verification["review"]>,
): Verification {
  return { ...previous, checked_at: checkedAt, review, failures: carryDismissals(previous, found) };
}
