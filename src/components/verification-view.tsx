import { setFailureDismissed } from "@/app/applications/[id]/actions";
import { Button } from "@/components/ui/button";
import type { Verification } from "@/core/verification/schema";

const CHECK_LABELS: Record<Verification["failures"][number]["check"], string> = {
  deterministic: "Names, dates and numbers",
  review: "Model review",
};

/** What verification found; each failure stays until it is fixed or dismissed (Art. II.5, F15, F17). */
export function VerificationView({ id, verification }: { id: string; verification: Verification }) {
  const open = verification.failures.filter((f) => !f.dismissed).length;
  return (
    <section className="space-y-2">
      <h2 className="font-medium">Verification</h2>
      <p className="text-sm text-muted-foreground">
        {verification.failures.length === 0
          ? "Every claim was checked against your profile and nothing failed."
          : `${open} of ${verification.failures.length} failed checks still open. Fix the resume or your profile, or dismiss a false alarm.`}
        {verification.review ? ` · ${verification.review.model}` : ""}
      </p>
      {!verification.review?.current && (
        <p className="text-sm text-destructive">
          The model review {verification.review ? "is older than the resume's current content" : "has not run yet"}.
        </p>
      )}
      <ul className="space-y-3 text-sm">
        {verification.failures.map((failure, index) => (
          <li key={index} className={failure.dismissed ? "text-muted-foreground" : undefined}>
            <div>
              <strong>{failure.problem}</strong>
              {failure.dismissed && " · dismissed"}
            </div>
            <div>{failure.claim}</div>
            <div className="font-mono text-xs text-muted-foreground">
              {CHECK_LABELS[failure.check]} · {failure.where}
            </div>
            <form action={setFailureDismissed.bind(null, id, index, failure.where, !failure.dismissed)} className="mt-1">
              <Button type="submit" variant="outline" size="sm">
                {failure.dismissed ? "Restore" : "Dismiss as a false alarm"}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
